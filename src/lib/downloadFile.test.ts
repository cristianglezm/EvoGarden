import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadBlob } from './downloadFile';

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('downloadBlob', () => {
    it('hands the browser the file under its name, and lets go of it afterwards', () => {
        vi.useFakeTimers();
        const createObjectURL = vi.fn(() => 'blob:the-file');
        const revokeObjectURL = vi.fn();
        vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
        const clicked: HTMLAnchorElement[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicked.push(this); });

        const blob = new Blob(['{}'], { type: 'application/json' });
        downloadBlob(blob, 'samples.json');

        expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(blob);
        expect(clicked).toHaveLength(1);
        expect(clicked[0].download).toBe('samples.json');
        expect(clicked[0].href).toBe('blob:the-file');
        expect(revokeObjectURL).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1000);
        expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:the-file');
    });
});
