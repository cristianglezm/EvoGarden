import { describe, it, expect } from 'vitest';
import { describeWorkers, plannedSetupLine } from './workerReport';
import type { WorkersSummary } from '../types';

const summary = (over: Partial<WorkersSummary> = {}): WorkersSummary => ({
    flowerWorkers: [
        { name: 'Flower worker 1', inFlight: 7, produced: 120, failed: 0, avgMs: 48.4 },
        { name: 'Flower worker 2', inFlight: 6, produced: 118, failed: 2, avgMs: null },
    ],
    speciesWorker: 'Species worker',
    species: { waiting: 3, answered: 80, dropped: 4, byStatus: { stored: 70, discovered: 3, failed: 1, skipped: 6 }, avgMs: 26.4 },
    produced: 238,
    failed: 2,
    flowersPerSecond: 3.44,
    seedsDiscarded: 5,
    seedsCancelled: 40,
    discardedAfterCancel: 3,
    queued: 12,
    ...over,
});
const setup = { hardwareConcurrency: 8, speciesWorker: 'automatic', creationWorkers: 'address' } as const;

describe('plannedSetupLine', () => {
    it('says what will start, before the workers have said anything', () => {
        expect(plannedSetupLine({ speciesWorker: true, creationWorkers: 3 }, setup)).toBe('8 cores, 3 flower workers (address), species worker on (automatic)');
    });

    it('uses the singular, says off when there is no species worker, and does not know the cores when the browser did not say', () => {
        expect(plannedSetupLine({ speciesWorker: false, creationWorkers: 1 }, { speciesWorker: 'setting', creationWorkers: 'setting' })).toBe(
            'unknown cores, 1 flower worker (setting), species worker off (setting)'
        );
    });

    it('is the same text as the one the workers write about themselves once they report', () => {
        const reported = describeWorkers(summary({ flowerWorkers: [summary().flowerWorkers[0]], speciesWorker: 'Species worker' }), setup);
        expect(reported).toContain(`Setup: ${plannedSetupLine({ speciesWorker: true, creationWorkers: 1 }, setup)}`);
    });
});

describe('describeWorkers', () => {
    it('reports every worker, the totals and the setup, to be pasted into a review', () => {
        expect(describeWorkers(summary(), setup)).toBe(
            [
                'Workers',
                'Flower worker 1: 7 in flight, 120 produced, 0 failed, 48 ms per flower',
                'Flower worker 2: 6 in flight, 118 produced, 2 failed, no time yet',
                'Species worker: 3 waiting, 80 answered, 1 failed, 26 ms per flower',
                'Flowers waiting for a worker: 12',
                'Flowers produced: 238 (3.4 per second, last 10 s), seeds discarded: 5',
                'Seeds: 40 cancelled, 5 flowers thrown away (3 after a cancel came too late, 2 with no cancel)',
                'Species: discovered 3, stored 70, skipped 6, failed 1',
                'Species dropped from the queue (too many waiting): 4',
                'Setup: 8 cores, 2 flower workers (address), species worker on (automatic)',
            ].join('\n')
        );
    });

    it('says where the species work is done when it is not a worker of its own', () => {
        const text = describeWorkers(summary({ speciesWorker: 'Flower worker 1' }), setup);
        expect(text).toContain('Species work (in Flower worker 1): 3 waiting, 80 answered, 1 failed, 26 ms per flower');
    });

    it('says there is no time yet for the species before the first one was classified', () => {
        const text = describeWorkers(summary({ species: { waiting: 0, dropped: 0, answered: 0, byStatus: {}, avgMs: null } }), setup);
        expect(text).toContain('Species worker: 0 waiting, 0 answered, 0 failed, no time yet');
    });

    it('says the species worker is off when a flower worker does the species', () => {
        const text = describeWorkers(summary({ speciesWorker: 'Flower worker 1' }), setup);
        expect(text).toContain('species worker off (automatic)');
    });

    it('says nobody does the species work when nobody does', () => {
        const text = describeWorkers(summary({ speciesWorker: null, species: { waiting: 0, dropped: 0, answered: 0, byStatus: {}, avgMs: null } }), {
            ...setup,
            hardwareConcurrency: undefined,
        });
        expect(text).toContain('Species work: no worker');
        expect(text).toContain('Species: none yet');
        expect(text).toContain('species worker off (automatic)');
        expect(text).toContain('Setup: unknown cores,');
    });

    it('uses the singular for one flower worker, and says the player chose it or the machine did', () => {
        const one = summary({ flowerWorkers: [summary().flowerWorkers[0]] });
        expect(describeWorkers(one, { ...setup, creationWorkers: 'automatic' })).toContain('1 flower worker (automatic)');
        expect(describeWorkers(one, { ...setup, creationWorkers: 'setting', speciesWorker: 'setting' })).toContain(
            '1 flower worker (setting), species worker on (setting)'
        );
    });

    it('lists the statuses in a fixed order, so two reports can be compared', () => {
        const text = describeWorkers(
            summary({ species: { waiting: 0, dropped: 0, answered: 2, byStatus: { recorded: 1, discovered: 1 }, avgMs: null } }),
            setup
        );
        expect(text).toContain('Species: discovered 1, recorded 1');
    });
});
