import type { CellContent, Flower, FlowerSeed, Insect, SimulationParams } from '../types';

const CELL_SIZE_PX = 64;
const GRID_COLOR = 'hsla(120, 100%, 50%, 0.2)';
const SELECTED_CELL_COLOR = 'hsla(120, 100%, 50%, 0.4)';

/**
 * Helper function to efficiently check if the members of two sets are different.
 */
function haveSetsChanged<T>(setA: Set<T>, setB: Set<T>): boolean {
    if (setA.size !== setB.size) return true;
    for (const item of setA) {
        if (!setB.has(item)) return true;
    }
    return false;
}

export class RenderingEngine {
    private bgCanvas: HTMLCanvasElement;
    private fgCanvas: HTMLCanvasElement;
    private bgCtx: CanvasRenderingContext2D;
    private fgCtx: CanvasRenderingContext2D;
    private params: SimulationParams;
    private imageCache = new Map<string, HTMLImageElement>();
    
    // State for change detection
    private lastStaticActorIds = new Set<string>();
    private lastSelectedId: string | null = null;
    
    constructor(bgCanvas: HTMLCanvasElement, fgCanvas: HTMLCanvasElement, params: SimulationParams) {
        this.bgCanvas = bgCanvas;
        this.fgCanvas = fgCanvas;
        this.params = params;

        const bgCtx = bgCanvas.getContext('2d');
        const fgCtx = fgCanvas.getContext('2d');
        if (!bgCtx || !fgCtx) {
            throw new Error("Could not get canvas contexts");
        }
        this.bgCtx = bgCtx;
        this.fgCtx = fgCtx;

        this.updateCanvasSize();
    }

    public updateParams(newParams: SimulationParams) {
        this.params = newParams;
        this.updateCanvasSize();
        // Force a full redraw of static elements on the next frame
        this.lastStaticActorIds.clear(); 
        this.lastSelectedId = null;
    }

    private updateCanvasSize() {
        const width = this.params.gridWidth * CELL_SIZE_PX;
        const height = this.params.gridHeight * CELL_SIZE_PX;
        this.bgCanvas.width = width;
        this.bgCanvas.height = height;
        this.fgCanvas.width = width;
        this.fgCanvas.height = height;
    }

    public drawGrid() {
        this.bgCtx.clearRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);
        this.bgCtx.strokeStyle = GRID_COLOR;
        for (let y = 0; y < this.params.gridHeight; y++) {
            for (let x = 0; x < this.params.gridWidth; x++) {
                this.bgCtx.strokeRect(x * CELL_SIZE_PX, y * CELL_SIZE_PX, CELL_SIZE_PX, CELL_SIZE_PX);
            }
        }
    }

    private drawEmoji(ctx: CanvasRenderingContext2D, actor: CellContent) {
        const emoji =
            actor.type === 'bird' ? '🐦' :
            actor.type === 'eagle' ? '🦅' :
            actor.type === 'insect' ? (actor as Insect).emoji :
            actor.type === 'nutrient' ? '💩' :
            actor.type === 'egg' ? '🥚' :
            actor.type === 'herbicidePlane' ? '✈️' :
            actor.type === 'herbicideSmoke' ? '💨' : '';
        
        if (emoji) {
            ctx.save();
            ctx.globalAlpha = 0.9;
            ctx.font = `${CELL_SIZE_PX * 0.6}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(emoji, actor.x * CELL_SIZE_PX + CELL_SIZE_PX / 2, actor.y * CELL_SIZE_PX + CELL_SIZE_PX / 2);
            ctx.restore();
        }
    }

    private drawImage(actor: Flower | FlowerSeed) {
        // Both Flower and FlowerSeed now have an imageData property.
        const dataUrl = actor.imageData;
        if (!dataUrl) return;

        let img = this.imageCache.get(dataUrl);

        if (img?.complete) {
            this.bgCtx.drawImage(img, actor.x * CELL_SIZE_PX, actor.y * CELL_SIZE_PX, CELL_SIZE_PX, CELL_SIZE_PX);
        } else if (!img) {
            img = new Image();
            img.onload = () => {
                // Image has loaded. Force a redraw on the next frame by invalidating the actor set.
                // The next call to draw() will now see a change and redraw the static layer.
                this.lastStaticActorIds.clear();
            };
            img.src = dataUrl;
            this.imageCache.set(dataUrl, img);
        }
    }


    public draw(actors: Map<string, CellContent>, selectedFlowerId: string | null) {
        const staticActors = new Map<string, Flower | FlowerSeed>();
        const dynamicActors: CellContent[] = [];

        for (const actor of actors.values()) {
            if (actor.type === 'flower' || actor.type === 'flowerSeed') {
                staticActors.set(actor.id, actor);
            } else {
                dynamicActors.push(actor);
            }
        }

        // --- Change Detection ---
        const currentStaticActorIds = new Set(staticActors.keys());
        const staticActorsChanged = haveSetsChanged(this.lastStaticActorIds, currentStaticActorIds);
        const selectionChanged = this.lastSelectedId !== selectedFlowerId;

        // Only redraw the expensive static layer if something has actually changed.
        if (staticActorsChanged || selectionChanged) {
            this.drawStaticLayer(staticActors, selectedFlowerId);
            this.lastStaticActorIds = currentStaticActorIds;
            this.lastSelectedId = selectedFlowerId;
        }

        this.drawDynamicLayer(dynamicActors);
    }

    private _collectGarbage(currentStaticActors: Map<string, Flower | FlowerSeed>) {
        const activeImageUrls = new Set<string>();
        for (const actor of currentStaticActors.values()) {
            if (actor.imageData) {
                 activeImageUrls.add(actor.imageData);
            }
        }
        for (const cachedUrl of this.imageCache.keys()) {
            if (!activeImageUrls.has(cachedUrl)) {
                this.imageCache.delete(cachedUrl);
            }
        }
    }
    
    /**
     * Performs a full, clean redraw of the static background layer.
     * This is an expensive operation and should only be called when necessary.
     */
    private drawStaticLayer(currentStaticActors: Map<string, Flower | FlowerSeed>, selectedFlowerId: string | null) {
        // 1. Clear canvas and redraw grid lines
        this.drawGrid();

        // 2. Draw all current static actors
        for (const actor of currentStaticActors.values()) {
            this.drawImage(actor);
        }

        // 3. Draw selection highlight on top
        if (selectedFlowerId) {
            const selectedActor = currentStaticActors.get(selectedFlowerId);
            if (selectedActor) {
                this.bgCtx.fillStyle = SELECTED_CELL_COLOR;
                this.bgCtx.fillRect(selectedActor.x * CELL_SIZE_PX, selectedActor.y * CELL_SIZE_PX, CELL_SIZE_PX, CELL_SIZE_PX);
            }
        }
        
        // 4. Clean up the image cache
        this._collectGarbage(currentStaticActors);
    }

    private drawDynamicLayer(dynamicActors: CellContent[]) {
        this.fgCtx.clearRect(0, 0, this.fgCanvas.width, this.fgCanvas.height);
        for (const actor of dynamicActors) {
            this.drawEmoji(this.fgCtx, actor);
        }
    }
}
