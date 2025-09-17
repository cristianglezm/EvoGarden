import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initializeGridState } from './simulationInitializer';
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
    });

    it('initializeGridState should create a grid with correct dimensions', async () => {
        const params = { ...DEFAULT_SIM_PARAMS, gridWidth: 10, gridHeight: 12 };
        const grid = await initializeGridState(params, mockFlowerService);
        expect(grid.length).toBe(12);
        expect(grid[0].length).toBe(10);
    });

    it('initializeGridState should populate with correct number of actors', async () => {
        const params = { ...DEFAULT_SIM_PARAMS, initialFlowers: 5, initialInsects: 3, initialBirds: 2 };
        const grid = await initializeGridState(params, mockFlowerService);

        const flowers = grid.flat(2).filter(c => c.type === 'flower');
        const insects = grid.flat(2).filter(c => c.type === 'insect');
        const birds = grid.flat(2).filter(c => c.type === 'bird');

        expect(flowers.length).toBe(5);
        expect(insects.length).toBe(3);
        expect(birds.length).toBe(2);

        expect(mockFlowerService.makeFlower).toHaveBeenCalledTimes(5);
        expect(mockFlowerService.getFlowerStats).toHaveBeenCalledTimes(5);
    });
});
