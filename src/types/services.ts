
import type { FlowerGenomeStats } from './actors';

export interface FEService {
    initialize(): Promise<void>;
    setParams(params: FEParams): void;
    getParams(): FEParams;
    makeFlower(): Promise<{genome: string, image: string}>;
    makePetals(): Promise<{ genome: string; image: string }>;
    makePetalLayer(layer: number): Promise<{ genome: string; image: string }>;
    makeStem(): Promise<{ genome: string; image: string }>;
    reproduce(father: string, mother: string): Promise<{genome: string, image: string}>;
    mutate(original: string, addNodeRate?: number, addConnRate?: number, removeConnRate?: number, perturbWeightsRate?: number, enableRate?: number, disableRate?: number, actTypeRate?: number): Promise<{genome: string, image: string}>;
    getFlowerStats(genome: string, humidity?: number, temperature?: number, altitude?: number, terrainType?: number): Promise<FlowerGenomeStats>;
    drawFlower(genome: string): Promise<{genome: string, image: string}>;
    drawPetals(genome: string): Promise<{ genome: string; image: string }>;
    drawPetalLayer(genome: string, layer: number): Promise<{ genome: string; image: string }>;
    draw3DFlower(genome: string, sex: 'male' | 'female' | 'both'): Promise<string>;
    drawEmissive3DFlower(genome: string, sex: 'male' | 'female' | 'both'): Promise<string>;
}

export interface FEParams {
    radius: number;
    numLayers: number;
    P: number;
    bias: number;
}
