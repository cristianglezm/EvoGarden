import type { Flower, FlowerSeed, SimulationParams, CellContent, FlowerCreationRequest } from '../types';
import { SEED_HEALTH } from '../constants';

interface CompletedFlowerPayload {
    requestId: string;
    flower: Flower | null; // Flower can be null on creation failure
}

export interface CompletedFlowerResult {
    flowersToAdd: Flower[];
    seedsToRemove: string[];
}

export class AsyncFlowerFactory {
    private flowerWorkerPort: MessagePort | null = null;
    private completedFlowersQueue: CompletedFlowerPayload[] = [];
    private stemImageData: string | null = null;
    private pendingRequests = new Set<string>();

    public setFlowerWorkerPort(port: MessagePort, params: SimulationParams) {
        this.flowerWorkerPort = port;
        this.flowerWorkerPort.onmessage = (e: MessageEvent) => {
            this.handleMessage(e.data);
        };
        this.flowerWorkerPort.postMessage({ type: 'update-params', payload: params });
    }

    public setStemImage(imageData: string) {
        this.stemImageData = imageData;
    }

    public updateParams(params: SimulationParams) {
        this.flowerWorkerPort?.postMessage({ type: 'update-params', payload: params });
    }
    
    public reset() {
        this.completedFlowersQueue = [];
        this.pendingRequests.clear();
        this.flowerWorkerPort?.postMessage({ type: 'cancel-all-requests' });
    }

    private handleMessage(data: { type: string, payload: any }) {
        const { type, payload } = data;
        if (type === 'flower-created' || type === 'flower-creation-failed') {
            this.completedFlowersQueue.push(payload);
            this.pendingRequests.delete(payload.requestId);
        }
    }

    public requestNewFlower(
        nextActorState: Map<string, CellContent>,
        x: number,
        y: number,
        parentGenome1: string | undefined,
        parentGenome2: string | undefined,
        getNextId: (type: string, x: number, y: number) => string
    ): FlowerSeed | null {
        if (!this.flowerWorkerPort || !this.stemImageData) {
            console.error("AsyncFlowerFactory not ready to request a new flower.");
            return null;
        }

        let totalHealth = 0;
        let flowerCount = 0;
        for (const actor of nextActorState.values()) {
            if (actor.type === 'flower') {
                totalHealth += (actor as Flower).health;
                flowerCount++;
            }
        }
        
        const avgHealth = flowerCount > 0 ? totalHealth / flowerCount : SEED_HEALTH;
        const seedHealth = Math.max(1, Math.round(avgHealth));

        const requestId = getNextId('seed', x, y);
        const flowerId = getNextId('flower', x, y);
        
        const requestPayload: FlowerCreationRequest = {
            requestId, flowerId, x, y, parentGenome1, parentGenome2
        };

        this.flowerWorkerPort.postMessage({
            type: 'request-flower',
            payload: requestPayload
        });
        
        this.pendingRequests.add(requestId);

        return { id: requestId, type: 'flowerSeed', x, y, imageData: this.stemImageData, health: seedHealth, maxHealth: seedHealth, age: 0 };
    }
    
    public cancelFlowerRequest(requestId: string) {
        this.flowerWorkerPort?.postMessage({
            type: 'cancel-flower-request',
            payload: { requestId }
        });
        // Immediately remove from pending set to update UI counter
        this.pendingRequests.delete(requestId);
    }
    
    public getCompletedFlowers(actorState: Map<string, CellContent>): CompletedFlowerResult {
        const result: CompletedFlowerResult = { flowersToAdd: [], seedsToRemove: [] };
        if (this.completedFlowersQueue.length === 0) {
            return result;
        }

        for (const { requestId, flower } of this.completedFlowersQueue) {
            const seed = actorState.get(requestId);
            if (seed && seed.type === 'flowerSeed') {
                result.seedsToRemove.push(requestId);
                if (flower) {
                    flower.age += seed.age;
                    if (flower.age >= flower.maturationPeriod) {
                        flower.isMature = true;
                    }
                    result.flowersToAdd.push(flower);
                }
            }
        }

        this.completedFlowersQueue = [];
        return result;
    }

    public getPendingRequestCount(): number {
        return this.pendingRequests.size;
    }
}