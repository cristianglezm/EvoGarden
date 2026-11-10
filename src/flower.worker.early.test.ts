// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { DEFAULT_SIM_PARAMS } from './constants';

// The simulation worker does not wait for a flower worker to be ready: it sends the parameters and
// the first requests as soon as it has the port, while the wasm service is still starting (and the
// more workers start together, the longer that takes). What arrives early must wait for the service
// and be done in order, not throw "FlowerService has not been initialized".
type Message = { type: string; payload: any };
const messages: Message[] = [];
const errors: unknown[] = [];
let started: Promise<unknown>;

beforeAll(async () => {
    (globalThis as any).self = globalThis;
    (globalThis as any).reportError = (error: unknown) => {
        errors.push(error);
    };
    const { flowerService } = await import('./services/flowerService');
    // The service starts only when the gate opens, after the early messages were heard: in node the wasm
    // starts too fast to lose the race by itself.
    let open!: () => void;
    const gate = new Promise<void>(resolve => {
        open = resolve;
    });
    const initialize = flowerService.initialize.bind(flowerService);
    vi.spyOn(flowerService, 'initialize').mockImplementationOnce(async () => {
        await gate;
        return initialize();
    });
    await import('./flower.worker');
    const channel = new MessageChannel();
    channel.port2.onmessage = (e: MessageEvent) => {
        messages.push(e.data);
    };
    // not awaited: the messages go in while the service starts
    started = (globalThis as any).onmessage({ data: { type: 'init-ports', payload: { simWorkerPort: channel.port1, roles: ['creation'] } } });
    channel.port2.postMessage({ type: 'update-params', payload: DEFAULT_SIM_PARAMS });
    for (const n of [1, 2, 3]) {
        channel.port2.postMessage({ type: 'request-flower', payload: { requestId: `r${n}`, flowerId: `f${n}`, x: n, y: 0 } });
    }
    await new Promise(resolve => setTimeout(resolve, 150));
    open();
}, 60_000);

describe('the flower worker while it starts', () => {
    it('takes the parameters and the requests that came before it was ready, in order, and fails at nothing', async () => {
        await started;
        await expect.poll(() => messages.length, { timeout: 30_000 }).toBe(3);
        expect(messages.map(m => m.type)).toEqual(['flower-created', 'flower-created', 'flower-created']);
        expect(messages.map(m => m.payload.requestId)).toEqual(['r1', 'r2', 'r3']);
        expect(errors).toEqual([]);
    }, 60_000);
});
