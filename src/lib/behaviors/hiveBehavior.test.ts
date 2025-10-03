import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processHiveTick } from './hiveBehavior';
import type { Hive, CellContent, SimulationParams, AppEvent, Insect } from '../../types';
import { DEFAULT_SIM_PARAMS, INSECT_GENOME_LENGTH } from '../../constants';
import * as simulationUtils from '../../lib/simulationUtils';

describe('hiveBehavior', () => {
    let hive: Hive;
    let nextActorState: Map<string, CellContent>;
    let events: AppEvent[];
    let newActorQueue: CellContent[];
    const params: SimulationParams = { ...DEFAULT_SIM_PARAMS };

    beforeEach(() => {
        hive = {
            id: 'hive1', type: 'hive', x: 5, y: 5, hiveId: '1',
            honey: 50, pollen: 10, spawnCooldown: 0,
            genome: Array(INSECT_GENOME_LENGTH).fill(0.5),
            storedBees: 0,
        };
        nextActorState = new Map();
        nextActorState.set(hive.id, hive);
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

    it('should convert pollen to honey', () => {
        processHiveTick(hive, setupContext());
        expect(hive.honey).toBe(50 + 10 * params.hivePollenToHoneyRatio);
        expect(hive.pollen).toBe(0);
    });

    it('should not spawn a bee if honey is below threshold', () => {
        hive.honey = params.hiveSpawnThreshold - 1;
        hive.pollen = 0; // Fix: No pollen to convert
        processHiveTick(hive, setupContext());
        expect(newActorQueue.length).toBe(0);
    });

    it('should not spawn a bee if on cooldown', () => {
        hive.honey = params.hiveSpawnThreshold + 1;
        hive.spawnCooldown = 1;
        processHiveTick(hive, setupContext());
        expect(newActorQueue.length).toBe(0);
        expect(hive.spawnCooldown).toBe(0);
    });

    it('should spawn a bee with an inherited genome (no mutation)', () => {
        hive.honey = params.hiveSpawnThreshold + 1;
        hive.pollen = 0; // Fix: No pollen to convert
        hive.spawnCooldown = 0;
        
        // Mock Math.random to prevent mutation
        vi.spyOn(Math, 'random').mockReturnValue(params.mutationChance + 0.1);

        processHiveTick(hive, setupContext());

        expect(hive.honey).toBe(params.hiveSpawnThreshold + 1 - params.hiveSpawnCost);
        expect(hive.spawnCooldown).toBe(5);
        expect(newActorQueue.length).toBe(1);
        
        const newBee = newActorQueue[0] as Insect;
        expect(newBee.type).toBe('insect');
        expect(newBee.emoji).toBe('🐝');
        expect(newBee.hiveId).toBe(hive.hiveId);
        expect(newBee.genome).toEqual(hive.genome); // Should be an exact copy
        
        expect(events.some(e => e.message.includes('A new bee was born'))).toBe(true);
    });

    it('should spawn a bee with a mutated genome', () => {
        hive.honey = params.hiveSpawnThreshold + 1;
        hive.pollen = 0;
        hive.spawnCooldown = 0;

        // Mock findEmptyCell to prevent it from consuming Math.random calls
        vi.spyOn(simulationUtils, 'findEmptyCell').mockReturnValue({ x: 6, y: 6 });

        // Mock Math.random to trigger mutation on the first gene
        let callCount = 0;
        vi.spyOn(Math, 'random').mockImplementation(() => {
            callCount++;
            if (callCount === 1) return params.mutationChance / 2; // Trigger mutation
            if (callCount === 2) return 0.1; // Set mutation amount
            return 1; // No more mutations
        });

        processHiveTick(hive, setupContext());

        const newBee = newActorQueue[0] as Insect;
        expect(newBee.genome).not.toEqual(hive.genome);
        expect(newBee.genome[0]).not.toBe(0.5); // First gene mutated
        expect(newBee.genome.slice(1)).toEqual(hive.genome.slice(1)); // Rest are the same
    });

    it('should release a stored bee when temperature rises', () => {
        const context = setupContext();
        context.currentTemperature = params.beeDormancyTemp + 1; // It's warm
        hive.storedBees = 1;

        processHiveTick(hive, context);
        
        expect(hive.storedBees).toBe(0);
        expect(newActorQueue.length).toBe(1);
        const releasedBee = newActorQueue[0] as Insect;
        expect(releasedBee.type).toBe('insect');
        expect(releasedBee.emoji).toBe('🐝');
        expect(events.some(e => e.message.includes('emerged from its hive'))).toBe(true);
    });

    it('should not release a stored bee when it is cold', () => {
        const context = setupContext();
        context.currentTemperature = params.beeDormancyTemp - 1; // It's cold
        hive.storedBees = 1;

        processHiveTick(hive, context);
        
        expect(hive.storedBees).toBe(1); // Bee remains stored
        expect(newActorQueue.length).toBe(0);
    });

    it('should not release a stored bee if there are no empty adjacent cells', () => {
        const context = setupContext();
        context.currentTemperature = params.beeDormancyTemp + 1;
        hive.storedBees = 1;

        // Block all adjacent cells
        vi.spyOn(simulationUtils, 'findEmptyCell').mockReturnValue(null);
        
        processHiveTick(hive, context);

        expect(hive.storedBees).toBe(1); // Bee could not be released
        expect(newActorQueue.length).toBe(0);
    });
});