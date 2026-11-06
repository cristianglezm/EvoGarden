import { describe, it, expect } from 'vitest';
import { planWorkers, workerPlanSource, workerPortSpecs } from './workerPlan';

describe('planWorkers: by the cores', () => {
    const plan = (hardwareConcurrency?: number, extra: { search?: string; workers?: number | null } = {}) => planWorkers({ hardwareConcurrency, ...extra });

    it('has the flower worker do the species too on three cores or fewer, where more threads only fight for them', () => {
        for (const cores of [1, 2, 3]) expect(plan(cores)).toEqual({ speciesWorker: false, creationWorkers: 1 });
    });

    it('keeps two workers from four cores, one of them for the species: the page and the simulation take two cores', () => {
        for (const cores of [4, 5, 6]) expect(plan(cores)).toEqual({ speciesWorker: true, creationWorkers: 1 });
    });

    it('adds a flower worker for each core after the sixth', () => {
        expect(plan(7)).toEqual({ speciesWorker: true, creationWorkers: 2 });
    });

    it('leaves four threads free: the workers are the cores minus four, one of them for the species', () => {
        expect(plan(8)).toEqual({ speciesWorker: true, creationWorkers: 3 });
        expect(plan(10)).toEqual({ speciesWorker: true, creationWorkers: 5 });
        expect(plan(12)).toEqual({ speciesWorker: true, creationWorkers: 7 });
    });

    it('does not start more than eight workers however many cores there are', () => {
        expect(plan(16)).toEqual({ speciesWorker: true, creationWorkers: 7 });
        expect(plan(128)).toEqual({ speciesWorker: true, creationWorkers: 7 });
    });

    it('assumes there are cores for two workers when the browser does not say', () => {
        expect(plan(undefined)).toEqual({ speciesWorker: true, creationWorkers: 1 });
    });
});

describe('planWorkers: by the setting', () => {
    const plan = (workers: number | null | undefined, hardwareConcurrency = 8) => planWorkers({ hardwareConcurrency, workers });

    it('takes the number of workers the player chose, whatever the cores', () => {
        expect(plan(1)).toEqual({ speciesWorker: false, creationWorkers: 1 });
        expect(plan(2)).toEqual({ speciesWorker: true, creationWorkers: 1 });
        expect(plan(4, 2)).toEqual({ speciesWorker: true, creationWorkers: 3 });
        expect(plan(8, 2)).toEqual({ speciesWorker: true, creationWorkers: 7 });
    });

    it('is the cores when the player chose automatic, or nothing', () => {
        expect(plan(null)).toEqual({ speciesWorker: true, creationWorkers: 3 });
        expect(plan(undefined)).toEqual({ speciesWorker: true, creationWorkers: 3 });
    });

    it('ignores a number that is not a number of workers', () => {
        for (const bad of [0, -1, 9, 1.5, Number.NaN]) expect(plan(bad)).toEqual({ speciesWorker: true, creationWorkers: 3 });
    });
});

describe('planWorkers: by the address, which wins, to compare on the same machine', () => {
    it('forces the species worker on or off, and the flower workers are the rest of the workers', () => {
        expect(planWorkers({ hardwareConcurrency: 8, search: '?speciesWorker=0' })).toEqual({ speciesWorker: false, creationWorkers: 4 });
        expect(planWorkers({ hardwareConcurrency: 1, search: '?speciesWorker=1' })).toEqual({ speciesWorker: true, creationWorkers: 1 });
        expect(planWorkers({ hardwareConcurrency: 8, search: '?a=1&speciesWorker=0&b=2' })).toEqual({ speciesWorker: false, creationWorkers: 4 });
    });

    it('forces the number of flower workers, over the setting and the cores', () => {
        expect(planWorkers({ hardwareConcurrency: 8, search: '?creationWorkers=2' })).toEqual({ speciesWorker: true, creationWorkers: 2 });
        expect(planWorkers({ hardwareConcurrency: 2, workers: 3, search: '?creationWorkers=6' })).toEqual({ speciesWorker: true, creationWorkers: 6 });
        expect(planWorkers({ hardwareConcurrency: 8, search: '?speciesWorker=0&creationWorkers=2' })).toEqual({ speciesWorker: false, creationWorkers: 2 });
        expect(planWorkers({ hardwareConcurrency: 8, search: '?creationWorkers=8' }).creationWorkers).toBe(8);
    });

    it('ignores a value it does not know and goes on with the setting or the cores', () => {
        for (const bad of ['0', '-2', '9', '100', '1.5', 'many', '']) {
            expect(planWorkers({ hardwareConcurrency: 8, search: `?creationWorkers=${bad}` }).creationWorkers).toBe(3);
        }
        expect(planWorkers({ hardwareConcurrency: 8, search: '?speciesWorker=maybe' })).toEqual({ speciesWorker: true, creationWorkers: 3 });
        expect(planWorkers({ hardwareConcurrency: 1, search: '?speciesWorker=' })).toEqual({ speciesWorker: false, creationWorkers: 1 });
    });
});

describe('workerPortSpecs', () => {
    const port = (id: string) => ({ id }) as unknown as MessagePort;
    const [f1, f2, f3, species] = [port('f1'), port('f2'), port('f3'), port('species')];

    it('makes the only flower worker do everything when there is no species worker', () => {
        expect(workerPortSpecs({ flowerWorkerPorts: [f1] })).toEqual([{ port: f1, roles: ['creation', 'species'] }]);
    });

    it('gives the species to the first flower worker only, so the migration and the champions run in one place', () => {
        expect(workerPortSpecs({ flowerWorkerPorts: [f1, f2, f3] })).toEqual([
            { port: f1, roles: ['creation', 'species'] },
            { port: f2, roles: ['creation'] },
            { port: f3, roles: ['creation'] },
        ]);
    });

    it('lets the flower workers classify when they have nothing to make, next to the species worker', () => {
        expect(workerPortSpecs({ flowerWorkerPorts: [f1, f2], speciesWorkerPort: species })).toEqual([
            { port: f1, roles: ['creation', 'species'] },
            { port: f2, roles: ['creation', 'species'] },
            { port: species, roles: ['species'] },
        ]);
    });

    it('has no workers without ports', () => {
        expect(workerPortSpecs({})).toEqual([]);
        expect(workerPortSpecs({ flowerWorkerPorts: [] })).toEqual([]);
        expect(workerPortSpecs({ speciesWorkerPort: species })).toEqual([{ port: species, roles: ['species'] }]);
    });
});


describe('workerPlanSource', () => {
    it('says it is the machine when nothing else decided', () => {
        expect(workerPlanSource('')).toEqual({ speciesWorker: 'automatic', creationWorkers: 'automatic' });
        expect(workerPlanSource('', null)).toEqual({ speciesWorker: 'automatic', creationWorkers: 'automatic' });
    });

    it('says it is the setting when the player chose a number', () => {
        expect(workerPlanSource('', 3)).toEqual({ speciesWorker: 'setting', creationWorkers: 'setting' });
    });

    it('says it is the address when the address decided, over the setting', () => {
        expect(workerPlanSource('?speciesWorker=0&creationWorkers=3', 4)).toEqual({ speciesWorker: 'address', creationWorkers: 'address' });
        expect(workerPlanSource('?speciesWorker=1')).toEqual({ speciesWorker: 'address', creationWorkers: 'automatic' });
        expect(workerPlanSource('?creationWorkers=2', 4)).toEqual({ speciesWorker: 'setting', creationWorkers: 'address' });
    });

    it('does not call it the address or the setting when the value was ignored', () => {
        expect(workerPlanSource('?speciesWorker=maybe&creationWorkers=99', 99)).toEqual({ speciesWorker: 'automatic', creationWorkers: 'automatic' });
    });
});
