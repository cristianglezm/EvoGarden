import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SimulationView } from './SimulationView';
import { DEFAULT_SIM_PARAMS } from '../constants';
import { eventService } from '../services/eventService';
import type { CellContent } from '../types';

vi.mock('../lib/renderingEngine', () => ({
    RenderingEngine: class {
        drawGrid() {}
        updateParams() {}
        draw() {}
    },
}));

const CELL = 64;
const actor = (type: string, x: number, y: number, id = `${type}-${x}-${y}`) => ({ id, type, x, y }) as unknown as CellContent;

describe('SimulationView: clicking the grid', () => {
    const onPlantOnCell = vi.fn();
    const onCellClick = vi.fn();
    const planting = { genome: 'champion', sex: 'both' as const };

    const click = (cellX: number, cellY: number) =>
        fireEvent.click(screen.getByRole('grid'), { clientX: cellX * CELL + 10, clientY: cellY * CELL + 10 });
    const view = (actors: CellContent[], plantingInfo: typeof planting | null = planting) => render(
        <SimulationView params={DEFAULT_SIM_PARAMS} onCellClick={onCellClick} selectedActorId={null}
            actors={new Map(actors.map(a => [a.id, a]))} onFrameRendered={() => {}} plantingInfo={plantingInfo}
            onPlantOnCell={onPlantOnCell} />,
    );

    beforeEach(() => {
        onPlantOnCell.mockClear();
        onCellClick.mockClear();
        vi.spyOn(eventService, 'dispatch').mockImplementation(() => {});
    });

    it('plants on an empty cell', () => {
        view([actor('flower', 1, 1)]);
        click(4, 5);
        expect(onPlantOnCell).toHaveBeenCalledExactlyOnceWith({ x: 4, y: 5 });
        expect(eventService.dispatch).not.toHaveBeenCalled();
        // planting is not selecting
        expect(onCellClick).not.toHaveBeenCalled();
    });

    it.each(['insect', 'bird', 'nutrient', 'slimeTrail', 'hive'])('plants on a cell where there is a %s: only a plant is in the way', type => {
        view([actor(type, 4, 5)]);
        click(4, 5);
        expect(onPlantOnCell).toHaveBeenCalledExactlyOnceWith({ x: 4, y: 5 });
    });

    it.each(['flower', 'flowerSeed'])('does not plant on a %s, and says why, and goes on planting', type => {
        view([actor('insect', 4, 5), actor(type, 4, 5)]);
        click(4, 5);
        expect(onPlantOnCell).not.toHaveBeenCalled();
        expect(eventService.dispatch).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/a flower or a seed is already in that cell/i), type: 'error' }));
        expect(onCellClick).not.toHaveBeenCalled();
    });

    it('selects what is in the cell when it is not planting, whatever it is', () => {
        const insect = actor('insect', 4, 5);
        view([insect], null);
        click(4, 5);
        expect(onPlantOnCell).not.toHaveBeenCalled();
        expect(onCellClick).toHaveBeenCalledExactlyOnceWith([insect]);
    });
});
