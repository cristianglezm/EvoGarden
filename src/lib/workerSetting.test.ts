import { describe, it, expect, vi } from 'vitest';
import { automaticWorkers, readWorkerSetting, writeWorkerSetting, WORKERS_KEY, MAX_WORKERS } from './workerSetting';

const storageOf = (initial: Record<string, string> = {}) => {
    const data = { ...initial };
    return {
        data,
        getItem: vi.fn((key: string) => data[key] ?? null),
        setItem: vi.fn((key: string, value: string) => { data[key] = value; }),
        removeItem: vi.fn((key: string) => { delete data[key]; }),
    };
};

describe('automaticWorkers', () => {
    it('is one worker on three cores or fewer', () => {
        for (const cores of [1, 2, 3]) expect(automaticWorkers(cores)).toBe(1);
    });

    it('is the cores minus four, but at least two, from four cores', () => {
        expect(automaticWorkers(4)).toBe(2);
        expect(automaticWorkers(7)).toBe(3);
        expect(automaticWorkers(8)).toBe(4);
        expect(automaticWorkers(12)).toBe(8);
    });

    it('is never more than eight', () => {
        expect(automaticWorkers(64)).toBe(MAX_WORKERS);
    });

    it('is two when the browser does not say how many cores there are', () => {
        expect(automaticWorkers(undefined)).toBe(2);
        expect(automaticWorkers(Number.NaN)).toBe(2);
        expect(automaticWorkers(0)).toBe(2);
    });
});

describe('the number of workers the player chose', () => {
    it('is nothing (automatic) when nothing was saved', () => {
        expect(readWorkerSetting(storageOf())).toBeNull();
    });

    it('is what was saved, when it is a number of workers', () => {
        for (const n of [1, 2, 5, 8]) expect(readWorkerSetting(storageOf({ [WORKERS_KEY]: String(n) }))).toBe(n);
    });

    it('is nothing when what was saved is not a number of workers', () => {
        for (const bad of ['0', '9', '-1', '1.5', 'auto', 'many', '', ' 3', '3x']) {
            expect(readWorkerSetting(storageOf({ [WORKERS_KEY]: bad }))).toBeNull();
        }
    });

    it('is nothing when the storage cannot be read, or there is none', () => {
        const broken = { getItem: () => { throw new Error('denied'); } } as unknown as Storage;
        expect(readWorkerSetting(broken)).toBeNull();
        expect(readWorkerSetting(undefined)).toBeNull();
    });

    it('is saved under its own key, and a null takes the key away', () => {
        const storage = storageOf();
        expect(writeWorkerSetting(storage, 3)).toBe(true);
        expect(storage.data[WORKERS_KEY]).toBe('3');
        expect(writeWorkerSetting(storage, null)).toBe(true);
        expect(WORKERS_KEY in storage.data).toBe(false);
    });

    it('says when it could not be saved', () => {
        const broken = { setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('full'); } } as unknown as Storage;
        expect(writeWorkerSetting(broken, 3)).toBe(false);
        expect(writeWorkerSetting(broken, null)).toBe(false);
        expect(writeWorkerSetting(undefined, 3)).toBe(false);
    });

    it('does not save what is not a number of workers', () => {
        const storage = storageOf();
        expect(writeWorkerSetting(storage, 9)).toBe(false);
        expect(writeWorkerSetting(storage, 0)).toBe(false);
        expect(storage.setItem).not.toHaveBeenCalled();
    });
});
