import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleInsectReproduction } from './ecosystemManager';
import type { Insect, CellContent, AppEvent, Egg } from '../types';
import { DEFAULT_SIM_PARAMS, INSECT_DATA, INSECT_GENOME_LENGTH, MUTATION_CHANCE } from '../constants';
import * as simulationUtils from './simulationUtils';

describe('ecosystemManager', () => {
    
    describe('handleInsectReproduction', () => {
        let nextActorState: Map<string, CellContent>;
        let events: AppEvent[];
        const params = { ...DEFAULT_SIM_PARAMS, gridWidth: 5, gridHeight: 5 };
        const baseStats = INSECT_DATA.get('🦋')!;
        const getNextId = vi.fn((type, x, y) => `${type}-${x}-${y}`);


        const createTestInsect = (id: string, x: number, y: number, genome: number[]): Insect => ({
            id, type: 'insect', x, y, emoji: '🦋', pollen: null,
            health: baseStats.maxHealth,
            maxHealth: baseStats.maxHealth,
            stamina: baseStats.maxStamina,
            maxStamina: baseStats.maxStamina,
            genome: genome,
        });
        
        beforeEach(() => {
            nextActorState = new Map();
            events = [];
            vi.restoreAllMocks(); // Restore all mocks before each test
        });
        
        it('should create an egg with a mixed genome from two parents', () => {
            const genome1 = Array(INSECT_GENOME_LENGTH).fill(1);
            const genome2 = Array(INSECT_GENOME_LENGTH).fill(-1);
            const parent1 = createTestInsect('p1', 1, 1, genome1);
            const parent2 = createTestInsect('p2', 1, 1, genome2);
            
            nextActorState.set(parent1.id, parent1);
            nextActorState.set(parent2.id, parent2);
            
            // Pick parent1 for crossover (0.4 < 0.5) and prevent mutation (0.4 is not < 0.05)
            vi.spyOn(Math, 'random').mockReturnValue(0.4);

            const eggsLaid = handleInsectReproduction(nextActorState, params, events, getNextId);
            expect(eggsLaid).toBe(1);
            
            const egg = Array.from(nextActorState.values()).find(a => a.type === 'egg') as Egg;
            expect(egg).toBeDefined();

            // With Math.random mocked to 0.4, crossover will always pick from parent1
            expect(egg.genome).toEqual(genome1);
        });

        it('should apply mutation to the offspring genome', () => {
            const genome1 = Array(INSECT_GENOME_LENGTH).fill(1);
            const genome2 = Array(INSECT_GENOME_LENGTH).fill(1);
            const parent1 = createTestInsect('p1', 1, 1, genome1);
            const parent2 = createTestInsect('p2', 1, 1, genome2);
            
            nextActorState.set(parent1.id, parent1);
            nextActorState.set(parent2.id, parent2);
            
            // Mock this utility to prevent it from consuming Math.random calls
            vi.spyOn(simulationUtils, 'findCellForStationaryActor').mockReturnValue({ x: 2, y: 2 });
            
            // Mock random to trigger mutation on the first gene
            let callCount = 0;
            vi.spyOn(Math, 'random').mockImplementation(() => {
                callCount++;
                if (callCount <= INSECT_GENOME_LENGTH) {
                    // Crossover phase: always pick parent1
                    return 0;
                }
                if (callCount === INSECT_GENOME_LENGTH + 1) {
                    // First mutation check: trigger mutation
                    return MUTATION_CHANCE / 2;
                }
                 if (callCount === INSECT_GENOME_LENGTH + 2) {
                    // Mutation amount: use a value that won't result in a multiplication by 1 (i.e. not 0.5)
                    return 0.1;
                }
                // Subsequent mutation checks: no mutation
                return 1;
            });

            handleInsectReproduction(nextActorState, params, events, getNextId);
            
            const egg = Array.from(nextActorState.values()).find(a => a.type === 'egg') as Egg;
            expect(egg).toBeDefined();
            
            // The first gene should have mutated, the rest should be 1
            expect(egg.genome[0]).not.toBe(1);
            expect(egg.genome.slice(1)).toEqual(Array(INSECT_GENOME_LENGTH - 1).fill(1));
        });

        it('should not reproduce if an insect is on cooldown', () => {
            const parent1 = createTestInsect('p1', 1, 1, []);
            parent1.reproductionCooldown = 5;
            const parent2 = createTestInsect('p2', 1, 1, []);
            
            nextActorState.set(parent1.id, parent1);
            nextActorState.set(parent2.id, parent2);
            
            const eggsLaid = handleInsectReproduction(nextActorState, params, events, getNextId);
            
            expect(eggsLaid).toBe(0);
        });

        it('should not reproduce if stamina is too low', () => {
             const parent1 = createTestInsect('p1', 1, 1, []);
             parent1.stamina = baseStats.reproductionCost - 1;
             const parent2 = createTestInsect('p2', 1, 1, []);
             // Both parents need low stamina because the one with enough stamina could initiate
             parent2.stamina = baseStats.reproductionCost - 1;
            
             nextActorState.set(parent1.id, parent1);
             nextActorState.set(parent2.id, parent2);
            
             const eggsLaid = handleInsectReproduction(nextActorState, params, events, getNextId);
            
             expect(eggsLaid).toBe(0);
        });
    });
});