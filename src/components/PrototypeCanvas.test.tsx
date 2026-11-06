import '@testing-library/jest-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { PrototypeCanvas } from './PrototypeCanvas';
import { stubCanvas } from '../test/guideHarness';

afterEach(() => vi.restoreAllMocks());

describe('PrototypeCanvas', () => {
    it('draws the silhouette as the alpha of each pixel', () => {
        const { putImageData } = stubCanvas();
        const pixels = Array.from({ length: 16 }, (_, i) => i / 15);
        render(<PrototypeCanvas pixels={pixels} size={4} />);

        expect(putImageData).toHaveBeenCalledTimes(1);
        const image = putImageData.mock.calls[0][0] as ImageData;
        expect(image.data).toHaveLength(64);
        expect([image.data[3], image.data[7], image.data[63]]).toEqual([0, 17, 255]);
        expect([image.data[0], image.data[1], image.data[2]]).toEqual([214, 222, 214]);
    });

    it('keeps what is out of [0, 1] inside it, and what is missing transparent', () => {
        const { putImageData } = stubCanvas();
        render(<PrototypeCanvas pixels={[-3, 7]} size={2} />);
        const image = putImageData.mock.calls[0][0] as ImageData;
        expect([image.data[3], image.data[7], image.data[11], image.data[15]]).toEqual([0, 255, 0, 0]);
    });

    it('draws again when the silhouette changes', () => {
        const { putImageData } = stubCanvas();
        const { rerender } = render(<PrototypeCanvas pixels={[1, 1, 1, 1]} size={2} />);
        rerender(<PrototypeCanvas pixels={[0, 0, 0, 0]} size={2} />);
        expect(putImageData).toHaveBeenCalledTimes(2);
    });

    it('is a canvas of the size of the silhouette, hidden from screen readers, drawn crisp', () => {
        stubCanvas();
        const { container } = render(<PrototypeCanvas pixels={[]} size={16} className="x" />);
        const canvas = container.querySelector('canvas')!;
        expect([canvas.width, canvas.height]).toEqual([16, 16]);
        expect(canvas).toHaveAttribute('aria-hidden', 'true');
        expect(canvas).toHaveStyle({ imageRendering: 'pixelated' });
        expect(canvas).toHaveClass('x');
    });

    it('draws nothing, and does not fail, where there is no canvas to draw on', () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
        expect(() => render(<PrototypeCanvas pixels={[1]} size={1} />)).not.toThrow();
    });
});
