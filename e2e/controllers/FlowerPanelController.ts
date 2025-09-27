import { Page, Locator, expect } from '@playwright/test';

export class FlowerPanelController {
  readonly page: Page;
  readonly detailsPanel: Locator;
  readonly actorSelectionPanel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.detailsPanel = page.locator('aside:has-text("Flower Details")');
    this.actorSelectionPanel = page.locator('aside:has-text("Select an Actor")');
  }

  async waitCanvasStable(canvas: Locator) {
    await expect(async () => {
      const s1 = await canvas.screenshot();
      await this.page.waitForTimeout(300);
      const s2 = await canvas.screenshot();
      expect(s1.equals(s2)).toBe(true);
    }).toPass({ timeout: 15000 });
  }

  async selectFlower(): Promise<boolean> {
    const canvas = this.page.getByRole('grid', { name: 'EvoGarden simulation grid' });
    const box = await canvas.boundingBox();
    if (!box) return false;

    const DENSITY = 8; // higher density click grid
    for (let i = 1; i <= DENSITY; i++) {
        for (let j = 1; j <= DENSITY; j++) {
            const x = box.width * (i / (DENSITY + 1));
            const y = box.height * (j / (DENSITY + 1));
            await canvas.click({ position: { x, y } });

            // After clicking, check if either the details panel or selection panel appeared.
            const detailsVisible = await this.detailsPanel.isVisible({ timeout: 250 });
            if (detailsVisible) return true; // Direct selection, success.
            
            const selectionVisible = await this.actorSelectionPanel.isVisible({ timeout: 250 });
            if (selectionVisible) {
                // Multi-actor selection panel appeared. Try to click a flower in it.
                const flowerButton = this.actorSelectionPanel.getByRole('button', { name: /Flower/ });
                if (await flowerButton.isVisible()) {
                    await flowerButton.click();
                    return true; // Clicked flower in selection, success.
                }
            }
        }
    }
    return false; // Failed to find and select a flower after trying all grid points.
}


  async waitForDetails() {
    await expect(this.detailsPanel).toBeVisible();
  }

  async waitForFlowerData() {
    await expect(this.page.getByText('Health', { exact: true })).toBeVisible();
    await expect(this.page.getByText('Stamina', { exact: true })).toBeVisible();
    await expect(this.page.getByText('Genetic Traits', { exact: true })).toBeVisible();
    await expect(this.page.getByText('Base Effects', { exact: true })).toBeVisible();
  }

  async getFlowerData() {
    const grab = async (label: string) =>
      (await this.page.locator(`text=${label}`).textContent())?.replace(label, '').trim();
    return {
      health: await grab('Health'),
      stamina: await grab('Stamina'),
      status: await grab('Status:'),
      toxicity: await grab('Toxicity:'),
      vitality: await grab('Vitality:'),
    };
  }

  getGenomeTextarea() { return this.page.getByRole('textbox', { name: 'Genome' }); }

  async copyGenome() {
    await this.page.getByTitle('Copy genome to clipboard').click();
    await expect(this.detailsPanel.getByTestId('CheckIcon')).toBeVisible();
  }

  getDownloadGenomeButton() {
    return this.page.getByTitle('Download genome as a JSON file');
  }

  async view3DFlower() {
    const view3DButton = this.page.getByRole('button', { name: 'View in 3D' });
    const modal = this.page.getByRole('dialog');
    await expect(view3DButton).toBeVisible();
    await view3DButton.click();
    await expect(modal.locator('canvas')).toBeVisible({ timeout: 20000 });
    await this.page.getByLabel('Close modal').click();
    await expect(modal).not.toBeVisible();
  }
  async closeDetails() {
    const closeButton = this.detailsPanel.getByRole('button', { name: 'Close details panel' });
    await expect(closeButton).toBeVisible();
    await closeButton.click();
    await expect(this.detailsPanel).not.toBeVisible({ timeout: 2000 });
  }
}
