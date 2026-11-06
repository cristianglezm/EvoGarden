// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { DEFAULT_SIM_PARAMS } from './constants';

// When the wasm service cannot start, the player must be told (the simulation says a critical
// component failed): waiting for it must not turn into doing nothing, silently, for ever.
type Message = { type: string; payload: any };
const messages: Message[] = [];
const errors: any[] = [];
let started: Promise<unknown>;

beforeAll(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (globalThis as any).self = globalThis;
    (globalThis as any).reportError = (error: unknown) => { errors.push(error); };
    const { flowerService } = await import('./services/flowerService');
    vi.spyOn(flowerService, 'initialize').mockRejectedValue(new Error('no wasm here'));
    await import('./flower.worker');
    const channel = new MessageChannel();
    channel.port2.onmessage = (e: MessageEvent) => { messages.push(e.data); };
    started = (globalThis as any).onmessage({ data: { type: 'init-ports', payload: { simWorkerPort: channel.port1, roles: ['creation'] } } });
    channel.port2.postMessage({ type: 'update-params', payload: DEFAULT_SIM_PARAMS });
    channel.port2.postMessage({ type: 'request-flower', payload: { requestId: 'r1', flowerId: 'f1', x: 1, y: 0 } });
    channel.port2.postMessage({ type: 'update-params', payload: DEFAULT_SIM_PARAMS });
});

describe('the flower worker whose service cannot start', () => {
    it('reports it once, as an error of the worker, and makes no flowers', async () => {
        await started;
        await expect.poll(() => errors.length, { timeout: 10_000 }).toBe(1);
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(errors).toHaveLength(1);
        expect(String(errors[0].message)).toMatch(/could not start/i);
        expect(messages).toEqual([]);
    }, 30_000);
});
