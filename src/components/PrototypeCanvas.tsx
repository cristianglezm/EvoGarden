import React, { useEffect, useRef } from 'react';

interface PrototypeCanvasProps {
    /** `size * size` alphas in [0, 1], row by row */
    pixels: number[];
    size: number;
    className?: string;
}

/** The silhouette of a species. Draws nothing where there is no canvas to draw on. */
export const PrototypeCanvas: React.FC<PrototypeCanvasProps> = ({ pixels, size, className }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const context = canvasRef.current?.getContext('2d');
        if (!context) return;
        const image = context.createImageData(size, size);
        for (let i = 0; i < size * size; i++) {
            image.data[i * 4] = 214;
            image.data[i * 4 + 1] = 222;
            image.data[i * 4 + 2] = 214;
            image.data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, pixels[i] ?? 0)) * 255);
        }
        context.putImageData(image, 0, 0);
    }, [pixels, size]);

    return <canvas ref={canvasRef} width={size} height={size} className={className} style={{ imageRendering: 'pixelated' }} aria-hidden="true" />;
};
