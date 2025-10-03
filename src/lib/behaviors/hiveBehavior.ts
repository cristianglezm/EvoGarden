import type { Hive, Insect, CellContent, SimulationParams, AppEvent } from '../../types';
import { INSECT_DATA } from '../../constants';
import { findEmptyCell } from '../simulationUtils';

interface HiveContext {
    nextActorState: Map<string, CellContent>;
    events: AppEvent[];
    newActorQueue: CellContent[];
    params: SimulationParams;
    currentTemperature: number;
}

function createBeeFromHive(hive: Hive, position: {x: number, y: number}, params: SimulationParams): Insect {
    const baseStats = INSECT_DATA.get('🐝')!;
    const newBeeId = `insect-honeybee-${position.x}-${position.y}-${Date.now()}`;
    
    // Inherit from hive, with mutation
    const newGenome = [...hive.genome];
    for (let i = 0; i < newGenome.length; i++) {
        if (Math.random() < params.mutationChance) {
            newGenome[i] *= 1 + (Math.random() * params.mutationAmount * 2) - params.mutationAmount;
        }
    }

    return {
        id: newBeeId,
        type: 'insect',
        x: position.x,
        y: position.y,
        emoji: '🐝',
        pollen: null,
        hiveId: hive.hiveId,
        health: baseStats.maxHealth,
        maxHealth: baseStats.maxHealth,
        stamina: baseStats.maxStamina,
        maxStamina: baseStats.maxStamina,
        genome: newGenome,
        behaviorState: 'seeking_food',
    };
}

export const processHiveTick = (hive: Hive, context: HiveContext) => {
    const { nextActorState, events, newActorQueue, params, currentTemperature } = context;
    
    // 1. Handle bees emerging from dormancy
    if (currentTemperature > params.beeDormancyTemp && hive.storedBees && hive.storedBees > 0) {
        const spawnSpot = findEmptyCell(
            Array.from({ length: params.gridHeight }, (_, y) => 
                Array.from({ length: params.gridWidth }, (_, x) => 
                    Array.from(nextActorState.values()).filter(a => a.x === x && a.y === y)
                )
            ), 
            params, 
            { x: hive.x, y: hive.y }
        );

        if (spawnSpot) {
            hive.storedBees--;
            const newBee = createBeeFromHive(hive, spawnSpot, params);
            newActorQueue.push(newBee);
            events.push({ message: `🐝 A bee emerged from its hive as the weather warmed.`, type: 'info', importance: 'low' });
        }
    }

    // 2. Convert pollen to honey
    if (hive.pollen > 0) {
        hive.honey += hive.pollen * params.hivePollenToHoneyRatio;
        hive.pollen = 0;
    }
    // 3. Spawn new bees if honey reserves are high
    if (hive.honey >= params.hiveSpawnThreshold && hive.spawnCooldown === 0) {
        const spawnSpot = findEmptyCell(
            // A bit inefficient, but needed to find a spot for the bee
            Array.from({ length: params.gridHeight }, (_, y) => 
                Array.from({ length: params.gridWidth }, (_, x) => 
                    Array.from(nextActorState.values()).filter(a => a.x === x && a.y === y)
                )
            ), 
            params, 
            { x: hive.x, y: hive.y }
        );

        if (spawnSpot) {
            hive.honey = Math.max(0, hive.honey - params.hiveSpawnCost);
            hive.spawnCooldown = 5; // Simple cooldown
            const newBee = createBeeFromHive(hive, spawnSpot, params);
            newActorQueue.push(newBee);
            events.push({ message: `🐝 A new bee was born at Hive ${hive.hiveId}!`, type: 'info', importance: 'low' });
        }
    } else if (hive.spawnCooldown > 0) {
        // Decrement cooldown if not spawning
        hive.spawnCooldown--;
    }
};