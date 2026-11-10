import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AsyncFlowerFactory } from './asyncFlowerFactory';
import { DEFAULT_SIM_PARAMS } from '../constants';

describe('AsyncFlowerFactory messages', () => {
    let factory: AsyncFlowerFactory;
    let port: { postMessage: ReturnType<typeof vi.fn>; onmessage: ((e: { data: unknown }) => void) | null };
    const receive = (type: string, payload: unknown) => port.onmessage!({ data: { type, payload } });

    beforeEach(() => {
        factory = new AsyncFlowerFactory();
        port = { postMessage: vi.fn(), onmessage: null };
        factory.setFlowerWorkerPort(port as unknown as MessagePort, DEFAULT_SIM_PARAMS);
    });

    it('gives a listener the payload of the messages of its type', () => {
        const listener = vi.fn();
        factory.onMessage('species-classified', listener);
        receive('species-classified', { flowerId: 'a' });
        expect(listener).toHaveBeenCalledExactlyOnceWith({ flowerId: 'a' });
    });

    it('ignores a message nobody listens to', () => {
        expect(() => receive('something-else', {})).not.toThrow();
    });

    it('keeps the messages about flowers for itself', () => {
        const listener = vi.fn();
        factory.onMessage('flower-created', listener);
        receive('flower-created', { requestId: 'r1', flower: null });
        expect(listener).not.toHaveBeenCalled();
        expect(factory.getCompletedFlowers(new Map())).toEqual({ flowersToAdd: [], seedsToRemove: [] });
    });

    it('posts a species message to the worker that has the role', () => {
        factory.postToSpeciesWorker({ type: 'classify-flower', payload: { flowerId: 'a' } });
        expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'classify-flower', payload: { flowerId: 'a' } });
    });

    it('posts nothing before it has a port', () => {
        expect(() => new AsyncFlowerFactory().postToSpeciesWorker({ type: 'x' })).not.toThrow();
    });
});

describe('AsyncFlowerFactory with several workers', () => {
    type FakePort = { postMessage: ReturnType<typeof vi.fn>; onmessage: ((e: { data: unknown }) => void) | null };
    const fakePort = (): FakePort => ({ postMessage: vi.fn(), onmessage: null });
    const asPort = (p: FakePort) => p as unknown as MessagePort;
    const sent = (p: FakePort, type: string) => p.postMessage.mock.calls.map(c => c[0]).filter(m => m.type === type);
    const receive = (p: FakePort, type: string, payload: unknown) => p.onmessage!({ data: { type, payload } });
    const getNextId = (type: string, x: number, y: number) => `${type}-${x}-${y}`;

    let factory: AsyncFlowerFactory;
    let a: FakePort, b: FakePort, species: FakePort;
    const request = (x: number) => factory.requestNewFlower(new Map(), x, 0, undefined, undefined, getNextId);

    beforeEach(() => {
        factory = new AsyncFlowerFactory();
        factory.setStemImage('stem');
        a = fakePort();
        b = fakePort();
        species = fakePort();
    });

    describe('creation', () => {
        beforeEach(() => {
            factory.setWorkerPorts(
                [
                    { port: asPort(a), roles: ['creation'] },
                    { port: asPort(b), roles: ['creation'] },
                ],
                DEFAULT_SIM_PARAMS
            );
        });

        it('gives a request to the worker with the fewest in flight, the first one on a tie', () => {
            request(1);
            request(2);
            request(3);
            expect(sent(a, 'request-flower').map(m => m.payload.requestId)).toEqual(['seed-1-0', 'seed-3-0']);
            expect(sent(b, 'request-flower').map(m => m.payload.requestId)).toEqual(['seed-2-0']);
        });

        it('gives the next request to the worker that just finished one', () => {
            request(1);
            request(2);
            request(3);
            request(4); // a: 1, 3; b: 2, 4
            receive(b, 'flower-created', { requestId: 'seed-2-0', flower: null });
            receive(b, 'flower-created', { requestId: 'seed-4-0', flower: null });
            request(5);
            expect(sent(b, 'request-flower').map(m => m.payload.requestId)).toEqual(['seed-2-0', 'seed-4-0', 'seed-5-0']);
        });

        it('takes the result from whichever worker made it', () => {
            request(1);
            request(2);
            expect(factory.getPendingRequestCount()).toBe(2);
            receive(b, 'flower-creation-failed', { requestId: 'seed-2-0' });
            receive(a, 'flower-created', { requestId: 'seed-1-0', flower: null });
            expect(factory.getPendingRequestCount()).toBe(0);
        });

        it('asks only the worker that holds a request to cancel it', () => {
            request(1);
            request(2);
            factory.cancelFlowerRequest('seed-2-0');
            expect(sent(b, 'cancel-flower-request')).toEqual([{ type: 'cancel-flower-request', payload: { requestId: 'seed-2-0' } }]);
            expect(sent(a, 'cancel-flower-request')).toEqual([]);
            expect(factory.getPendingRequestCount()).toBe(1);
        });

        it('counts a cancelled request as free for the worker that held it', () => {
            request(1);
            request(2);
            factory.cancelFlowerRequest('seed-2-0');
            request(3);
            expect(sent(b, 'request-flower').map(m => m.payload.requestId)).toEqual(['seed-2-0', 'seed-3-0']);
        });

        it('asks nobody to cancel a request that already finished', () => {
            request(1);
            receive(a, 'flower-created', { requestId: 'seed-1-0', flower: null });
            factory.cancelFlowerRequest('seed-1-0');
            expect(sent(a, 'cancel-flower-request')).toEqual([]);
        });

        it('cancels everything in every worker, and forgets what was in flight', () => {
            request(1);
            request(2);
            factory.reset();
            expect(sent(a, 'cancel-all-requests')).toHaveLength(1);
            expect(sent(b, 'cancel-all-requests')).toHaveLength(1);
            expect(factory.getPendingRequestCount()).toBe(0);
            request(3);
            expect(sent(a, 'request-flower').map(m => m.payload.requestId)).toEqual(['seed-1-0', 'seed-3-0']);
        });

        it('sends the parameters to every worker that makes flowers, at once and when they change', () => {
            expect(sent(a, 'update-params')).toHaveLength(1);
            expect(sent(b, 'update-params')).toHaveLength(1);
            factory.updateParams({ ...DEFAULT_SIM_PARAMS, flowerDetailRadius: 16 });
            expect(sent(a, 'update-params')).toHaveLength(2);
            expect(sent(b, 'update-params')).toHaveLength(2);
        });

        it('keeps the count of a worker that is set again, so the balance goes on', () => {
            request(1);
            request(2); // a: 1, b: 1
            request(3); // a: 2
            factory.setWorkerPorts(
                [
                    { port: asPort(a), roles: ['creation'] },
                    { port: asPort(b), roles: ['creation'] },
                ],
                DEFAULT_SIM_PARAMS
            );
            request(4);
            expect(sent(b, 'request-flower').map(m => m.payload.requestId)).toEqual(['seed-2-0', 'seed-4-0']);
            expect(factory.getPendingRequestCount()).toBe(4);
        });

        it('lets go the requests of a worker that is no longer there', () => {
            request(1);
            request(2);
            factory.setWorkerPorts([{ port: asPort(a), roles: ['creation'] }], DEFAULT_SIM_PARAMS);
            expect(factory.getPendingRequestCount()).toBe(1);
            expect(b.onmessage).toBeNull();
            request(3);
            expect(sent(b, 'request-flower')).toHaveLength(1);
        });
    });

    describe('the species work', () => {
        const message = { type: 'classify-flower', payload: { flowerId: 'f' } };

        it('goes to a worker that only does species, whatever the others', async () => {
            factory.setWorkerPorts(
                [
                    { port: asPort(a), roles: ['creation', 'species'] },
                    { port: asPort(species), roles: ['species'] },
                ],
                DEFAULT_SIM_PARAMS
            );
            factory.postToSpeciesWorker(message);
            await Promise.resolve();
            expect(sent(species, 'species-batch')).toHaveLength(1);
            expect(sent(a, 'species-batch')).toEqual([]);
        });

        it('goes to the worker that makes flowers when none does only species', () => {
            factory.setWorkerPorts(
                [
                    { port: asPort(a), roles: ['creation', 'species'] },
                    { port: asPort(b), roles: ['creation'] },
                ],
                DEFAULT_SIM_PARAMS
            );
            factory.postToSpeciesWorker(message);
            expect(sent(a, 'classify-flower')).toHaveLength(1);
            expect(sent(b, 'classify-flower')).toEqual([]);
        });

        it('goes nowhere when no worker has the role', () => {
            factory.setWorkerPorts([{ port: asPort(a), roles: ['creation'] }], DEFAULT_SIM_PARAMS);
            factory.postToSpeciesWorker(message);
            expect(sent(a, 'classify-flower')).toEqual([]);
        });

        it('is not given the flower requests, nor the parameters, but is told to cancel', () => {
            factory.setWorkerPorts(
                [
                    { port: asPort(a), roles: ['creation'] },
                    { port: asPort(species), roles: ['species'] },
                ],
                DEFAULT_SIM_PARAMS
            );
            request(1);
            factory.updateParams(DEFAULT_SIM_PARAMS);
            expect(sent(species, 'request-flower')).toEqual([]);
            expect(sent(species, 'update-params')).toEqual([]);
            factory.reset();
            expect(sent(species, 'cancel-all-requests')).toHaveLength(1);
        });

        it('is heard like any other worker', () => {
            factory.setWorkerPorts(
                [
                    { port: asPort(a), roles: ['creation'] },
                    { port: asPort(species), roles: ['species'] },
                ],
                DEFAULT_SIM_PARAMS
            );
            const listener = vi.fn();
            factory.onMessage('species-classified', listener);
            receive(species, 'species-classified', { flowerId: 'f' });
            expect(listener).toHaveBeenCalledExactlyOnceWith({ flowerId: 'f' });
        });
    });

    describe('without a worker that makes flowers', () => {
        it('cannot make a flower, and says so', () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            factory.setWorkerPorts([{ port: asPort(species), roles: ['species'] }], DEFAULT_SIM_PARAMS);
            expect(request(1)).toBeNull();
            expect(sent(species, 'request-flower')).toEqual([]);
        });
    });
});

describe('AsyncFlowerFactory stats', () => {
    type FakePort = { postMessage: ReturnType<typeof vi.fn>; onmessage: ((e: { data: unknown }) => void) | null };
    const fakePort = (): FakePort => ({ postMessage: vi.fn(), onmessage: null });
    const asPort = (p: FakePort) => p as unknown as MessagePort;
    const getNextId = (type: string, x: number, y: number) => `${type}-${x}-${y}`;
    const created = (p: FakePort, n: number, durationMs?: number) =>
        p.onmessage!({ data: { type: 'flower-created', payload: { requestId: `seed-${n}-0`, flower: { id: `flower-${n}-0` }, durationMs } } });

    let clock = 0;
    let factory: AsyncFlowerFactory;
    let a: FakePort, b: FakePort, species: FakePort;
    const request = (n: number) => factory.requestNewFlower(new Map(), n, 0, undefined, undefined, getNextId);

    beforeEach(() => {
        clock = 0;
        factory = new AsyncFlowerFactory(() => clock);
        factory.setStemImage('stem');
        a = fakePort();
        b = fakePort();
        species = fakePort();
        factory.setWorkerPorts(
            [
                { port: asPort(a), roles: ['creation'] },
                { port: asPort(b), roles: ['creation'] },
            ],
            DEFAULT_SIM_PARAMS
        );
    });

    it('names the workers by their order, and says nobody does the species when nobody does', () => {
        const stats = factory.getStats();
        expect(stats.flowerWorkers.map(w => w.name)).toEqual(['Flower worker 1', 'Flower worker 2']);
        expect(stats.speciesWorker).toBeNull();
    });

    it('names the worker that does the species: its own, or the first flower worker', () => {
        factory.setWorkerPorts(
            [
                { port: asPort(a), roles: ['creation'] },
                { port: asPort(species), roles: ['species'] },
            ],
            DEFAULT_SIM_PARAMS
        );
        expect(factory.getStats().speciesWorker).toBe('Species worker');
        expect(factory.getStats().flowerWorkers.map(w => w.name)).toEqual(['Flower worker 1']);
        factory.setWorkerPorts(
            [
                { port: asPort(a), roles: ['creation', 'species'] },
                { port: asPort(b), roles: ['creation'] },
            ],
            DEFAULT_SIM_PARAMS
        );
        expect(factory.getStats().speciesWorker).toBe('Flower worker 1');
    });

    it('counts what each worker has in flight, produced and failed', () => {
        request(1);
        request(2);
        request(3);
        created(a, 1, 40);
        b.onmessage!({ data: { type: 'flower-creation-failed', payload: { requestId: 'seed-2-0' } } });
        const [first, second] = factory.getStats().flowerWorkers;
        expect(first).toMatchObject({ inFlight: 1, produced: 1, failed: 0 });
        expect(second).toMatchObject({ inFlight: 0, produced: 0, failed: 1 });
        expect(factory.getStats()).toMatchObject({ produced: 1, failed: 1 });
    });

    it('counts a flower that did not come as a failure, not as a flower', () => {
        request(1);
        a.onmessage!({ data: { type: 'flower-created', payload: { requestId: 'seed-1-0', flower: null } } });
        expect(factory.getStats()).toMatchObject({ produced: 0, failed: 1 });
    });

    it('averages the milliseconds the worker reported, over the last 50 flowers', () => {
        expect(factory.getStats().flowerWorkers[0].avgMs).toBeNull();
        for (let n = 0; n < 60; n++) {
            request(n * 2);
            created(a, n * 2, n < 10 ? 1000 : 10);
        }
        // the 10 slow ones are out of the last 50
        expect(factory.getStats().flowerWorkers[0].avgMs).toBe(10);
    });

    it('does not average a flower that came without a duration', () => {
        request(1);
        request(3);
        created(a, 1, 30);
        created(a, 3, undefined);
        expect(factory.getStats().flowerWorkers[0]).toMatchObject({ produced: 2, avgMs: 30 });
    });

    it('counts the seeds whose flower was thrown away because the seed was gone', () => {
        request(1);
        request(2);
        request(3);
        created(a, 1, 10);
        created(b, 2, 10);
        b.onmessage!({ data: { type: 'flower-creation-failed', payload: { requestId: 'seed-3-0' } } });
        const seeds = new Map<string, any>([['seed-1-0', { type: 'flowerSeed', age: 1 }]]);
        factory.getCompletedFlowers(seeds);
        // seed 1 is there; seed 2 is gone and its flower is lost; seed 3 had no flower to lose
        expect(factory.getStats().seedsDiscarded).toBe(1);
    });

    describe('flowers per second', () => {
        it('counts the last 10 seconds', () => {
            clock = 1000;
            request(1);
            request(2);
            created(a, 1);
            created(b, 2);
            clock = 9000;
            for (const n of [3, 4, 5, 6]) {
                request(n);
                created(a, n);
            }
            clock = 10000;
            expect(factory.getStats().flowersPerSecond).toBeCloseTo(0.6);
            clock = 15000;
            expect(factory.getStats().flowersPerSecond).toBeCloseTo(0.4);
            clock = 60000;
            expect(factory.getStats().flowersPerSecond).toBe(0);
        });

        it('does not call a rate a tenth of what it is in the first second', () => {
            clock = 500;
            request(1);
            created(a, 1);
            expect(factory.getStats().flowersPerSecond).toBe(1);
        });
    });

    describe('the seeds that die while their flower is made', () => {
        it('counts every cancel, whether the request was still waiting or had already finished', () => {
            request(1);
            request(2);
            created(a, 1, 10);
            factory.cancelFlowerRequest('seed-1-0');
            factory.cancelFlowerRequest('seed-2-0');
            factory.cancelFlowerRequest('seed-unknown-0');
            expect(factory.getStats().seedsCancelled).toBe(3);
        });

        it('says a flower that was thrown away after a cancel came too late, because it was already made', () => {
            request(1);
            created(a, 1, 10);
            factory.cancelFlowerRequest('seed-1-0');
            factory.getCompletedFlowers(new Map());
            expect(factory.getStats()).toMatchObject({ seedsDiscarded: 1, discardedAfterCancel: 1 });
        });

        it('says a flower that was thrown away with no cancel at all had no reason the engine gave', () => {
            request(1);
            created(a, 1, 10);
            factory.getCompletedFlowers(new Map());
            expect(factory.getStats()).toMatchObject({ seedsDiscarded: 1, discardedAfterCancel: 0 });
        });

        it('does not count a flower that was placed, even if its seed was cancelled', () => {
            request(1);
            created(a, 1, 10);
            factory.cancelFlowerRequest('seed-1-0');
            factory.getCompletedFlowers(new Map<string, any>([['seed-1-0', { type: 'flowerSeed', age: 1 }]]));
            expect(factory.getStats()).toMatchObject({ seedsDiscarded: 0, discardedAfterCancel: 0, seedsCancelled: 1 });
        });

        it('forgets the cancels with the stats: a flower that comes after a new count is not blamed on an old cancel', () => {
            request(1);
            created(a, 1, 10);
            factory.cancelFlowerRequest('seed-1-0');
            factory.resetStats();
            factory.getCompletedFlowers(new Map());
            expect(factory.getStats()).toMatchObject({ seedsDiscarded: 1, discardedAfterCancel: 0, seedsCancelled: 0 });
        });

        it('remembers the cancels of the last 5,000 requests, not for ever', () => {
            for (let n = 0; n < 5001; n++) factory.cancelFlowerRequest(`seed-old-${n}`);
            request(1);
            created(a, 1, 10);
            factory.getCompletedFlowers(new Map());
            // the id of this one was never cancelled
            expect(factory.getStats().discardedAfterCancel).toBe(0);
            // the oldest of the 5,001 was forgotten, the newest was not
            a.onmessage!({ data: { type: 'flower-created', payload: { requestId: 'seed-old-0', flower: { id: 'x' }, durationMs: 1 } } });
            a.onmessage!({ data: { type: 'flower-created', payload: { requestId: 'seed-old-5000', flower: { id: 'y' }, durationMs: 1 } } });
            factory.getCompletedFlowers(new Map());
            expect(factory.getStats()).toMatchObject({ seedsDiscarded: 3, discardedAfterCancel: 1 });
        });
    });

    it('starts again from zero with a new game, and when a game is loaded', () => {
        clock = 2000;
        request(1);
        created(a, 1, 30);
        factory.getCompletedFlowers(new Map());
        expect(factory.getStats()).toMatchObject({ produced: 1, seedsDiscarded: 1 });
        factory.cancelFlowerRequest('seed-1-0');
        factory.reset();
        expect(factory.getStats()).toMatchObject({
            produced: 0,
            failed: 0,
            seedsDiscarded: 0,
            seedsCancelled: 0,
            discardedAfterCancel: 0,
            flowersPerSecond: 0,
        });
        expect(factory.getStats().flowerWorkers[0]).toMatchObject({ produced: 0, avgMs: null });

        clock = 3000;
        request(2);
        created(a, 2, 30);
        factory.resetStats();
        expect(factory.getStats().produced).toBe(0);
    });

    it('forgets the stats of a worker that is gone', () => {
        request(1);
        created(a, 1, 10);
        factory.setWorkerPorts([{ port: asPort(b), roles: ['creation'] }], DEFAULT_SIM_PARAMS);
        expect(factory.getStats().flowerWorkers.map(w => w.name)).toEqual(['Flower worker 1']);
        expect(factory.getStats().flowerWorkers[0].produced).toBe(0);
    });
});

describe('AsyncFlowerFactory: the requests that wait for a worker', () => {
    type FakePort = { postMessage: ReturnType<typeof vi.fn>; onmessage: ((e: { data: unknown }) => void) | null };
    const fakePort = (): FakePort => ({ postMessage: vi.fn(), onmessage: null });
    const asPort = (p: FakePort) => p as unknown as MessagePort;
    const sent = (p: FakePort, type: string) => p.postMessage.mock.calls.map(c => c[0]).filter(m => m.type === type);
    const ids = (p: FakePort) => sent(p, 'request-flower').map(m => m.payload.requestId);
    const getNextId = (type: string, x: number, y: number) => `${type}-${x}-${y}`;
    const done = (p: FakePort, n: number, flower: unknown = { id: `flower-${n}-0` }) =>
        p.onmessage!({ data: { type: 'flower-created', payload: { requestId: `seed-${n}-0`, flower, durationMs: 10 } } });

    let factory: AsyncFlowerFactory;
    let a: FakePort, b: FakePort, species: FakePort;
    const request = (n: number) => factory.requestNewFlower(new Map(), n, 0, undefined, undefined, getNextId);

    beforeEach(() => {
        factory = new AsyncFlowerFactory();
        factory.setStemImage('stem');
        a = fakePort();
        b = fakePort();
        species = fakePort();
        factory.setWorkerPorts(
            [
                { port: asPort(a), roles: ['creation'] },
                { port: asPort(b), roles: ['creation'] },
            ],
            DEFAULT_SIM_PARAMS
        );
    });

    it('gives each worker two requests at a time, and keeps the rest', () => {
        for (let n = 1; n <= 5; n++) request(n);
        expect(ids(a)).toEqual(['seed-1-0', 'seed-3-0']);
        expect(ids(b)).toEqual(['seed-2-0', 'seed-4-0']);
        expect(factory.getStats().flowerWorkers.map(w => w.inFlight)).toEqual([2, 2]);
        expect(factory.getStats().queued).toBe(1);
    });

    it('still counts what waits as pending, so the total the player sees is the same', () => {
        for (let n = 1; n <= 7; n++) request(n);
        expect(factory.getPendingRequestCount()).toBe(7);
        expect(factory.getStats().queued).toBe(3);
    });

    it('sends the next one, in the order they were asked, to the worker that just finished', () => {
        for (let n = 1; n <= 6; n++) request(n);
        done(b, 2);
        expect(ids(b)).toEqual(['seed-2-0', 'seed-4-0', 'seed-5-0']);
        done(a, 1);
        expect(ids(a)).toEqual(['seed-1-0', 'seed-3-0', 'seed-6-0']);
        expect(factory.getStats().queued).toBe(0);
    });

    it('takes a request that failed as a free place too', () => {
        for (let n = 1; n <= 5; n++) request(n);
        a.onmessage!({ data: { type: 'flower-creation-failed', payload: { requestId: 'seed-1-0' } } });
        expect(ids(a)).toEqual(['seed-1-0', 'seed-3-0', 'seed-5-0']);
    });

    it('does not send a request that was cancelled while it waited, nor tell any worker about it', () => {
        for (let n = 1; n <= 5; n++) request(n);
        factory.cancelFlowerRequest('seed-5-0');
        expect(sent(a, 'cancel-flower-request')).toEqual([]);
        expect(sent(b, 'cancel-flower-request')).toEqual([]);
        expect(factory.getStats().queued).toBe(0);
        expect(factory.getPendingRequestCount()).toBe(4);
        done(a, 1);
        done(b, 2);
        expect(ids(a)).toEqual(['seed-1-0', 'seed-3-0']);
        expect(ids(b)).toEqual(['seed-2-0', 'seed-4-0']);
    });

    it('still asks the worker to cancel a request it holds', () => {
        for (let n = 1; n <= 5; n++) request(n);
        factory.cancelFlowerRequest('seed-2-0');
        expect(sent(b, 'cancel-flower-request')).toHaveLength(1);
        // and the place it held is free for the one that waited
        expect(ids(b)).toEqual(['seed-2-0', 'seed-4-0', 'seed-5-0']);
    });

    it('counts a cancel of a request that waited as a cancel, and its flower was never made, so nothing is lost', () => {
        for (let n = 1; n <= 5; n++) request(n);
        factory.cancelFlowerRequest('seed-5-0');
        expect(factory.getStats()).toMatchObject({ seedsCancelled: 1, seedsDiscarded: 0, discardedAfterCancel: 0 });
    });

    it('gives the requests that wait to a worker that is added', () => {
        for (let n = 1; n <= 7; n++) request(n);
        const c = fakePort();
        factory.setWorkerPorts(
            [
                { port: asPort(a), roles: ['creation'] },
                { port: asPort(b), roles: ['creation'] },
                { port: asPort(c), roles: ['creation'] },
            ],
            DEFAULT_SIM_PARAMS
        );
        expect(ids(c)).toEqual(['seed-5-0', 'seed-6-0']);
        expect(factory.getStats().queued).toBe(1);
        // its parameters first: a worker cannot make a flower without them
        expect(c.postMessage.mock.calls.map(call => call[0].type)).toEqual(['update-params', 'request-flower', 'request-flower']);
    });

    it('forgets the requests that wait with a new game', () => {
        for (let n = 1; n <= 6; n++) request(n);
        factory.reset();
        done(a, 1);
        expect(ids(a)).toEqual(['seed-1-0', 'seed-3-0']);
        expect(factory.getStats().queued).toBe(0);
        expect(factory.getPendingRequestCount()).toBe(0);
    });

    it('does not queue anything when no worker makes flowers, and says so', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        factory.setWorkerPorts([{ port: asPort(species), roles: ['species'] }], DEFAULT_SIM_PARAMS);
        expect(request(1)).toBeNull();
        expect(factory.getStats().queued).toBe(0);
        expect(factory.getPendingRequestCount()).toBe(0);
    });

    it('keeps the requests in the order they were asked when workers finish out of order', () => {
        for (let n = 1; n <= 8; n++) request(n);
        done(b, 4);
        done(a, 1);
        done(b, 2);
        done(a, 3);
        expect(ids(a).slice(2)).toEqual(['seed-6-0', 'seed-8-0']);
        expect(ids(b).slice(2)).toEqual(['seed-5-0', 'seed-7-0']);
    });

    it('can be told another number of requests at a time', () => {
        factory = new AsyncFlowerFactory(() => 0, { inFlightPerWorker: 1 });
        factory.setStemImage('stem');
        factory.setWorkerPorts([{ port: asPort(a), roles: ['creation'] }], DEFAULT_SIM_PARAMS);
        for (let n = 1; n <= 3; n++) request(n);
        expect(ids(a)).toEqual(['seed-1-0']);
        expect(factory.getStats().queued).toBe(2);
    });

    it('does not send a request twice when the same result arrives twice', () => {
        for (let n = 1; n <= 5; n++) request(n);
        done(a, 1);
        done(a, 1);
        expect(ids(a)).toEqual(['seed-1-0', 'seed-3-0', 'seed-5-0']);
    });
});

describe('AsyncFlowerFactory: the species work waits here, for a worker that is free', () => {
    type FakePort = { postMessage: ReturnType<typeof vi.fn>; onmessage: ((e: { data: unknown }) => void) | null };
    const fakePort = (): FakePort => ({ postMessage: vi.fn(), onmessage: null });
    const asPort = (p: FakePort) => p as unknown as MessagePort;
    const getNextId = (type: string, x: number, y: number) => `${type}-${x}-${y}`;
    const flush = () => Promise.resolve();
    const batches = (p: FakePort) =>
        p.postMessage.mock.calls
            .map(c => c[0])
            .filter(m => m.type === 'species-batch')
            .map(m => m.payload.jobs.map((j: any) => j.payload.flowerId));
    const sentTypes = (p: FakePort) => p.postMessage.mock.calls.map(c => c[0].type);
    const answer = (p: FakePort, id: string) => p.onmessage!({ data: { type: 'species-classified', payload: { flowerId: id, status: 'stored' } } });
    const job = (n: number, type = 'classify-flower') => ({ type, payload: { flowerId: `f${n}` } });
    const post = (from: number, to: number) => {
        for (let n = from; n <= to; n++) factory.postToSpeciesWorker(job(n));
    };
    const flowerRequest = (n: number) => factory.requestNewFlower(new Map(), n, 0, undefined, undefined, getNextId);
    const names = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `f${from + i}`);

    let factory: AsyncFlowerFactory;
    let a: FakePort, b: FakePort, d: FakePort;

    beforeEach(() => {
        factory = new AsyncFlowerFactory();
        factory.setStemImage('stem');
        a = fakePort();
        b = fakePort();
        d = fakePort();
        // two flower workers that can also classify, and one that only classifies
        factory.setWorkerPorts(
            [
                { port: asPort(a), roles: ['creation', 'species'] },
                { port: asPort(b), roles: ['creation', 'species'] },
                { port: asPort(d), roles: ['species'] },
            ],
            DEFAULT_SIM_PARAMS
        );
    });

    it('gives the worker that only classifies what waits, as one message, up to 32, in the order it came', async () => {
        post(1, 40);
        await flush();
        expect(batches(d)).toEqual([names(1, 32)]);
    });

    it('puts together what is asked in the same tick, instead of sending the first one alone', async () => {
        post(1, 5);
        await flush();
        expect(batches(d)).toEqual([names(1, 5)]);
    });

    it('sends the next batch when the worker has answered every job of the last, not before', async () => {
        // no flower worker can help here, so what is left waits for the one that only classifies
        factory.setWorkerPorts(
            [
                { port: asPort(a), roles: ['creation'] },
                { port: asPort(d), roles: ['species'] },
            ],
            DEFAULT_SIM_PARAMS
        );
        post(1, 40);
        await flush();
        for (let n = 1; n <= 31; n++) answer(d, `f${n}`);
        expect(batches(d)).toHaveLength(1);
        answer(d, 'f32');
        expect(batches(d)).toEqual([names(1, 32), names(33, 40)]);
    });

    it('gives a flower worker that is idle a batch of 8 when the one that only classifies is busy', async () => {
        post(1, 60);
        await flush();
        expect(batches(d)).toEqual([names(1, 32)]);
        expect(batches(a)).toEqual([names(33, 40)]);
        expect(batches(b)).toEqual([names(41, 48)]);
    });

    it('does not give it to a flower worker that has a flower to make, nor while flowers wait for a worker', async () => {
        flowerRequest(1); // a is making one
        post(1, 60);
        await flush();
        expect(batches(a)).toEqual([]);
        expect(batches(b)).toEqual([names(33, 40)]);

        for (let n = 2; n <= 8; n++) flowerRequest(n); // more than the workers hold: some wait
        post(61, 70);
        for (const id of names(33, 40)) answer(b, id);
        // b is free of species, but flowers wait for it: it makes them, and does not take more species
        expect(batches(b)).toHaveLength(1);
    });

    it('does not give flowers to a worker that is busy with a batch, and gives them back when it has answered', async () => {
        post(1, 60);
        await flush();
        flowerRequest(1);
        flowerRequest(2);
        flowerRequest(3);
        // a and b are classifying, d only classifies: nobody can make them yet
        expect(sentTypes(a)).not.toContain('request-flower');
        expect(sentTypes(b)).not.toContain('request-flower');
        expect(sentTypes(d)).not.toContain('request-flower');
        expect(factory.getStats().queued).toBe(3);

        for (const id of names(33, 40)) answer(a, id);
        expect(sentTypes(a).filter(t => t === 'request-flower')).toHaveLength(2);
        expect(factory.getStats().queued).toBe(1);
    });

    it('never gives a flower to the worker that only classifies', async () => {
        for (let n = 1; n <= 6; n++) flowerRequest(n);
        await flush();
        expect(sentTypes(d)).not.toContain('request-flower');
    });

    it('prefers the worker that only classifies to a flower worker when both are free', async () => {
        post(1, 5);
        await flush();
        expect(batches(d)).toEqual([names(1, 5)]);
        expect(batches(a)).toEqual([]);
    });

    it('does a lone worker that makes flowers and classifies, one job at a time and at once, as before', () => {
        factory.setWorkerPorts([{ port: asPort(a), roles: ['creation', 'species'] }], DEFAULT_SIM_PARAMS);
        factory.postToSpeciesWorker(job(1));
        factory.postToSpeciesWorker(job(2, 'record-flower'));
        expect(sentTypes(a).filter(t => t === 'classify-flower' || t === 'record-flower')).toEqual(['classify-flower', 'record-flower']);
        expect(sentTypes(a)).not.toContain('species-batch');
    });

    it('does the same when only one of several flower workers can classify', () => {
        factory.setWorkerPorts(
            [
                { port: asPort(a), roles: ['creation', 'species'] },
                { port: asPort(b), roles: ['creation'] },
            ],
            DEFAULT_SIM_PARAMS
        );
        factory.postToSpeciesWorker(job(1));
        expect(sentTypes(a)).toContain('classify-flower');
        expect(sentTypes(b)).not.toContain('classify-flower');
    });

    it('goes nowhere when no worker classifies', async () => {
        factory.setWorkerPorts([{ port: asPort(a), roles: ['creation'] }], DEFAULT_SIM_PARAMS);
        factory.postToSpeciesWorker(job(1));
        await flush();
        expect(sentTypes(a)).not.toContain('species-batch');
        expect(sentTypes(a)).not.toContain('classify-flower');
    });

    it('drops what waits with a new game, and counts the batch in hand as done', async () => {
        // nobody can help, so 8 of the 40 wait
        factory.setWorkerPorts(
            [
                { port: asPort(a), roles: ['creation'] },
                { port: asPort(d), roles: ['species'] },
            ],
            DEFAULT_SIM_PARAMS
        );
        post(1, 40);
        await flush();
        factory.reset();
        post(101, 103);
        await flush();
        // the worker that only classifies was told to cancel and is free again, and does not get the 8 that waited
        expect(batches(d)).toEqual([names(1, 32), ['f101', 'f102', 'f103']]);
    });

    it('gives the flowers out before the species work, so a flower worker that is idle makes the flower', async () => {
        // the worker that only classifies is busy, the flower worker is idle: both a flower and a job arrive
        factory.setWorkerPorts(
            [
                { port: asPort(a), roles: ['creation', 'species'] },
                { port: asPort(d), roles: ['species'] },
            ],
            DEFAULT_SIM_PARAMS
        );
        post(1, 1);
        await flush();
        post(2, 2);
        flowerRequest(1);
        expect(sentTypes(a)).toContain('request-flower');
        await flush();
        // and the job waits: the flower worker is making a flower now
        expect(batches(a)).toEqual([]);
    });

    it('does not count an answer nobody was waiting for', async () => {
        answer(d, 'stray');
        post(1, 3);
        await flush();
        expect(batches(d)).toEqual([names(1, 3)]);
    });

    it('still tells whoever listens about every answer', async () => {
        const listener = vi.fn();
        factory.onMessage('species-classified', listener);
        post(1, 2);
        await flush();
        answer(d, 'f1');
        expect(listener).toHaveBeenCalledWith({ flowerId: 'f1', status: 'stored' });
    });
});

describe('AsyncFlowerFactory: the species queue is bounded', () => {
    type FakePort = { postMessage: ReturnType<typeof vi.fn>; onmessage: ((e: { data: unknown }) => void) | null };
    const fakePort = (): FakePort => ({ postMessage: vi.fn(), onmessage: null });
    const sent = (p: FakePort, type: string) => p.postMessage.mock.calls.map(c => c[0]).filter(m => m.type === type);
    const classify = (n: number) => ({ type: 'classify-flower', payload: { flowerId: `f${n}`, tick: n } });
    const record = (n: number) => ({ type: 'record-flower', payload: { flowerId: `f${n}`, tick: n } });
    const ids = (messages: { payload?: unknown }[]) => messages.map(m => (m.payload as { flowerId: string }).flowerId);

    let species: FakePort;
    let dropped: { type: string; payload?: unknown }[];
    // a species worker that has not answered its first job: everything else waits
    const busyFactory = async (limit: number) => {
        const factory = new AsyncFlowerFactory(() => Date.now(), { speciesQueueLimit: limit });
        species = fakePort();
        dropped = [];
        factory.onSpeciesDropped(m => dropped.push(m));
        factory.setWorkerPorts([{ port: species as unknown as MessagePort, roles: ['species'] }], DEFAULT_SIM_PARAMS);
        factory.postToSpeciesWorker(classify(0));
        await Promise.resolve();
        expect(sent(species, 'species-batch')).toHaveLength(1);
        return factory;
    };

    it('keeps everything while the queue is within the limit', async () => {
        const factory = await busyFactory(3);
        for (let i = 1; i <= 3; i++) factory.postToSpeciesWorker(classify(i));
        await Promise.resolve();
        expect(dropped).toEqual([]);
    });

    it('lets 200 classifications wait unless told otherwise, and drops the oldest beyond that', async () => {
        const factory = new AsyncFlowerFactory();
        species = fakePort();
        dropped = [];
        factory.onSpeciesDropped(m => dropped.push(m));
        factory.setWorkerPorts([{ port: species as unknown as MessagePort, roles: ['species'] }], DEFAULT_SIM_PARAMS);
        // the first 32 go to the free worker, then 200 may wait
        for (let i = 1; i <= 232; i++) factory.postToSpeciesWorker(classify(i));
        await Promise.resolve();
        expect(dropped).toEqual([]);
        factory.postToSpeciesWorker(classify(233));
        await Promise.resolve();
        expect(ids(dropped)).toEqual(['f33']);
    });

    it('drops the oldest classifications when the queue is over the limit, and says which', async () => {
        const factory = await busyFactory(3);
        for (let i = 1; i <= 5; i++) factory.postToSpeciesWorker(classify(i));
        await Promise.resolve();
        expect(ids(dropped)).toEqual(['f1', 'f2']);
    });

    it('sends the newest ones when the worker is free again', async () => {
        const factory = await busyFactory(3);
        for (let i = 1; i <= 5; i++) factory.postToSpeciesWorker(classify(i));
        await Promise.resolve();
        species.onmessage!({ data: { type: 'species-classified', payload: { flowerId: 'f0', status: 'stored', tick: 0 } } });
        const batches = sent(species, 'species-batch');
        expect(batches).toHaveLength(2);
        expect(ids(batches[1].payload.jobs.map((j: { payload: unknown }) => j))).toEqual(['f3', 'f4', 'f5']);
    });

    it('keeps at least one waiting, whatever limit it is given', async () => {
        const factory = await busyFactory(0);
        factory.postToSpeciesWorker(classify(1));
        factory.postToSpeciesWorker(classify(2));
        await Promise.resolve();
        expect(ids(dropped)).toEqual(['f1']);
    });

    it('never drops a record, and keeps the order of what stays', async () => {
        const factory = await busyFactory(3);
        factory.postToSpeciesWorker(record(1));
        factory.postToSpeciesWorker(classify(2));
        factory.postToSpeciesWorker(record(3));
        factory.postToSpeciesWorker(classify(4));
        factory.postToSpeciesWorker(classify(5));
        await Promise.resolve();
        expect(dropped).toEqual([classify(2), classify(4)]);
        species.onmessage!({ data: { type: 'species-classified', payload: { flowerId: 'f0', status: 'stored', tick: 0 } } });
        expect(ids(sent(species, 'species-batch')[1].payload.jobs)).toEqual(['f1', 'f3', 'f5']);
    });

    it('lets the records grow past the limit when only records wait', async () => {
        const factory = await busyFactory(2);
        for (let i = 1; i <= 5; i++) factory.postToSpeciesWorker(record(i));
        await Promise.resolve();
        expect(dropped).toEqual([]);
    });

    it('trims what is left after the free worker took its batch, not before', async () => {
        const factory = new AsyncFlowerFactory(() => Date.now(), { speciesQueueLimit: 40 });
        species = fakePort();
        dropped = [];
        factory.onSpeciesDropped(m => dropped.push(m));
        factory.setWorkerPorts([{ port: species as unknown as MessagePort, roles: ['species'] }], DEFAULT_SIM_PARAMS);
        for (let i = 1; i <= 100; i++) factory.postToSpeciesWorker(classify(i));
        await Promise.resolve();
        // the worker takes the oldest 32; of the 68 that wait, 40 stay
        expect(ids(sent(species, 'species-batch')[0].payload.jobs)).toHaveLength(32);
        expect(dropped).toHaveLength(28);
        expect(ids(dropped)[0]).toBe('f33');
    });

    it('does not report the ones a new game threw away', async () => {
        const factory = await busyFactory(3);
        factory.postToSpeciesWorker(classify(1));
        factory.reset();
        await Promise.resolve();
        expect(dropped).toEqual([]);
    });

    it('does not trim the queue of a lone worker, which gets every message at once', () => {
        const factory = new AsyncFlowerFactory(() => Date.now(), { speciesQueueLimit: 1 });
        species = fakePort();
        factory.setWorkerPorts([{ port: species as unknown as MessagePort, roles: ['creation', 'species'] }], DEFAULT_SIM_PARAMS);
        for (let i = 1; i <= 5; i++) factory.postToSpeciesWorker(classify(i));
        expect(sent(species, 'classify-flower')).toHaveLength(5);
    });
});
