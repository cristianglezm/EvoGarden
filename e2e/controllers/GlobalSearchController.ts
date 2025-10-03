import { Page, Locator, expect } from '@playwright/test';

export class GlobalSearchController {
    readonly page: Page;
    readonly searchInput: Locator;
    readonly trackButton: Locator;

    constructor(page: Page) {
        this.page = page;
        this.searchInput = page.getByLabel('Find actor by ID');
        this.trackButton = page.getByLabel('Track selected actor');
    }

    async searchFor(partialId: string) {
        await this.searchInput.fill(partialId);
        // Using getByRole('list') is more robust for accessibility
        await expect(this.page.getByRole('list')).toBeVisible();
    }

    async selectSuggestion(fullId: string) {
        const suggestion = this.page.getByRole('button', { name: fullId });
        await expect(suggestion).toBeVisible();
        await suggestion.click();
    }
    
    async clickTrackButton() {
        await expect(this.trackButton).toBeEnabled();
        await this.trackButton.click();
    }
}
