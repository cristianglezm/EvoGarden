import type { Bird, Insect, Egg, Nutrient, CellContent, Grid, SimulationParams, ToastMessage } from '../../types';
import { Quadtree, Rectangle } from '../Quadtree';
import { NUTRIENT_FROM_PREY_LIFESPAN, BIRD_DROP_NUTRIENT_CHANCE, NUTRIENT_LIFESPAN } from '../../constants';
import { findCellForStationaryActor } from '../simulationUtils';

const BIRD_VISION_RANGE = 7;

export interface BirdContext {
    grid: Grid;
    params: SimulationParams;
    qtree: Quadtree<CellContent>;
    nextActorState: Map<string, CellContent>;
    toasts: Omit<ToastMessage, 'id'>[];
    incrementInsectsEaten: () => void;
    incrementEggsEaten: () => void;
}

export const processBirdTick = (bird: Bird, context: BirdContext) => {
    const { grid, params, qtree, nextActorState, toasts, incrementInsectsEaten, incrementEggsEaten } = context;
    const { gridWidth, gridHeight } = params;
    const { x, y } = bird;
    let moved = false;

    // 1. Find a target if we don't have one
    if (!bird.target) {
        const vision = new Rectangle(x, y, BIRD_VISION_RANGE, BIRD_VISION_RANGE);
        const nearbyPoints = qtree.query(vision);
        
        // Priority 1: Find unprotected insects
        const nearbyInsects = nearbyPoints
            .map(p => p.data)
            .filter(a => {
                if (a?.type !== 'insect' || !nextActorState.has(a.id)) return false;
                const isProtected = grid[a.y][a.x].some(c => c.type === 'flower');
                return !isProtected;
            }) as Insect[];

        if (nearbyInsects.length > 0) {
            const closestInsect = nearbyInsects.reduce((closest, insect) => {
               const dist = Math.hypot(x - insect.x, y - insect.y);
               return (dist < closest.dist) ? { insect, dist } : closest;
            }, { insect: null as Insect | null, dist: Infinity }).insect;
            
            if (closestInsect) {
                bird.target = { x: closestInsect.x, y: closestInsect.y };
            }
        } else {
            // Priority 2: Find unprotected eggs if no insects are available
            const nearbyEggs = nearbyPoints
                .map(p => p.data)
                .filter(a => {
                    if (a?.type !== 'egg' || !nextActorState.has(a.id)) return false;
                    const isProtected = grid[a.y][a.x].some(c => c.type === 'flower');
                    return !isProtected;
                }) as Egg[];
            
            if (nearbyEggs.length > 0) {
                 const closestEgg = nearbyEggs.reduce((closest, egg) => {
                    const dist = Math.hypot(x - egg.x, y - egg.y);
                    return (dist < closest.dist) ? { egg, dist } : closest;
                 }, { egg: null as Egg | null, dist: Infinity }).egg;
                 
                 if (closestEgg) {
                     bird.target = { x: closestEgg.x, y: closestEgg.y };
                 }
            }
        }
    }
    
    // 2. Move towards target and attack
    if (bird.target) {
        // Use original grid to find target, but check `nextActorState` for existence
        const targetCellContent = grid[bird.target.y][bird.target.x];
        const targetActor = targetCellContent.find(c => (c.type === 'insect' || c.type === 'egg')) as Insect | Egg | undefined;
        
        if (targetActor && nextActorState.has(targetActor.id)) {
            const dx = Math.sign(bird.target.x - x);
            const dy = Math.sign(bird.target.y - y);
            const newX = x + dx; 
            const newY = y + dy;

            if (newX === bird.target.x && newY === bird.target.y) { // Attack
                nextActorState.delete(targetActor.id);
                bird.target = null;
                
                if (targetActor.type === 'insect') {
                    const nutrientId = `nutrient-${newX}-${newY}-${Date.now()}`;
                    const nutrient: Nutrient = { id: nutrientId, type: 'nutrient', x: newX, y: newY, lifespan: NUTRIENT_FROM_PREY_LIFESPAN };
                    nextActorState.set(nutrientId, nutrient);
                    toasts.push({ message: '🐦 An insect was eaten!', type: 'info' });
                    incrementInsectsEaten();
                } else { // It's an egg
                    toasts.push({ message: '🐦 An egg was eaten!', type: 'info' });
                    incrementEggsEaten();
                    // Eating an egg provides no nutrient
                }

            } else if (newX >= 0 && newX < gridWidth && newY >= 0 && newY < gridHeight && !grid[newY][newX].some(c => c.type ==='bird')) {
                bird.x = newX; 
                bird.y = newY; 
                moved = true;
            }
        } else {
            bird.target = null; // Target is gone
        }
    }

    // 3. Random movement if no target action was taken
    if (!moved && !bird.target) {
        const moves = [[0,1], [0,-1], [1,0], [-1,0]].sort(() => Math.random() - 0.5);
        for (const [dx, dy] of moves) {
            const newX = x + dx; const newY = y + dy;
            if (newX >= 0 && newX < gridWidth && newY >= 0 && newY < gridHeight && !grid[newY][newX].some(c => c.type ==='bird')) {
                bird.x = newX; bird.y = newY; 
                break;
            }
        }
    }

    // 4. Drop random nutrient
    if (Math.random() < BIRD_DROP_NUTRIENT_CHANCE) {
         const pos = findCellForStationaryActor(grid, params, 'nutrient');
         if (pos) {
            const nutrientId = `nutrient-${pos.x}-${pos.y}-${Date.now()}`;
            const nutrient: Nutrient = { id: nutrientId, type: 'nutrient', x: pos.x, y: pos.y, lifespan: NUTRIENT_LIFESPAN };
            nextActorState.set(nutrientId, nutrient);
         }
    }
};
