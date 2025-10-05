import type { Grid, SimulationParams, CellContent, AppEvent } from './index';
import type { AsyncFlowerFactory } from '../lib/asyncFlowerFactory';
import type { Quadtree } from '../lib/Quadtree';

/**
 * The context object provided to each insect's behavior update function.
 * It contains all the necessary information about the current simulation state
 * for the insect to make decisions.
 */
export interface InsectBehaviorContext {
    params: SimulationParams;
    grid: Grid;
    nextActorState: Map<string, CellContent>;
    asyncFlowerFactory: AsyncFlowerFactory;
    qtree: Quadtree<CellContent>;
    flowerQtree: Quadtree<CellContent>;
    events: AppEvent[];
    incrementInsectsDiedOfOldAge: () => void;
    currentTemperature: number;
    newActorQueue: CellContent[];
    getNextId: (type: string, x: number, y: number) => string;
}