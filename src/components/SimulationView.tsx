import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { CellContent, SimulationParams, Coord } from '../types';
import { RenderingEngine } from '../lib/renderingEngine';
import { eventService } from '../services/eventService';

const CELL_SIZE_PX = 64;

interface SimulationViewProps {
    params: SimulationParams;
    onCellClick: (actors: CellContent[]) => void;
    selectedActorId: string | null;
    actors: Map<string, CellContent>;
    onFrameRendered: (renderTimeMs: number) => void;
    plantingInfo: { genome: string; sex: 'male' | 'female' | 'both' } | null;
    onPlantOnCell: (coords: Coord) => void;
    onCanvasesReady?: (bg: HTMLCanvasElement, fg: HTMLCanvasElement) => void;
}

export const SimulationView: React.FC<SimulationViewProps> = ({ params, onCellClick, selectedActorId, actors, onFrameRendered, plantingInfo, onPlantOnCell, onCanvasesReady }) => {
    const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const fgCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const engineRef = useRef<RenderingEngine | null>(null);
    const [isEngineReady, setIsEngineReady] = useState(false);

    // Initialize rendering engine
    useEffect(() => {
        const bgCanvas = bgCanvasRef.current;
        const fgCanvas = fgCanvasRef.current;

        if (bgCanvas && fgCanvas && !engineRef.current) {
            engineRef.current = new RenderingEngine(bgCanvas, fgCanvas, params);
            engineRef.current.drawGrid();
            setIsEngineReady(true);
        }
    }, [params]);
    
    // Notify parent about available canvases
    useEffect(() => {
        if (isEngineReady && bgCanvasRef.current && fgCanvasRef.current) {
            onCanvasesReady?.(bgCanvasRef.current, fgCanvasRef.current);
        }
    }, [isEngineReady, onCanvasesReady]);
    
    // Update engine with new params
    useEffect(() => {
        if (isEngineReady && engineRef.current) {
            engineRef.current.updateParams(params);
        }
    }, [params, isEngineReady]);


    // Main draw loop
    useEffect(() => {
        if (isEngineReady && engineRef.current) {
            const renderStartTime = performance.now();
            engineRef.current.draw(actors, selectedActorId);
            const renderEndTime = performance.now();
            onFrameRendered(renderEndTime - renderStartTime);
        }
    }, [actors, selectedActorId, isEngineReady, onFrameRendered]);


    const handleClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = fgCanvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const gridX = Math.floor(x / CELL_SIZE_PX);
        const gridY = Math.floor(y / CELL_SIZE_PX);

        if (plantingInfo) {
            const actorsInCell = Array.from(actors.values()).filter(actor => actor.x === gridX && actor.y === gridY);
            if (actorsInCell.length === 0) {
                onPlantOnCell({ x: gridX, y: gridY });
            } else {
                eventService.dispatch({ message: 'Cannot plant on an occupied cell.', type: 'error', importance: 'high' });
            }
            return;
        }
        
        const actorsInCell: CellContent[] = [];
        for (const actor of actors.values()) {
            if (actor.x === gridX && actor.y === gridY) {
                actorsInCell.push(actor);
            }
        }
        
        onCellClick(actorsInCell);
    }, [actors, onCellClick, plantingInfo, onPlantOnCell]);

    const canvasWidth = params.gridWidth * CELL_SIZE_PX;
    const canvasHeight = params.gridHeight * CELL_SIZE_PX;

    return (
        <div className="grow bg-surface rounded-lg overflow-auto flex items-center justify-center p-4">
            <div
                style={{ width: canvasWidth, height: canvasHeight, position: 'relative' }}
                className="bg-surface/50 rounded-lg shadow-inner"
            >
                <canvas
                    ref={bgCanvasRef}
                    className="absolute top-0 left-0"
                    aria-hidden="true" // Decorative background
                />
                <canvas
                    ref={fgCanvasRef}
                    onClick={handleClick}
                    className={`absolute top-0 left-0 ${plantingInfo ? 'cursor-crosshair' : 'cursor-pointer'}`}
                    role="grid"
                    aria-label="EvoGarden simulation grid"
                />
            </div>
        </div>
    );
};
