import type { SimulationParams, CellContent, AppEvent, PopulationTrend, Bird, Eagle, HerbicidePlane, Coord, Grid } from '../types';
import { POPULATION_TREND_WINDOW, POPULATION_GROWTH_THRESHOLD_INSECT, POPULATION_DECLINE_THRESHOLD_INSECT, BIRD_SPAWN_COOLDOWN, EAGLE_SPAWN_COOLDOWN } from '../constants';
import { calculatePopulationTrend, findCellForStationaryActor } from './simulationUtils';
import type { TickSummary } from '../types';

export class PopulationManager {
    private params: SimulationParams;

    // State
    private insectCountHistory: number[] = [];
    private birdCountHistory: number[] = [];
    private birdSpawnCooldown = 0;
    private eagleSpawnCooldown = 0;
    private herbicideCooldown = 0;
    private lastInsectTrend: PopulationTrend = 'stable';
    public totalBirdsHunted = 0;
    public totalHerbicidePlanesSpawned = 0;

    constructor(params: SimulationParams) {
        this.params = params;
    }

    public updateParams(params: SimulationParams) {
        this.params = params;
        this.reset();
    }
    
    public reset() {
        this.insectCountHistory = [];
        this.birdCountHistory = [];
        this.birdSpawnCooldown = 0;
        this.eagleSpawnCooldown = 0;
        this.herbicideCooldown = 0;
        this.lastInsectTrend = 'stable';
        this.totalBirdsHunted = 0;
        this.totalHerbicidePlanesSpawned = 0;
    }

    public loadState(state: { totalBirdsHunted?: number; totalHerbicidePlanesSpawned?: number; }) {
        this.totalBirdsHunted = state.totalBirdsHunted || 0;
        this.totalHerbicidePlanesSpawned = state.totalHerbicidePlanesSpawned || 0;
    }
    
    public processTick(
        nextActorState: Map<string, CellContent>,
        grid: Grid,
        summary: TickSummary,
        events: AppEvent[]
    ): CellContent[] {
        this.updateCooldowns();
        
        const newActors: CellContent[] = [];
        
        this.insectCountHistory.push(summary.insectCount);
        if (this.insectCountHistory.length > POPULATION_TREND_WINDOW) {
            this.insectCountHistory.shift();
        }
        
        this.birdCountHistory.push(summary.birdCount);
        if (this.birdCountHistory.length > POPULATION_TREND_WINDOW) {
            this.birdCountHistory.shift();
        }

        const insectTrend = calculatePopulationTrend(this.insectCountHistory, POPULATION_GROWTH_THRESHOLD_INSECT, POPULATION_DECLINE_THRESHOLD_INSECT);
        if (insectTrend !== this.lastInsectTrend) {
            events.push({ message: `Insect population is now ${insectTrend}.`, type: 'info', importance: 'low' });
            this.lastInsectTrend = insectTrend;
        }

        // Spawn birds
        if (insectTrend === 'growing' && this.birdSpawnCooldown === 0) {
            const spot = findCellForStationaryActor(grid, this.params, 'bird');
            if (spot) {
                const birdId = `bird-dyn-${Date.now()}`;
                const newBird: Bird = { id: birdId, type: 'bird', x: spot.x, y: spot.y, target: null, patrolTarget: null };
                newActors.push(newBird);
                events.push({ message: '🐦 A new bird has arrived to hunt!', type: 'info', importance: 'high' });
                this.birdSpawnCooldown = BIRD_SPAWN_COOLDOWN;
            }
        }
        
        // Spawn eagles
        else if (insectTrend === 'declining') {
            const currentBirdCount = Array.from(nextActorState.values()).filter(a => a.type === 'bird').length;
            if (this.eagleSpawnCooldown === 0 && currentBirdCount > 2) {
                const spot = findCellForStationaryActor(grid, this.params, 'eagle');
                if (spot) {
                    const eagleId = `eagle-dyn-${Date.now()}`;
                    const newEagle: Eagle = { id: eagleId, type: 'eagle', x: spot.x, y: spot.y, target: null };
                    newActors.push(newEagle);
                    events.push({ message: '🦅 An eagle has appeared in the skies!', type: 'info', importance: 'high' });
                    this.eagleSpawnCooldown = EAGLE_SPAWN_COOLDOWN;
                }
            }
        }

        // Spawn herbicide planes
        const flowerCountForDensity = summary.flowerCount;
        const totalCells = this.params.gridWidth * this.params.gridHeight;
        const flowerDensityThresholdCount = totalCells * this.params.herbicideFlowerDensityThreshold;
        const hasPlane = Array.from(nextActorState.values()).some(a => a.type === 'herbicidePlane');
        
        if (this.herbicideCooldown === 0 && !hasPlane && flowerCountForDensity >= flowerDensityThresholdCount) {
            this.totalHerbicidePlanesSpawned++;
            const STRIDE = 3;
            const pattern = Math.floor(Math.random() * 4);
            let start: Coord = { x: 1, y: 1 };
            let dx = 0, dy = 0, turnDx = 0, turnDy = 0;
            const { gridWidth, gridHeight } = this.params;
            const minX = 1, maxX = gridWidth - 2, minY = 1, maxY = gridHeight - 2;

            switch (pattern) {
                case 0: start = { x: minX, y: minY }; dx = 1; dy = 0; turnDx = 0; turnDy = STRIDE; break;
                case 1: start = { x: maxX, y: maxY - (STRIDE - 1) }; dx = -1; dy = 0; turnDx = 0; turnDy = -STRIDE; break;
                case 2: start = { x: minX, y: minY }; dx = 0; dy = 1; turnDx = STRIDE; turnDy = 0; break;
                case 3: start = { x: maxX - (STRIDE - 1), y: maxY }; dx = 0; dy = -1; turnDx = -STRIDE; turnDy = 0; break;
            }
            
            const planeId = `plane-${Date.now()}`;
            const newPlane: HerbicidePlane = { id: planeId, type: 'herbicidePlane', ...start, dx, dy, turnDx, turnDy, stride: STRIDE };
            newActors.push(newPlane);
            events.push({ message: '✈️ Herbicide plane deployed to control flower overgrowth!', type: 'info', importance: 'high' });
            this.herbicideCooldown = this.params.herbicideCooldown;
        }

        return newActors;
    }
    
    private updateCooldowns() {
        if (this.birdSpawnCooldown > 0) this.birdSpawnCooldown--;
        if (this.eagleSpawnCooldown > 0) this.eagleSpawnCooldown--;
        if (this.herbicideCooldown > 0) this.herbicideCooldown--;
    }
}
