import { describe, it, expect, vi, afterEach } from 'vitest';
import { initializeWasm, reportFatal } from './workerWasm';

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('initializeWasm', () => {
    it('says it started when the service did', async () => {
        await expect(initializeWasm({ initialize: async () => undefined }, 'Test Worker')).resolves.toBe(true);
    });

    it('says it did not, and why, when the service fails: it never throws', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await expect(initializeWasm({ initialize: async () => { throw new Error('no wasm'); } }, 'Test Worker')).resolves.toBe(false);
        expect(error.mock.calls[0][0]).toContain('Test Worker');
    });

    it('gives up when the service takes more than 15 seconds', async () => {
        vi.useFakeTimers();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const result = initializeWasm({ initialize: () => new Promise(() => undefined) }, 'Test Worker');
        await vi.advanceTimersByTimeAsync(14_999);
        let settled = false;
        result.then(() => { settled = true; });
        await vi.advanceTimersByTimeAsync(0);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(2);
        await expect(result).resolves.toBe(false);
    });
});

describe('reportFatal', () => {
    it('reports the error as the worker\'s own, so the page hears it', () => {
        const reportError = vi.fn();
        vi.stubGlobal('reportError', reportError);
        const error = new Error('cannot work');
        reportFatal(error);
        expect(reportError).toHaveBeenCalledExactlyOnceWith(error);
    });

    it('throws it from a timer where there is no reportError, which is the same to the page', async () => {
        vi.stubGlobal('reportError', undefined);
        vi.useFakeTimers();
        reportFatal(new Error('cannot work'));
        expect(() => vi.runAllTimers()).toThrow('cannot work');
    });
});
