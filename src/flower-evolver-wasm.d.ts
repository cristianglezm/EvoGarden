declare module '@cristianglezm/flower-evolver-wasm' {
  export class FEParams {
    constructor(radius: number, numLayers: number, P: number, bias: number);
  }

  // We use the 'any' type for the return of getFlowerStats to avoid duplicating
  // the FlowerGenomeStats interface and creating circular dependencies.
  // The flowerService wrapper already correctly casts this type.
  export class FEService {
    constructor();
    init(): Promise<void>;
    setParams(params: FEParams): void;
    makeFlower(): Promise<{ genome: string; image: string }>;
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
    draw3DFlower(genome: string, flowerId: string, format: "both" | "gltf" | "glb"): Promise<string>;
    drawFlower(genome: string): Promise<{ genome: string; image: string }>;
  }
}
