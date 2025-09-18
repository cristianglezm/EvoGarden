import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInitialMobileActors, createNewFlower } from './simulationInitializer';
import type { FEService, FlowerGenomeStats } from '../types';
import { DEFAULT_SIM_PARAMS } from '../constants';

const mockFlowerService: FEService = {
    initialize: vi.fn().mockResolvedValue(undefined),
    setParams: vi.fn(),
    getParams: vi.fn(),
    makeFlower: vi.fn(),
    makePetals: vi.fn(),
    makePetalLayer: vi.fn(),
    makeStem: vi.fn(),
    reproduce: vi.fn(),
    mutate: vi.fn(),
    getFlowerStats: vi.fn(),
    drawFlower: vi.fn(),
    drawPetals: vi.fn(),
    drawPetalLayer: vi.fn(),
    draw3DFlower: vi.fn(),
    drawEmissive3DFlower: vi.fn(),
};

const mockFlowerData = { genome: 'test-genome', image: 'test-image-data' };
const mockFlowerStats: FlowerGenomeStats = {
    health: 100, stamina: 100, maturationPeriod: 50, sex: 'both',
    minTemperature: 10, maxTemperature: 30, toxicityRate: 0.1,
    effects: { vitality: 10, agility: 5, strength: 5, intelligence: 5, luck: 5 },
};

describe('simulationInitializer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(mockFlowerService.makeFlower).mockResolvedValue(mockFlowerData);
        vi.mocked(mockFlowerService.getFlowerStats).mockResolvedValue(mockFlowerStats);
        vi.mocked(mockFlowerService.reproduce).mockResolvedValue({ genome: 'child-genome', image: 'child-image' });
        vi.mocked(mockFlowerService.mutate).mockResolvedValue({ genome: 'mutated-genome', image: 'mutated-image' });
    });

    describe('createNewFlower', () => {
        it('should call makeFlower when no genomes are provided', async () => {
            await createNewFlower(mockFlowerService, DEFAULT_SIM_PARAMS, 1, 1);
            expect(mockFlowerService.makeFlower).toHaveBeenCalledTimes(1);
            expect(mockFlowerService.reproduce).not.toHaveBeenCalled();
            expect(mockFlowerService.mutate).not.toHaveBeenCalled();
        });

        it('should call reproduce when two genomes are provided', async () => {
            await createNewFlower(mockFlowerService, DEFAULT_SIM_PARAMS, 1, 1, 'g1', 'g2');
            expect(mockFlowerService.reproduce).toHaveBeenCalledWith('g1', 'g2');
            expect(mockFlowerService.makeFlower).not.toHaveBeenCalled();
        });

        it('should call mutate when one genome is provided', async () => {
            await createNewFlower(mockFlowerService, DEFAULT_SIM_PARAMS, 1, 1, 'g1');
            expect(mockFlowerService.mutate).toHaveBeenCalledWith('g1');
            expect(mockFlowerService.makeFlower).not.toHaveBeenCalled();
        });

        it('should return a fully formed Flower object', async () => {
            const flower = await createNewFlower(mockFlowerService, DEFAULT_SIM_PARAMS, 5, 10);
            expect(flower).not.toBeNull();
            expect(flower).toMatchObject({
                type: 'flower',
                x: 5,
                y: 10,
                genome: mockFlowerData.genome,
                imageData: mockFlowerData.image,
                health: mockFlowerStats.health,
                stamina: mockFlowerStats.stamina,
                maxHealth: mockFlowerStats.health,
                maxStamina: mockFlowerStats.stamina,
                isMature: false,
                age: 0,
            });
        });
    });

    describe('createInitialMobileActors', () => {
        it('should create the correct number of insects and birds', () => {
            const params = { ...DEFAULT_SIM_PARAMS, initialInsects: 3, initialBirds: 2 };
            const actors = createInitialMobileActors(params);

            const insects = actors.filter(c => c.type === 'insect');
            const birds = actors.filter(c => c.type === 'bird');
            
            expect(actors.length).toBe(5);
            expect(insects.length).toBe(3);
            expect(birds.length).toBe(2);
        });

        it('should return actors with placeholder coordinates', () => {
            const params = { ...DEFAULT_SIM_PARAMS, initialInsects: 1, initialBirds: 1 };
            const actors = createInitialMobileActors(params);
            expect(actors[0].x).toBe(-1);
            expect(actors[0].y).toBe(-1);
            expect(actors[1].x).toBe(-1);
            expect(actors[1].y).toBe(-1);
        });
    });
});
