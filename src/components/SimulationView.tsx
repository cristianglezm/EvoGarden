import React, { useRef, useEffect, useCallback } from 'react';
import type { Grid, Flower, SimulationParams, CellContent, Insect } from '../types';

const CELL_SIZE_PX = 64;
const GRID_COLOR = 'hsla(120, 100%, 50%, 0.2)';
const SELECTED_CELL_COLOR = 'hsla(120, 100%, 50%, 0.4)';

// Cache for loaded flower images to prevent flickering and re-loading
const imageCache = new Map<string, HTMLImageElement>();

const drawCell = (
    ctx: CanvasRenderingContext2D,
    cell: CellContent[],
    x: number,
    y: number,
    rerender: () => void
) => {
    if (!cell || cell.length === 0) return;

    const px = x * CELL_SIZE_PX;
    const py = y * CELL_SIZE_PX;
    
    const flower = cell.find(c => c.type === 'flower') as Flower | undefined;
    const otherEntities = cell.filter(c => c.type !== 'flower');

    if (flower) {
        // Add a guard to ensure imageData exists and is a non-empty string.
        // This prevents errors if the WASM module fails to generate an SVG.
        if (!flower.imageData || typeof flower.imageData !== 'string') {
            return;
        }

        const dataUrl = `${flower.imageData}`;
        let img = imageCache.get(dataUrl);

        if (img) {
            if (img.complete) {
                ctx.drawImage(img, px, py, CELL_SIZE_PX, CELL_SIZE_PX);
            }
        } else {
            img = new Image();
            img.onload = () => {
                rerender(); // Trigger a rerender to draw the newly loaded image
            };
            img.src = dataUrl;
            imageCache.set(dataUrl, img);
        }
    }
    
    if (otherEntities.length > 0) {
        ctx.font = `${CELL_SIZE_PX * 0.6}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        for (const entity of otherEntities) {
            const emoji =
                entity.type === 'bird' ? '🐦' :
                entity.type === 'eagle' ? '🦅' :
                entity.type === 'insect' ? (entity as Insect).emoji :
                entity.type === 'nutrient' ? '💩' :
                entity.type === 'egg' ? '🥚' :
                entity.type === 'herbicidePlane' ? '✈️' :
                entity.type === 'herbicideSmoke' ? '💨' : '';
            
            if (emoji) {
                ctx.save();
                ctx.globalAlpha = 0.8;
                ctx.fillText(emoji, px + CELL_SIZE_PX / 2, py + CELL_SIZE_PX / 2);
                ctx.restore();
            }
        }
    }
};

interface SimulationCanvasProps {
    grid: Grid;
    params: SimulationParams;
    onSelectFlower: (flower: Flower | null) => void;
    selectedFlowerId: string | null;
}

const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ grid, params, onSelectFlower, selectedFlowerId }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [, setForceRender] = React.useState(0);
    const rerender = useCallback(() => setForceRender(tick => tick + 1), []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw grid lines and entities
        for (let y = 0; y < params.gridHeight; y++) {
            for (let x = 0; x < params.gridWidth; x++) {
                const cell = grid[y]?.[x];

                // Draw cell background/border
                ctx.strokeStyle = GRID_COLOR;
                ctx.strokeRect(x * CELL_SIZE_PX, y * CELL_SIZE_PX, CELL_SIZE_PX, CELL_SIZE_PX);
                
                // Draw entities in cell
                if (cell) {
                    drawCell(ctx, cell, x, y, rerender);
                }

                // Highlight selected flower
                if (cell?.some(c => c.type === 'flower' && c.id === selectedFlowerId)) {
                    ctx.fillStyle = SELECTED_CELL_COLOR;
                    ctx.fillRect(x * CELL_SIZE_PX, y * CELL_SIZE_PX, CELL_SIZE_PX, CELL_SIZE_PX);
                }
            }
        }
    }, [grid, params, selectedFlowerId, rerender]);

    const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const gridX = Math.floor(x / CELL_SIZE_PX);
        const gridY = Math.floor(y / CELL_SIZE_PX);

        const cell = grid[gridY]?.[gridX];
        const flowerInCell = cell?.find(c => c.type === 'flower') as Flower | undefined;
        onSelectFlower(flowerInCell || null);
    };

    return (
        <canvas
            ref={canvasRef}
            width={params.gridWidth * CELL_SIZE_PX}
            height={params.gridHeight * CELL_SIZE_PX}
            onClick={handleClick}
            className="bg-surface/50 rounded-lg shadow-inner cursor-pointer"
            role="grid"
            aria-label="EvoGarden simulation grid"
        />
    );
};


interface SimulationViewProps {
    params: SimulationParams;
    onSelectFlower: (flower: Flower | null) => void;
    selectedFlowerId: string | null;
    grid: Grid;
}

export const SimulationView: React.FC<SimulationViewProps> = ({ params, onSelectFlower, selectedFlowerId, grid }) => {
    return (
        <div className="grow bg-surface rounded-lg overflow-auto flex items-center justify-center p-4">
            {grid.length > 0 && ( // Ensure grid is initialized before rendering canvas
                <SimulationCanvas
                    grid={grid}
                    params={params}
                    onSelectFlower={onSelectFlower}
                    selectedFlowerId={selectedFlowerId}
                />
            )}
        </div>
    );
};
