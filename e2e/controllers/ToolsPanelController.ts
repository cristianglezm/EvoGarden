import { Page, Locator, expect } from '@playwright/test';

export class ToolsPanelController {
    readonly page: Page;
    readonly panel: Locator;

    constructor(page: Page) {
        this.page = page;
        this.panel = page.locator('aside:has-text("Intervention Tools")');
    }

    async open() {
        await this.page.getByRole('button', { name: 'Open Intervention Tools' }).click();
        await expect(this.panel).toBeVisible();
    }

    async close() {
        await this.panel.getByRole('button', { name: 'Close tools panel' }).click();
        await expect(this.panel).not.toBeInViewport();
    }

    getWeatherButton(type: 'Heatwave' | 'Coldsnap' | 'Heavy Rain' | 'Drought') {
        return this.panel.getByRole('button', { name: type });
    }

    getActorSelect() {
        return this.panel.getByLabel('Actor');
    }

    getActorCountInput() {
        return this.panel.getByLabel('Count');
    }
    
    getIntroduceActorsButton() {
        // The collapsible header also has the text "Introduce Actors".
        // This targets the actual button inside the collapsible content, which is not an expandable header.
        return this.panel.locator('button:not([aria-expanded])').filter({ hasText: 'Introduce Actors' });
    }

    getChampionButton(category: 'longestLived' | 'mostToxic' | 'mostHealing') {
        const titleMap = {
            longestLived: 'Plant longestLived',
            mostToxic: 'Plant mostToxic',
            mostHealing: 'Plant mostHealing',
        }
        return this.panel.getByTitle(titleMap[category]);
    }

    getPlantingModeBanner() {
        return this.page.getByText('Planting Mode: Click an empty cell to plant your champion.');
    }
}
