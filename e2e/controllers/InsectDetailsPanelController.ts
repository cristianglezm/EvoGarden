import { Page, Locator, expect } from '@playwright/test';

export class InsectDetailsPanelController {
    readonly page: Page;
    readonly panel: Locator;

    constructor(page: Page) {
        this.page = page;
        // This selector is robust because all insect/cockroach panels will contain this
        // specific, unique text within the GenomeVisualizer component.
        this.panel = page.locator('aside').filter({ hasText: 'Flower Preferences (Genome)' });
    }

    async waitForPanel() {
        await expect(this.panel).toBeVisible();
    }

    async getActorId(): Promise<string> {
        const idLocator = this.panel.locator('p.font-mono');
        await expect(idLocator).toBeVisible();
        const id = await idLocator.textContent();
        if (!id) throw new Error('Could not find insect ID in details panel');
        return id;
    }

    async closePanel() {
        await this.panel.getByLabel('Close details panel').click();
        await expect(this.panel).not.toBeVisible();
    }
}
