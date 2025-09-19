import type { Eagle, Bird, CellContent, Grid, SimulationParams, AppEvent } from '../../types';
import { Quadtree, Rectangle } from '../Quadtree';

const EAGLE_VISION_RANGE = 15;

export interface EagleContext {
    grid: Grid;
    params: SimulationParams;
    qtree: Quadtree<CellContent>;
    nextActorState: Map<string, CellContent>;
    events: AppEvent[];
}

export const processEagleTick = (eagle: Eagle, context: EagleContext): boolean => {
    const { params, qtree, nextActorState, events } = context;
    const { gridWidth, gridHeight } = params;
    const { x, y } = eagle;

    // 1. Find a bird target if we don't have one
    if (!eagle.target) {
        const vision = new Rectangle(x, y, EAGLE_VISION_RANGE, EAGLE_VISION_RANGE);
        const nearbyBirds = qtree.query(vision)
            .map(p => p.data)
            .filter(a => a?.type === 'bird' && nextActorState.has(a.id)) as Bird[];

        if (nearbyBirds.length > 0) {
            const closestBird = nearbyBirds.reduce((closest, bird) => {
               const dist = Math.hypot(x - bird.x, y - bird.y);
               return (dist < closest.dist) ? { bird, dist } : closest;
            }, { bird: null as Bird | null, dist: Infinity }).bird;
            
            if (closestBird) {
                eagle.target = { x: closestBird.x, y: closestBird.y };
            }
        }
    }

    // 2. Move towards prey target and hunt
    if (eagle.target) {
        const targetBird = Array.from(nextActorState.values()).find(a => a.type === 'bird' && a.x === eagle.target!.x && a.y === eagle.target!.y) as Bird | undefined;
        
        if (targetBird) {
            const dx = Math.sign(eagle.target.x - x);
            const dy = Math.sign(eagle.target.y - y);
            const newX = x + dx; 
            const newY = y + dy;

            if (newX === eagle.target.x && newY === eagle.target.y) { // Hunt successful
                nextActorState.delete(targetBird.id); // Eat the bird
                nextActorState.delete(eagle.id);    // Eagle leaves after the hunt
                events.push({ message: '🦅 An eagle hunted a bird!', type: 'info', importance: 'high' });
                return true; // Hunt was successful

            } else if (newX >= 0 && newX < gridWidth && newY >= 0 && newY < gridHeight) {
                eagle.x = newX; 
                eagle.y = newY; 
            }
        } else {
            eagle.target = null; // Target is gone
        }
    } else {
        // No target, eagle despawns
        nextActorState.delete(eagle.id);
    }
    return false; // No hunt occurred
};
