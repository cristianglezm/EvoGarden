import type { Bird, Insect, Egg, Nutrient, CellContent, Grid, SimulationParams, AppEvent, Flower, Cocoon } from '../../types';
import { Quadtree, Rectangle } from '../Quadtree';
import { BIRD_DROP_NUTRIENT_CHANCE, NUTRIENT_LIFESPAN } from '../../constants';
import { findCellForStationaryActor, getActorsOnCell } from '../simulationUtils';

const BIRD_VISION_RANGE = 7;

export interface BirdContext {
    grid: Grid;
    params: SimulationParams;
    qtree: Quadtree<CellContent>;
    flowerQtree: Quadtree<CellContent>;
    nextActorState: Map<string, CellContent>;
    events: AppEvent[];
    incrementInsectsEaten: () => void;
    incrementEggsEaten: () => void;
    incrementCocoonsEaten: () => void;
    getNextId: (type: string, x: number, y: number) => string;
}

export const processBirdTick = (bird: Bird, context: BirdContext) => {
    const { grid, params, qtree, flowerQtree, nextActorState, events, incrementInsectsEaten, incrementEggsEaten, incrementCocoonsEaten, getNextId } = context;
    const { gridWidth, gridHeight } = params;
    const { x, y } = bird;
    let moved = false;

    // 1. Find a prey target if we don't have one
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
            // Priority 2: Find unprotected cocoons
            const nearbyCocoons = nearbyPoints
                .map(p => p.data)
                .filter(a => {
                    if (a?.type !== 'cocoon' || !nextActorState.has(a.id)) return false;
                    const isProtected = grid[a.y][a.x].some(c => c.type === 'flower');
                    return !isProtected;
                }) as Cocoon[];
            
            if (nearbyCocoons.length > 0) {
                 const closestCocoon = nearbyCocoons.reduce((closest, cocoon) => {
                    const dist = Math.hypot(x - cocoon.x, y - cocoon.y);
                    return (dist < closest.dist) ? { cocoon, dist } : closest;
                 }, { cocoon: null as Cocoon | null, dist: Infinity }).cocoon;
                 
                 if (closestCocoon) {
                     bird.target = { x: closestCocoon.x, y: closestCocoon.y };
                 }
            } else {
                // Priority 3: Find unprotected eggs if no insects or cocoons are available
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
    }
    
    // 2. Move towards prey target and attack
    if (bird.target) {
        const targetCellContent = getActorsOnCell(qtree, nextActorState, bird.target.x, bird.target.y);
        const targetActor = targetCellContent.find(c => (c.type === 'insect' || c.type === 'egg' || c.type === 'cocoon')) as Insect | Egg | Cocoon | undefined;
        
        if (targetActor && nextActorState.has(targetActor.id)) {
            const dx = Math.sign(bird.target.x - x);
            const dy = Math.sign(bird.target.y - y);
            const newX = x + dx; 
            const newY = y + dy;

            if (newX === bird.target.x && newY === bird.target.y) { // Attack
                nextActorState.delete(targetActor.id);
                bird.target = null;
                bird.x = newX; // Move onto the cell
                bird.y = newY;
                moved = true;
                
                if (targetActor.type === 'insect') {
                    const nutrientId = getNextId('nutrient', newX, newY);
                    // Nutrient lifespan is proportional to the insect's max health
                    const nutrientLifespan = 2 + Math.floor((targetActor as Insect).maxHealth / 30);
                    const nutrient: Nutrient = { id: nutrientId, type: 'nutrient', x: newX, y: newY, lifespan: nutrientLifespan };
                    nextActorState.set(nutrientId, nutrient);
                    events.push({ message: '🐦 An insect was eaten!', type: 'info', importance: 'low' });
                    incrementInsectsEaten();
                } else if (targetActor.type === 'egg') {
                    events.push({ message: '🐦 An egg was eaten!', type: 'info', importance: 'low' });
                    incrementEggsEaten();
                    // Eating an egg provides no nutrient
                } else if (targetActor.type === 'cocoon') {
                    events.push({ message: '🐦 A cocoon was eaten!', type: 'info', importance: 'low' });
                    incrementCocoonsEaten();
                    const nutrientId = getNextId('nutrient', newX, newY);
                    const nutrientLifespan = 2; // small nutrient
                    const nutrient: Nutrient = { id: nutrientId, type: 'nutrient', x: newX, y: newY, lifespan: nutrientLifespan };
                    nextActorState.set(nutrientId, nutrient);
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

    // 3. If the bird didn't move to attack prey, it should patrol or wander.
    if (!moved) {
        if (bird.patrolTarget && bird.x === bird.patrolTarget.x && bird.y === bird.patrolTarget.y) {
            bird.patrolTarget = null;
        }

        if (!bird.patrolTarget) {
            const allFlowers = flowerQtree.query(new Rectangle(gridWidth / 2, gridHeight / 2, gridWidth / 2, gridHeight / 2)).map(p => p.data as Flower);
            if (allFlowers.length > 0) {
                const randomFlower = allFlowers[Math.floor(Math.random() * allFlowers.length)];
                bird.patrolTarget = { x: randomFlower.x, y: randomFlower.y };
            }
        }

        let dx = 0, dy = 0;
        if (bird.patrolTarget) {
            dx = Math.sign(bird.patrolTarget.x - x);
            dy = Math.sign(bird.patrolTarget.y - y);
        } else {
            const moves = [[0,1], [0,-1], [1,0], [-1,0]].sort(() => Math.random() - 0.5);
            [dx, dy] = moves[0];
        }
        
        const newX = x + dx;
        const newY = y + dy;
        if (newX >= 0 && newX < gridWidth && newY >= 0 && newY < gridHeight && !grid[newY][newX].some(c => c.type ==='bird')) {
            bird.x = newX;
            bird.y = newY;
        }
    }

    // 4. Drop random nutrient
    if (Math.random() < BIRD_DROP_NUTRIENT_CHANCE) {
         const pos = findCellForStationaryActor(grid, params, 'nutrient');
         if (pos) {
            const nutrientId = getNextId('nutrient', pos.x, pos.y);
            const nutrient: Nutrient = { id: nutrientId, type: 'nutrient', x: pos.x, y: pos.y, lifespan: NUTRIENT_LIFESPAN };
            nextActorState.set(nutrientId, nutrient);
         }
    }
};
