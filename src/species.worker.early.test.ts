// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { FEService } from '@cristianglezm/flower-evolver-wasm';

// The simulation does not wait for the worker to be ready: what it sends while the wasm service
// starts must not be lost, nor answered out of order.
type Message = { type: string; payload: any };
const messages: Message[] = [];
let genomes: string[] = [];
let toWorker: MessagePort;
let started: Promise<unknown>;

beforeAll(async () => {
    const service = new FEService();
    await service.init();
    for (let i = 0; i < 3; i++) genomes.push((await service.makeFlower()).genome);

    (globalThis as any).self = globalThis;
    await import('./species.worker');
    const channel = new MessageChannel();
    toWorker = channel.port2;
    channel.port2.onmessage = (e: MessageEvent) => { messages.push(e.data); };
    // not awaited: the messages go in while the service starts
    started = (globalThis as any).onmessage({ data: { type: 'init-ports', payload: { simWorkerPort: channel.port1 } } });
    for (const [i, flowerId] of ['x', 'y', 'z'].entries()) {
        toWorker.postMessage({ type: 'classify-flower', payload: { flowerId, genome: genomes[i], sex: 'both', age: 1, toxicity: 0, tick: 1 } });
    }
}, 60_000);

describe('the species worker while it starts', () => {
    it('does what it was asked, in the order it was asked', async () => {
        await started;
        await expect.poll(() => messages.length, { timeout: 30_000 }).toBe(3);
        expect(messages.map(m => m.payload.flowerId)).toEqual(['x', 'y', 'z']);
    }, 60_000);
});
