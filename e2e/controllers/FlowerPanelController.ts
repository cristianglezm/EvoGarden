import { Page, Locator, expect } from '@playwright/test';

export class FlowerPanelController {
  readonly page: Page;
  readonly detailsPanel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.detailsPanel = page.locator('aside:has-text("Flower Details")');
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
        if (await this.detailsPanel.isVisible({ timeout: 500 })) return true;
      }
    }
    return false;
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
    await this.page.getByTitle('Copy genome').click();
    await expect(this.detailsPanel.getByTestId('CheckIcon')).toBeVisible();
  }

  getDownloadGenomeButton() {
    return this.page.getByTitle('Download genome as JSON');
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
    const canvas = this.page.getByRole('grid', { name: 'EvoGarden simulation grid' });
    // Try clicking in a corner (likely empty)
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');
      const x = box.width * 0.05;
      const y = box.height * 0.05;
      await canvas.click({ position: { x, y } });
      await expect(this.detailsPanel).not.toBeVisible({ timeout: 2000 });
  }
}
