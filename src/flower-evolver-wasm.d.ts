declare module '@cristianglezm/flower-evolver-wasm' {
  export class FEParams {
    radius: number;
    numLayers: number;
    P: number;
    bias: number;
    constructor(radius: number, numLayers: number, P: number, bias: number);
  }

  // We use the 'any' type for the return of getFlowerStats to avoid duplicating
  // the FlowerGenomeStats interface and creating circular dependencies.
  // The flowerService wrapper already correctly casts this type.
  export class FEService {
    constructor();
    init(): Promise<void>;
    setParams(params: FEParams): void;
    getParams(): FEParams;
    makeFlower(): Promise<{ genome: string; image: string }>;
    makePetals(): Promise<{ genome: string; image: string }>;
    makePetalLayer(layer: number): Promise<{ genome: string; image: string }>;
    makeStem(): Promise<{ genome: string; image: string }>;
    reproduce(father: string, mother: string): Promise<{ genome: string; image: string }>;
    mutate(
      original: string,
      addNodeRate?: number,
      addConnRate?: number,
      removeConnRate?: number,
      perturbWeightsRate?: number,
      enableRate?: number,
      disableRate?: number,
      actTypeRate?: number
    ): Promise<{ genome: string; image: string }>;
    getFlowerStats(
      genome: string,
      humidity?: number,
      temperature?: number,
      altitude?: number,
      terrainType?: number
    ): Promise<any>;
    drawFlower(genome: string): Promise<{ genome: string; image: string }>;
    drawPetals(genome: string): Promise<{ genome: string; image: string }>;
    drawPetalLayer(genome: string, layer: number): Promise<{ genome: string; image: string }>;
    // Renders using current params
    make3DFlower(genome: string, flowerId: string, sex: 'male' | 'female' | 'both'): Promise<string>;
    makeEmissive3DFlower(genome: string, flowerId: string, sex: 'male' | 'female' | 'both'): Promise<string>;
    // Renders using params from genome
    draw3DFlower(genome: string, flowerId: string, sex: 'male' | 'female' | 'both'): Promise<string>;
    drawEmissive3DFlower(genome: string, flowerId: string, sex: 'male' | 'female' | 'both'): Promise<string>;
  }
}
