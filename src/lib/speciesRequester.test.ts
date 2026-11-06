import { describe, it, expect, vi } from 'vitest';
import { SpeciesRequester } from './speciesRequester';
import type { CellContent, Flower, SpeciesResult } from '../types';

const flower = (id: string, extra: Partial<Flower> = {}): Flower => ({
    id, type: 'flower', x: 1, y: 1, genome: `genome-${id}`, imageData: `image-${id}`,
    health: 10, stamina: 10, age: 70, isMature: true, maxHealth: 10, maxStamina: 10,
    maturationPeriod: 50, nutrientEfficiency: 1, sex: 'female', minTemperature: 5, maxTemperature: 30,
    toxicityRate: 0.3, effects: { vitality: 0, agility: 0, strength: 0, intelligence: 0, luck: 0 },
    ...extra,
});

function setup() {
    const post = vi.fn();
    return { requester: new SpeciesRequester(post), post };
}

describe('SpeciesRequester', () => {
    describe('the species alive', () => {
        // a flower that was asked for at `tick` and answered with a species
        const classified = (requester: SpeciesRequester, f: Flower, x: number, y: number, tick = 1) => {
            requester.requestMature([f], tick);
            requester.receive({ flowerId: f.id, status: 'stored', tick, match: { x, y, distance: 1 }, fp: 'fp' } as SpeciesResult);
        };

        it('are none while nothing is classified', () => {
            const { requester } = setup();
            requester.requestMature([flower('a'), flower('b')], 1);
            expect(requester.getAliveSpecies()).toBe(0);
        });

        it('are the different species of the living mature flowers that were classified, once the tick has seen them', () => {
            const { requester } = setup();
            const a = flower('a'), b = flower('b'), c = flower('c');
            classified(requester, a, 1, 2);
            classified(requester, b, 3, 4);
            classified(requester, c, 5, 6);
            expect(requester.getAliveSpecies()).toBe(0);
            requester.requestMature([a, b, c], 2);
            expect(requester.getAliveSpecies()).toBe(3);
        });

        it('count a species once, however many flowers are of it', () => {
            const { requester } = setup();
            const a = flower('a'), b = flower('b');
            classified(requester, a, 1, 2);
            classified(requester, b, 1, 2);
            requester.requestMature([a, b], 2);
            expect(requester.getAliveSpecies()).toBe(1);
        });

        it('tell the species by both coordinates of the cell', () => {
            const { requester } = setup();
            const a = flower('a'), b = flower('b'), c = flower('c');
            classified(requester, a, 1, 2);
            classified(requester, b, 2, 1);
            classified(requester, c, 1, 3);
            requester.requestMature([a, b, c], 2);
            expect(requester.getAliveSpecies()).toBe(3);
        });

        it('do not count a flower that is gone, nor one that is not mature, nor what is not a flower', () => {
            const { requester } = setup();
            const a = flower('a'), b = flower('b'), c = flower('c');
            classified(requester, a, 1, 2);
            classified(requester, b, 3, 4);
            classified(requester, c, 5, 6);
            // `c` is something else with the genome of a classified flower, `b` is a flower that is not mature
            requester.requestMature([a, { ...b, isMature: false }, { ...c, type: 'insect' } as unknown as CellContent], 2);
            expect(requester.getAliveSpecies()).toBe(1);
            requester.requestMature([], 3);
            expect(requester.getAliveSpecies()).toBe(0);
        });

        it('do not count a flower that was classified in no species', () => {
            const { requester } = setup();
            const a = flower('a');
            requester.requestMature([a], 1);
            requester.receive({ flowerId: 'a', status: 'unclassified', tick: 1 } as SpeciesResult);
            requester.requestMature([a], 2);
            expect(requester.getAliveSpecies()).toBe(0);
        });

        it('follow the flowers that live: a species goes when its last flower does', () => {
            const { requester } = setup();
            const a = flower('a'), b = flower('b');
            classified(requester, a, 1, 2);
            classified(requester, b, 1, 2);
            requester.requestMature([a, b], 2);
            requester.requestMature([b], 3);
            expect(requester.getAliveSpecies()).toBe(1);
            requester.requestMature([], 4);
            expect(requester.getAliveSpecies()).toBe(0);
        });

        it('start again with a new game', () => {
            const { requester } = setup();
            const a = flower('a');
            classified(requester, a, 1, 2);
            requester.requestMature([a], 2);
            requester.reset();
            expect(requester.getAliveSpecies()).toBe(0);
        });
    });

    describe('asking for a flower to be classified', () => {
        it('asks for each mature flower, with what the collection keeps of it', () => {
            const { requester, post } = setup();
            requester.requestMature([flower('a'), flower('b', { sex: 'male', age: 90, toxicityRate: 0.9 })], 42);
            expect(post).toHaveBeenCalledTimes(2);
            expect(post).toHaveBeenNthCalledWith(1, { type: 'classify-flower', payload: {
                flowerId: 'a', genome: 'genome-a', image: 'image-a', sex: 'female', age: 70, toxicity: 0.3, tick: 42,
            } });
            expect(post.mock.calls[1][0].payload).toMatchObject({ flowerId: 'b', sex: 'male', age: 90, toxicity: 0.9 });
        });

        it('does not ask for what is not a mature flower', () => {
            const { requester, post } = setup();
            const others = [
                flower('young', { isMature: false }),
                { id: 'seed', type: 'flowerSeed', x: 0, y: 0, imageData: '', health: 1, maxHealth: 1, age: 0 },
                { id: 'bug', type: 'insect' },
            ] as unknown as CellContent[];
            requester.requestMature(others, 1);
            expect(post).not.toHaveBeenCalled();
        });

        it('asks once for a flower, however many ticks it is seen', () => {
            const { requester, post } = setup();
            for (let tick = 1; tick <= 5; tick++) requester.requestMature([flower('a')], tick);
            expect(post).toHaveBeenCalledTimes(1);
        });

        it('asks for a flower on the tick it matures, not before', () => {
            const { requester, post } = setup();
            const growing = flower('a', { isMature: false });
            requester.requestMature([growing], 1);
            expect(post).not.toHaveBeenCalled();
            growing.isMature = true;
            requester.requestMature([growing], 2);
            expect(post).toHaveBeenCalledTimes(1);
        });

        it('asks for a new flower that took the id of one that died, flower ids being "flower-x-y"', () => {
            const { requester, post } = setup();
            requester.requestMature([flower('flower-3-4', { genome: 'first' })], 10);
            requester.requestMature([flower('flower-3-4', { genome: 'second' })], 20);
            expect(post).toHaveBeenCalledTimes(2);
            expect(post.mock.calls[1][0].payload).toMatchObject({ flowerId: 'flower-3-4', genome: 'second' });
        });

        it('asks again after a reset, as for a new game or a loaded one', () => {
            const { requester, post } = setup();
            requester.requestMature([flower('a')], 1);
            requester.reset();
            requester.requestMature([flower('a')], 1);
            expect(post).toHaveBeenCalledTimes(2);
        });
    });

    describe('a flower that dies', () => {
        it('is reported with its final values, if it had been asked for', () => {
            const { requester, post } = setup();
            const bloom = flower('a', { age: 70, toxicityRate: 0.3 });
            requester.requestMature([bloom], 10);
            post.mockClear();

            requester.reportDeath({ ...bloom, age: 140, toxicityRate: -0.2 }, 80);
            expect(post).toHaveBeenCalledExactlyOnceWith({ type: 'record-flower', payload: {
                flowerId: 'a', genome: 'genome-a', image: 'image-a', sex: 'female', age: 140, toxicity: -0.2, tick: 80,
            } });
        });

        it('is not reported if it never matured, so it was never asked for', () => {
            const { requester, post } = setup();
            requester.requestMature([flower('a', { isMature: false })], 10);
            requester.reportDeath(flower('a', { isMature: false }), 11);
            requester.reportDeath(flower('never-seen'), 11);
            expect(post).not.toHaveBeenCalled();
        });

        it('is not mistaken for the flower that has its id now', () => {
            const { requester, post } = setup();
            requester.requestMature([flower('flower-1-1', { genome: 'old' })], 10);
            requester.requestMature([flower('flower-1-1', { genome: 'new' })], 30);
            post.mockClear();
            requester.reportDeath(flower('flower-1-1', { genome: 'old' }), 31);
            expect(post).not.toHaveBeenCalled();
        });
    });

    describe('forgetting flowers that are gone', () => {
        it('forgets them every 100 ticks, so the list does not grow for ever', () => {
            const { requester, post } = setup();
            requester.requestMature([flower('a'), flower('b')], 5);
            requester.requestMature([flower('b')], 100);
            post.mockClear();
            requester.requestMature([flower('a'), flower('b')], 101);
            expect(post).toHaveBeenCalledTimes(1);
            expect(post.mock.calls[0][0].payload.flowerId).toBe('a');
        });

        it('keeps the ones still there', () => {
            const { requester, post } = setup();
            requester.requestMature([flower('a')], 5);
            requester.requestMature([flower('a')], 100);
            requester.requestMature([flower('a')], 101);
            expect(post).toHaveBeenCalledTimes(1);
        });
    });

    describe('what comes back', () => {
        const discovered: SpeciesResult = { flowerId: 'a', status: 'discovered', species: { x: 3, y: 5, name: 'Stout Lotus' } };

        it('turns a discovery into an event for the player, once', () => {
            const { requester } = setup();
            requester.receive(discovered);
            expect(requester.takeEvents()).toEqual([{ message: '🌸 New species discovered: Stout Lotus!', type: 'success', importance: 'high' }]);
            expect(requester.takeEvents()).toEqual([]);
        });

        it('says nothing for the other results', () => {
            const { requester } = setup();
            for (const status of ['stored', 'unclassified', 'skipped', 'dropped', 'failed'] as const) {
                requester.receive({ flowerId: 'a', status, species: { x: 1, y: 1, name: 'Slender Iris' } });
            }
            expect(requester.takeEvents()).toEqual([]);
        });

        it('ignores a discovery without a species and a message that is not a result', () => {
            const { requester } = setup();
            requester.receive({ flowerId: 'a', status: 'discovered' });
            requester.receive(undefined as unknown as SpeciesResult);
            expect(requester.takeEvents()).toEqual([]);
        });

        it('forgets the events not yet taken when reset', () => {
            const { requester } = setup();
            requester.receive(discovered);
            requester.reset();
            expect(requester.takeEvents()).toEqual([]);
        });
    });
});

describe('SpeciesRequester stats', () => {
    const flower = (id: string, genome = `g-${id}`) => ({ type: 'flower', id, genome, isMature: true, sex: 'both', age: 1, toxicityRate: 0, imageData: 'png' }) as any;

    it('has the requests it made and nobody answered as waiting', () => {
        const requester = new SpeciesRequester(vi.fn());
        expect(requester.getStats()).toEqual({ waiting: 0, answered: 0, dropped: 0, byStatus: {}, avgMs: null });
        requester.requestMature([flower('a'), flower('b'), flower('c')], 1);
        expect(requester.getStats().waiting).toBe(3);
    });

    it('counts the answers by status, whatever the flower', () => {
        const requester = new SpeciesRequester(vi.fn());
        requester.requestMature([flower('a'), flower('b'), flower('c')], 1);
        requester.receive({ flowerId: 'a', status: 'stored' });
        requester.receive({ flowerId: 'b', status: 'stored' });
        requester.receive({ flowerId: 'c', status: 'discovered', species: { x: 1, y: 2, name: 'Rose' } });
        expect(requester.getStats()).toEqual({ waiting: 0, answered: 3, dropped: 0, byStatus: { stored: 2, discovered: 1 }, avgMs: null });
    });

    it('counts the death of a flower it asked for as one more request', () => {
        const requester = new SpeciesRequester(vi.fn());
        const f = flower('a');
        requester.requestMature([f], 1);
        requester.receive({ flowerId: 'a', status: 'stored' });
        requester.reportDeath(f, 5);
        expect(requester.getStats().waiting).toBe(1);
        requester.receive({ flowerId: 'a', status: 'recorded' });
        expect(requester.getStats()).toMatchObject({ waiting: 0, answered: 2 });
    });

    it('does not have less than none waiting, if an answer comes that was not asked for', () => {
        const requester = new SpeciesRequester(vi.fn());
        requester.receive({ flowerId: 'x', status: 'skipped' });
        expect(requester.getStats().waiting).toBe(0);
    });

    it('starts again with a new game', () => {
        const requester = new SpeciesRequester(vi.fn());
        requester.requestMature([flower('a')], 1);
        requester.receive({ flowerId: 'a', status: 'stored' });
        requester.requestMature([flower('b')], 2);
        requester.reset();
        expect(requester.getStats()).toEqual({ waiting: 0, answered: 0, dropped: 0, byStatus: {}, avgMs: null });
    });

    it('averages the time each classified flower took, over the last 50, and not the answers that carry none', () => {
        const requester = new SpeciesRequester(vi.fn());
        for (let i = 0; i < 60; i++) requester.receive({ flowerId: `f${i}`, status: 'stored', durationMs: i < 10 ? 1000 : 20 });
        requester.receive({ flowerId: 'skipped', status: 'skipped' });
        requester.receive({ flowerId: 'odd', status: 'stored', durationMs: Number.NaN });
        expect(requester.getStats().avgMs).toBe(20);
    });

    it('forgets the times with a new game', () => {
        const requester = new SpeciesRequester(vi.fn());
        requester.receive({ flowerId: 'a', status: 'stored', durationMs: 30 });
        requester.reset();
        expect(requester.getStats().avgMs).toBeNull();
    });
});

describe('SpeciesRequester remembers the species of the flowers it asked about', () => {
    const flower = (id: string, genome: string) => ({ type: 'flower', id, genome, isMature: true, sex: 'both', age: 3, toxicityRate: 0.2, imageData: 'png' }) as any;
    const recordOf = (post: ReturnType<typeof vi.fn>) => post.mock.calls.map(c => c[0]).filter(m => m.type === 'record-flower').map(m => m.payload);
    const answer = (requester: SpeciesRequester, flowerId: string, tick: number, x = 4) =>
        requester.receive({ flowerId, status: 'stored', tick, fp: 'fp1', match: { x, y: 1, distance: 0.3 } });

    it('gives the death of a flower the species it was classified in', () => {
        const post = vi.fn();
        const requester = new SpeciesRequester(post);
        const f = flower('flower-1-1', 'genome-a');
        requester.requestMature([f], 10);
        answer(requester, 'flower-1-1', 10);
        requester.reportDeath(f, 40);
        expect(recordOf(post)).toEqual([expect.objectContaining({ flowerId: 'flower-1-1', fp: 'fp1', match: { x: 4, y: 1, distance: 0.3 } })]);
    });

    it('sends the death without a match when none is known yet', () => {
        const post = vi.fn();
        const requester = new SpeciesRequester(post);
        const f = flower('flower-1-1', 'genome-a');
        requester.requestMature([f], 10);
        requester.reportDeath(f, 40);
        expect(recordOf(post)[0].match).toBeUndefined();
        expect(recordOf(post)[0].fp).toBeUndefined();
    });

    it('does not give a flower the species of an older one that had the same id', () => {
        const post = vi.fn();
        const requester = new SpeciesRequester(post);
        const older = flower('flower-1-1', 'genome-old');
        const newer = flower('flower-1-1', 'genome-new');
        requester.requestMature([older], 10);
        requester.requestMature([newer], 50);
        answer(requester, 'flower-1-1', 10, 7);
        requester.reportDeath(newer, 90);
        expect(recordOf(post)[0].match).toBeUndefined();
        // and the older one, had it died, would have had its own
        requester.reportDeath(older, 91);
    });

    it('ignores an answer that says no tick, because it cannot tell which request it answers', () => {
        const post = vi.fn();
        const requester = new SpeciesRequester(post);
        const f = flower('flower-1-1', 'genome-a');
        requester.requestMature([f], 10);
        requester.receive({ flowerId: 'flower-1-1', status: 'stored', fp: 'fp1', match: { x: 4, y: 1, distance: 0.3 } });
        requester.reportDeath(f, 40);
        expect(recordOf(post)[0].match).toBeUndefined();
    });

    it('forgets the species of the flowers that are gone, and of a game that ended', () => {
        const post = vi.fn();
        const requester = new SpeciesRequester(post);
        const f = flower('flower-1-1', 'genome-a');
        requester.requestMature([f], 10);
        answer(requester, 'flower-1-1', 10);
        // a tick that prunes (a multiple of 100) at which the flower is no longer there
        requester.requestMature([], 100);
        requester.requestMature([f], 101);
        requester.reportDeath(f, 120);
        expect(recordOf(post)[0].match).toBeUndefined();

        const g = flower('flower-2-2', 'genome-b');
        requester.requestMature([g], 130);
        answer(requester, 'flower-2-2', 130);
        requester.reset();
        requester.requestMature([g], 131);
        requester.reportDeath(g, 140);
        expect(recordOf(post)[1].match).toBeUndefined();
    });

    it('keeps the species of a flower that is still there when it prunes', () => {
        const post = vi.fn();
        const requester = new SpeciesRequester(post);
        const f = flower('flower-1-1', 'genome-a');
        requester.requestMature([f], 10);
        answer(requester, 'flower-1-1', 10);
        requester.requestMature([f], 100);
        requester.reportDeath(f, 120);
        expect(recordOf(post)[0].match).toEqual({ x: 4, y: 1, distance: 0.3 });
    });

    describe('a classification the queue dropped', () => {
        const f = (id: string) => flower(id, `g-${id}`);
        const dropOf = (post: ReturnType<typeof vi.fn>, n = 0) => post.mock.calls[n][0];

        it('is not waiting any more, and is counted as dropped', () => {
            const { requester, post } = setup();
            requester.requestMature([f('a'), f('b'), f('c')], 5);
            requester.discard(dropOf(post, 1));
            expect(requester.getStats()).toMatchObject({ waiting: 2, answered: 0, dropped: 1 });
        });

        it('is not asked again: the flower stays known as asked for', () => {
            const { requester, post } = setup();
            requester.requestMature([f('a')], 5);
            requester.discard(dropOf(post));
            requester.requestMature([f('a')], 6);
            expect(post).toHaveBeenCalledTimes(1);
        });

        it('still reports its death, without a species, so the collection can take its records', () => {
            const { requester, post } = setup();
            requester.requestMature([f('a')], 5);
            requester.discard(dropOf(post));
            requester.reportDeath(f('a'), 9);
            expect(post).toHaveBeenLastCalledWith({ type: 'record-flower', payload: expect.not.objectContaining({ match: expect.anything() }) });
            expect(requester.getStats().waiting).toBe(1);
        });

        it('ignores a message that was not a classification of this requester, and a record', () => {
            const { requester, post } = setup();
            requester.requestMature([f('a')], 5);
            requester.discard({ type: 'record-flower', payload: dropOf(post).payload });
            requester.discard({ type: 'classify-flower' });
            expect(requester.getStats()).toMatchObject({ waiting: 1, dropped: 0 });
        });

        it('is counted once, and what was kept for it is let go', () => {
            const { requester, post } = setup();
            requester.requestMature([f('a')], 5);
            requester.discard(dropOf(post));
            requester.discard(dropOf(post));
            expect(requester.getStats()).toMatchObject({ waiting: 0, dropped: 1 });
        });

        it('is forgotten with a new game', () => {
            const { requester, post } = setup();
            requester.requestMature([f('a')], 5);
            requester.discard(dropOf(post));
            requester.reset();
            expect(requester.getStats().dropped).toBe(0);
        });
    });
});
