import type { CellContent, Flower, Insect, SimulationParams } from '../types';

const CELL_SIZE_PX = 64;
const GRID_COLOR = 'hsla(120, 100%, 50%, 0.2)';
const SELECTED_CELL_COLOR = 'hsla(120, 100%, 50%, 0.4)';
const SAPLING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M32 56V24M32 24C32 12 40 12 40 12M32 24C32 12 24 12 24 12" stroke="lightgreen" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;
const SAPLING_IMAGE_DATA_URL = `data:image/svg+xml;base64,${btoa(SAPLING_SVG)}`;

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
    private saplingImage: HTMLImageElement;
    
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

        this.saplingImage = new Image();
        this.saplingImage.src = SAPLING_IMAGE_DATA_URL;

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

    private drawFlower(flower: Flower) {
        if (!flower.imageData) return;

        const dataUrl = `${flower.imageData}`;
        let img = this.imageCache.get(dataUrl);

        if (img?.complete) {
            this.bgCtx.drawImage(img, flower.x * CELL_SIZE_PX, flower.y * CELL_SIZE_PX, CELL_SIZE_PX, CELL_SIZE_PX);
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
        const staticActors = new Map<string, Flower>();
        const dynamicActors: CellContent[] = [];

        for (const actor of actors.values()) {
            if (actor.type === 'flower') {
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

    private _collectGarbage(currentFlowers: Map<string, Flower>) {
        const activeImageUrls = new Set<string>();
        for (const flower of currentFlowers.values()) {
            if (flower.imageData) {
                activeImageUrls.add(flower.imageData);
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
    private drawStaticLayer(currentFlowers: Map<string, Flower>, selectedFlowerId: string | null) {
        // 1. Clear canvas and redraw grid lines
        this.drawGrid();

        // 2. Draw all current flowers
        for (const flower of currentFlowers.values()) {
            this.drawFlower(flower);
        }

        // 3. Draw selection highlight on top
        if (selectedFlowerId) {
            const selectedFlower = currentFlowers.get(selectedFlowerId);
            if (selectedFlower) {
                this.bgCtx.fillStyle = SELECTED_CELL_COLOR;
                this.bgCtx.fillRect(selectedFlower.x * CELL_SIZE_PX, selectedFlower.y * CELL_SIZE_PX, CELL_SIZE_PX, CELL_SIZE_PX);
            }
        }
        
        // 4. Clean up the image cache
        this._collectGarbage(currentFlowers);
    }

    private drawDynamicLayer(dynamicActors: CellContent[]) {
        this.fgCtx.clearRect(0, 0, this.fgCanvas.width, this.fgCanvas.height);
        for (const actor of dynamicActors) {
            this.drawEmoji(this.fgCtx, actor);
        }
    }
}
