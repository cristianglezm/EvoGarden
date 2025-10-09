import type { AntColony, Insect, CellContent, SimulationParams, AppEvent } from '../../types';
import { INSECT_DATA } from '../../constants';
import { findEmptyCell } from '../simulationUtils';

interface AntColonyContext {
    nextActorState: Map<string, CellContent>;
    events: AppEvent[];
    newActorQueue: CellContent[];
    params: SimulationParams;
    currentTemperature: number;
    getNextId: (type: string, x: number, y: number) => string;
}

function createAntFromColony(colony: AntColony, position: {x: number, y: number}, params: SimulationParams, getNextId: (type: string, x: number, y: number) => string): Insect {
    const baseStats = INSECT_DATA.get('🐜')!;
    const newAntId = getNextId('insect-ant', position.x, position.y);
    
    // Inherit from colony, with mutation
    const newGenome = [...colony.genome];
    for (let i = 0; i < newGenome.length; i++) {
        if (Math.random() < params.mutationChance) {
            newGenome[i] *= 1 + (Math.random() * params.mutationAmount * 2) - params.mutationAmount;
        }
    }

    return {
        id: newAntId,
        type: 'insect',
        x: position.x,
        y: position.y,
        emoji: '🐜',
        pollen: null,
        colonyId: colony.colonyId,
        colonyPosition: { x: colony.x, y: colony.y },
        health: baseStats.maxHealth,
        maxHealth: baseStats.maxHealth,
        stamina: baseStats.maxStamina,
        maxStamina: baseStats.maxStamina,
        genome: newGenome,
        behaviorState: 'seeking_food',
    };
}

export const processAntColonyTick = (colony: AntColony, context: AntColonyContext) => {
    const { nextActorState, events, newActorQueue, params, currentTemperature, getNextId } = context;
    
    // 1. Handle ants emerging from dormancy
    if (currentTemperature > params.antDormancyTemp && colony.storedAnts && colony.storedAnts > 0) {
        const spawnSpot = findEmptyCell(
            Array.from({ length: params.gridHeight }, (_, y) => 
                Array.from({ length: params.gridWidth }, (_, x) => 
                    Array.from(nextActorState.values()).filter(a => a.x === x && a.y === y)
                )
            ), 
            params, 
            { x: colony.x, y: colony.y }
        );

        if (spawnSpot) {
            colony.storedAnts--;
            const newAnt = createAntFromColony(colony, spawnSpot, params, getNextId);
            newActorQueue.push(newAnt);
            events.push({ message: `🐜 An ant emerged from its colony as the weather warmed.`, type: 'info', importance: 'low' });
        }
    }

    // 2. Spawn new ants if food reserves are high
    if (colony.foodReserves >= params.antColonySpawnThreshold && colony.spawnCooldown === 0) {
        const spawnSpot = findEmptyCell(
            Array.from({ length: params.gridHeight }, (_, y) => 
                Array.from({ length: params.gridWidth }, (_, x) => 
                    Array.from(nextActorState.values()).filter(a => a.x === x && a.y === y)
                )
            ), 
            params, 
            { x: colony.x, y: colony.y }
        );

        if (spawnSpot) {
            colony.foodReserves = Math.max(0, colony.foodReserves - params.antColonySpawnCost);
            colony.spawnCooldown = 5; // Simple cooldown
            const newAnt = createAntFromColony(colony, spawnSpot, params, getNextId);
            newActorQueue.push(newAnt);
            events.push({ message: `🐜 A new ant was born at Colony ${colony.colonyId}!`, type: 'info', importance: 'low' });
        }
    } else if (colony.spawnCooldown > 0) {
        colony.spawnCooldown--;
    }
};
