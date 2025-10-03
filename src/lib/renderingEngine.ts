import type { CellContent, Corpse, Flower, FlowerSeed, Insect, SimulationParams, SlimeTrail } from '../types';

const CELL_SIZE_PX = 64;
const GRID_COLOR = 'hsla(120, 100%, 50%, 0.2)';
const SELECTED_CELL_BORDER_COLOR = 'hsl(120, 100%, 50%)'; // Opaque bright green
const SELECTED_CELL_BORDER_WIDTH = 4; // in pixels

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
    private corpseImageCache = new Map<string, HTMLCanvasElement>();
    
    // State for change detection
    private lastStaticActorIds = new Set<string>();
    
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

    private drawCorpse(ctx: CanvasRenderingContext2D, actor: Corpse) {
        const cachedCanvas = this.corpseImageCache.get(actor.originalEmoji);
        if (cachedCanvas) {
            ctx.drawImage(cachedCanvas, actor.x * CELL_SIZE_PX, actor.y * CELL_SIZE_PX);
            return;
        }

        // Create an offscreen canvas for rendering the composite emoji
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = CELL_SIZE_PX;
        offscreenCanvas.height = CELL_SIZE_PX;
        const offscreenCtx = offscreenCanvas.getContext('2d')!;

        const centerX = CELL_SIZE_PX / 2;
        const centerY = CELL_SIZE_PX / 2;

        offscreenCtx.save();
        offscreenCtx.textAlign = 'center';
        offscreenCtx.textBaseline = 'middle';

        // Draw original emoji (faded)
        offscreenCtx.globalAlpha = 0.6;
        offscreenCtx.font = `${CELL_SIZE_PX * 0.6}px sans-serif`;
        offscreenCtx.fillText(actor.originalEmoji, centerX, centerY);
        
        // Draw skull on top
        offscreenCtx.globalAlpha = 1.0;
        offscreenCtx.font = `${CELL_SIZE_PX * 0.4}px sans-serif`;
        offscreenCtx.fillText('💀', centerX, centerY);
        
        offscreenCtx.restore();

        // Cache the result and draw it to the main canvas
        this.corpseImageCache.set(actor.originalEmoji, offscreenCanvas);
        ctx.drawImage(offscreenCanvas, actor.x * CELL_SIZE_PX, actor.y * CELL_SIZE_PX);
    }

    private drawSlimeTrail(ctx: CanvasRenderingContext2D, actor: SlimeTrail) {
        ctx.save();
        ctx.globalAlpha = 0.2; // Faint
        ctx.fillStyle = '#c0c0c0'; // Silvery-white
        ctx.beginPath();
        const centerX = actor.x * CELL_SIZE_PX + CELL_SIZE_PX / 2;
        const centerY = actor.y * CELL_SIZE_PX + CELL_SIZE_PX / 2;
        ctx.arc(centerX, centerY, CELL_SIZE_PX * 0.4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
    }

    private drawEmoji(ctx: CanvasRenderingContext2D, actor: CellContent) {
        const emoji =
            actor.type === 'bird' ? '🐦' :
            actor.type === 'eagle' ? '🦅' :
            actor.type === 'insect' ? (actor as Insect).emoji :
            actor.type === 'nutrient' ? '💩' :
            actor.type === 'egg' ? '🥚' :
            actor.type === 'herbicidePlane' ? '✈️' :
            actor.type === 'herbicideSmoke' ? '💨' :
            actor.type === 'cockroach' ? '🪳' :
            actor.type === 'cocoon' ? '⚪️' : 
            actor.type === 'hive' ? '🛖' : '';
        
        if (emoji) {
            ctx.save();
            ctx.globalAlpha = 0.9;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (emoji === '🥚' || emoji === '⚪️') {
                ctx.font = `${CELL_SIZE_PX * 0.4}px sans-serif`;
                ctx.fillText(emoji, actor.x * CELL_SIZE_PX + CELL_SIZE_PX * 0.3, actor.y * CELL_SIZE_PX + CELL_SIZE_PX * 0.3);
            } else {
                 ctx.font = `${CELL_SIZE_PX * 0.6}px sans-serif`;
                 ctx.fillText(emoji, actor.x * CELL_SIZE_PX + CELL_SIZE_PX / 2, actor.y * CELL_SIZE_PX + CELL_SIZE_PX / 2);
            }
            
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


    public draw(actors: Map<string, CellContent>, selectedActorId: string | null) {
        const staticActors = new Map<string, Flower | FlowerSeed>();
        const dynamicActors: CellContent[] = [];

        for (const actor of actors.values()) {
            if (actor.type === 'flower' || actor.type === 'flowerSeed') {
                staticActors.set(actor.id, actor);
            } else if (actor.type !== 'territoryMark') { // Do not draw territory marks
                dynamicActors.push(actor);
            }
        }

        const currentStaticActorIds = new Set(staticActors.keys());
        const staticActorsChanged = haveSetsChanged(this.lastStaticActorIds, currentStaticActorIds);

        if (staticActorsChanged) {
            this.drawStaticLayer(staticActors);
            this.lastStaticActorIds = currentStaticActorIds;
        }

        this.drawDynamicLayer(dynamicActors, selectedActorId, actors);
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
    
    private drawStaticLayer(currentStaticActors: Map<string, Flower | FlowerSeed>) {
        this.drawGrid();

        for (const actor of currentStaticActors.values()) {
            this.drawImage(actor);
        }
        
        this._collectGarbage(currentStaticActors);
    }

    private drawDynamicLayer(dynamicActors: CellContent[], selectedActorId: string | null, allActors: Map<string, CellContent>) {
        this.fgCtx.clearRect(0, 0, this.fgCanvas.width, this.fgCanvas.height);

        // Draw selection highlight first, so it's underneath the actors
        if (selectedActorId) {
            const selectedActor = allActors.get(selectedActorId);
            if (selectedActor) {
                this.fgCtx.strokeStyle = SELECTED_CELL_BORDER_COLOR;
                this.fgCtx.lineWidth = SELECTED_CELL_BORDER_WIDTH;
                const offset = SELECTED_CELL_BORDER_WIDTH / 2;
                this.fgCtx.strokeRect(
                    selectedActor.x * CELL_SIZE_PX + offset, 
                    selectedActor.y * CELL_SIZE_PX + offset, 
                    CELL_SIZE_PX - SELECTED_CELL_BORDER_WIDTH, 
                    CELL_SIZE_PX - SELECTED_CELL_BORDER_WIDTH
                );
            }
        }
        
        for (const actor of dynamicActors) {
            if (actor.type === 'corpse') {
                this.drawCorpse(this.fgCtx, actor as Corpse);
            } else if (actor.type === 'slimeTrail') {
                this.drawSlimeTrail(this.fgCtx, actor as SlimeTrail);
            } else {
                this.drawEmoji(this.fgCtx, actor);
            }
        }
    }
}
