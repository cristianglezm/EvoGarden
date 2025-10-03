import { Page, Locator, expect } from '@playwright/test';
import type { CellContent } from '../../src/types';

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

  async selectActor(actorType: CellContent['type']): Promise<boolean> {
    const canvas = this.page.getByRole('grid', { name: 'EvoGarden simulation grid' });
    const box = await canvas.boundingBox();
    if (!box) return false;
    
    const DENSITY = 8; // higher density click grid
    for (let i = 1; i <= DENSITY; i++) {
        for (let j = 1; j <= DENSITY; j++) {
            const x = box.width * (i / (DENSITY + 1));
            const y = box.height * (j / (DENSITY + 1));
            await canvas.click({ position: { x, y } });

            let targetPanel: Locator;
            let nameRegex: RegExp;
            
            // Determine which panel and name to look for
            if (actorType === 'insect' || actorType === 'cockroach') {
                targetPanel = this.page.locator('aside').filter({ hasText: 'Flower Preferences (Genome)' });
                const insectEmojisRegex = /[🦋🐛🐌🐞🪲🦂🐝🐜🪳]/;
                nameRegex = insectEmojisRegex;
            } else if (actorType === 'antColony') {
                targetPanel = this.page.locator('aside:has-text("Ant Colony Details")');
                nameRegex = /🐜 Ant Colony/;
            } else {
                const capitalizedActorType = actorType.charAt(0).toUpperCase() + actorType.slice(1);
                targetPanel = this.page.locator(`aside:has-text("${capitalizedActorType} Details")`);
                nameRegex = new RegExp(capitalizedActorType, 'i');
            }
            
            const targetVisible = await targetPanel.isVisible({ timeout: 250 });
            if (targetVisible) return true;
            
            const selectionVisible = await this.actorSelectionPanel.isVisible({ timeout: 250 });
            if (selectionVisible) {
                const actorButtons = this.actorSelectionPanel.getByRole('button', { name: nameRegex });

                if (await actorButtons.count() > 0) {
                    await actorButtons.first().click();
                    await expect(targetPanel).toBeVisible();
                    return true;
                }
            }
        }
    }
    return false;
}

  async selectFlower(): Promise<boolean> {
    return this.selectActor('flower');
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