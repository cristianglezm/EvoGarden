import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processAntColonyTick } from './antColonyBehavior';
import type { AntColony, CellContent, SimulationParams, AppEvent, Insect } from '../../types';
import { DEFAULT_SIM_PARAMS, INSECT_GENOME_LENGTH } from '../../constants';
import * as simulationUtils from '../../lib/simulationUtils';

describe('antColonyBehavior', () => {
    let colony: AntColony;
    let nextActorState: Map<string, CellContent>;
    let events: AppEvent[];
    let newActorQueue: CellContent[];
    const params: SimulationParams = { ...DEFAULT_SIM_PARAMS };

    beforeEach(() => {
        colony = {
            id: 'colony1', type: 'antColony', x: 5, y: 5, colonyId: '1',
            foodReserves: 50, spawnCooldown: 0,
            genome: Array(INSECT_GENOME_LENGTH).fill(0.5),
            storedAnts: 0,
        };
        nextActorState = new Map();
        nextActorState.set(colony.id, colony);
        events = [];
        newActorQueue = [];
        vi.restoreAllMocks();
    });

    const setupContext = () => ({
        nextActorState,
        events,
        newActorQueue,
        params,
        currentTemperature: params.temperature,
    });

    it('should not spawn an ant if food is below threshold', () => {
        colony.foodReserves = params.antColonySpawnThreshold - 1;
        processAntColonyTick(colony, setupContext());
        expect(newActorQueue.length).toBe(0);
    });

    it('should not spawn an ant if on cooldown', () => {
        colony.foodReserves = params.antColonySpawnThreshold + 1;
        colony.spawnCooldown = 1;
        processAntColonyTick(colony, setupContext());
        expect(newActorQueue.length).toBe(0);
        expect(colony.spawnCooldown).toBe(0);
    });

    it('should spawn an ant with an inherited genome', () => {
        colony.foodReserves = params.antColonySpawnThreshold + 1;
        colony.spawnCooldown = 0;
        
        vi.spyOn(Math, 'random').mockReturnValue(params.mutationChance + 0.1); // Prevent mutation
        vi.spyOn(simulationUtils, 'findEmptyCell').mockReturnValue({ x: 6, y: 6 });

        processAntColonyTick(colony, setupContext());

        expect(colony.foodReserves).toBe(params.antColonySpawnThreshold + 1 - params.antColonySpawnCost);
        expect(colony.spawnCooldown).toBe(5);
        expect(newActorQueue.length).toBe(1);
        
        const newAnt = newActorQueue[0] as Insect;
        expect(newAnt.type).toBe('insect');
        expect(newAnt.emoji).toBe('🐜');
        expect(newAnt.colonyId).toBe(colony.colonyId);
        expect(newAnt.genome).toEqual(colony.genome);
        
        expect(events.some(e => e.message.includes('A new ant was born'))).toBe(true);
    });

    it('should release a stored ant when temperature rises', () => {
        const context = setupContext();
        context.currentTemperature = params.antDormancyTemp + 1;
        colony.storedAnts = 1;
        vi.spyOn(simulationUtils, 'findEmptyCell').mockReturnValue({ x: 6, y: 6 });

        processAntColonyTick(colony, context);
        
        expect(colony.storedAnts).toBe(0);
        expect(newActorQueue.length).toBe(1);
        const releasedAnt = newActorQueue[0] as Insect;
        expect(releasedAnt.emoji).toBe('🐜');
        expect(events.some(e => e.message.includes('emerged from its colony'))).toBe(true);
    });

    it('should not release a stored ant when it is cold', () => {
        const context = setupContext();
        context.currentTemperature = params.antDormancyTemp - 1;
        colony.storedAnts = 1;

        processAntColonyTick(colony, context);
        
        expect(colony.storedAnts).toBe(1);
        expect(newActorQueue.length).toBe(0);
    });
});
