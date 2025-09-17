import { FEService as FEServicePackage, FEParams as FEParamsPackage } from '@cristianglezm/flower-evolver-wasm';
import type { FEService, FEParams, FlowerGenomeStats } from '../types';

class FlowerService implements FEService {
    private static instance: FlowerService;
    private service: FEServicePackage;
    private isInitialized = false;

    private constructor() {
        // Defer service initialization to the async `initialize` method,
        this.service = new FEServicePackage();
    }

    public static getInstance(): FlowerService {
        if (!FlowerService.instance) {
            FlowerService.instance = new FlowerService();
        }
        return FlowerService.instance;
    }

    public async initialize(): Promise<void> {
        if (this.isInitialized) return;
        try {
            // The service instance from the WASM package has its own async init method.
            await this.service.init();
            this.isInitialized = true;
        } catch (error) {
            this.isInitialized = false; // Ensure state is correct on failure
            console.error("Failed to initialize FEService:", error);
            throw error; // Re-throw to notify callers of the failure
        }
    }

    private ensureInitialized(): void {
        if (!this.isInitialized) {
            throw new Error("FlowerService has not been initialized. Call initialize() first.");
        }
    }

    setParams(params: FEParams): void {
        this.ensureInitialized();
        this.service.setParams(new FEParamsPackage(params.radius, params.numLayers, params.P, params.bias));
    }

    getParams(): FEParams {
        this.ensureInitialized();
        return this.service.getParams();
    }

    async makeFlower(): Promise<{genome: string, image: string}> {
        this.ensureInitialized();
        return await this.service.makeFlower();
    }

    async makePetals(): Promise<{ genome: string; image: string; }> {
        this.ensureInitialized();
        return await this.service.makePetals();
    }

    async makePetalLayer(layer: number): Promise<{ genome: string; image: string; }> {
        this.ensureInitialized();
        return await this.service.makePetalLayer(layer);
    }

    async makeStem(): Promise<{ genome: string; image: string; }> {
        this.ensureInitialized();
        return await this.service.makeStem();
    }

    async reproduce(father: string, mother: string): Promise<{genome: string, image: string}> {
        this.ensureInitialized();
        return await this.service.reproduce(father, mother);
    }

    async mutate(original: string, addNodeRate?: number, addConnRate?: number, removeConnRate?: number, perturbWeightsRate?: number, enableRate?: number, disableRate?: number, actTypeRate?: number): Promise<{genome: string, image: string}> {
        this.ensureInitialized();
        return await this.service.mutate(original, addNodeRate, addConnRate, removeConnRate, perturbWeightsRate, enableRate, disableRate, actTypeRate);
    }

    async getFlowerStats(genome: string, humidity: number = 0.5, temperature: number = 20, altitude: number = 0, terrainType: number = 0): Promise<FlowerGenomeStats> {
        this.ensureInitialized();
        const stats: FlowerGenomeStats = await this.service.getFlowerStats(genome, humidity, temperature, altitude, terrainType);
        return stats;
    }

    async draw3DFlower(genome: string, sex: 'male' | 'female' | 'both'): Promise<string> {
        this.ensureInitialized();
        const flowerId = `flower-${Math.random().toString(36).substring(2, 9)}`;
        const gltfString = await this.service.draw3DFlower(genome, flowerId, sex);
        return gltfString;
    }

    async drawEmissive3DFlower(genome: string, sex: 'male' | 'female' | 'both'): Promise<string> {
        this.ensureInitialized();
        const flowerId = `flower-${Math.random().toString(36).substring(2, 9)}`;
        return await this.service.drawEmissive3DFlower(genome, flowerId, sex);
    }

    async drawFlower(genome: string): Promise<{genome: string, image: string}> {
        this.ensureInitialized();
        return await this.service.drawFlower(genome);
    }

    async drawPetals(genome: string): Promise<{ genome: string; image: string; }> {
        this.ensureInitialized();
        return await this.service.drawPetals(genome);
    }

    async drawPetalLayer(genome: string, layer: number): Promise<{ genome: string; image: string; }> {
        this.ensureInitialized();
        return await this.service.drawPetalLayer(genome, layer);
    }
}

export const flowerService = FlowerService.getInstance();
