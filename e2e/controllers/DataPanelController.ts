import { Page, Locator, expect } from '@playwright/test';

export class DataPanelController {
  readonly page: Page;
  readonly panel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.panel = page.locator('aside:has-text("Challenges & Analytics")');
  }

  async open() {
    await this.page.getByRole('button', { name: 'Open data panel' }).click();
    await expect(this.panel).toBeVisible();
  }

  async close() {
    await this.page.getByRole('button', { name: 'Close data panel' }).click();
    await expect(this.panel).not.toBeInViewport();
  }

  getChallengesTab() {
    return this.panel.getByRole('tab', { name: 'Challenges' });
  }

  getAnalyticsTab() {
    return this.panel.getByRole('tab', { name: 'Analytics' });
  }

  async goToChallengesTab() {
    await this.getChallengesTab().click();
    // Check for a known challenge title to confirm the tab is loaded.
    await expect(this.page.getByText('Budding Survivor')).toBeVisible();
  }
  
  async goToAnalyticsTab() {
    await this.getAnalyticsTab().click();
    // Charts are rendered inside a canvas, so we can't get text.
    // Instead, we verify that the canvas element for the charts is visible.
    await expect(this.panel.locator('canvas').first()).toBeVisible();
  }
}
