import { db } from './db';
import { flowerService } from './flowerService';
import { createSpeciesSource } from './speciesSource';

// The classifier is read when it is used: it exists once the wasm service is initialised.
export const defaultSpeciesSource = createSpeciesSource(db, () => flowerService.speciesClassifier);
