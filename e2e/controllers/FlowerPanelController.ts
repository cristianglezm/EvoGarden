import { Page, Locator, expect } from '@playwright/test';
import type { CellContent } from '../../src/types';

export class FlowerPanelController {
  readonly page: Page;
  readonly panel: Locator;
  readonly actorSelectionPanel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.panel = page.locator('aside:has-text("Flower Details")');
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

            let panelText: string | RegExp;
            let buttonNameRegex: RegExp;

            // This logic correctly maps an actor type to its panel title text
            // and its button name in the multi-actor selection panel.
            switch (actorType) {
                case 'insect':
                case 'cockroach':
                    // Use a stable internal element text as an identifier for all insect panels
                    panelText = /Flower Preferences \(Genome\)/;
                    buttonNameRegex = /[🦋🐛🐌🐞🪲🦂🐝🐜🪳]/;
                    break;
                case 'flower':
                    panelText = "Flower Details";
                    buttonNameRegex = /🌸 Flower/;
                    break;
                case 'hive':
                    panelText = "Honeybee Hive";
                    buttonNameRegex = /🛖 Hive/;
                    break;
                case 'antColony':
                    panelText = "Ant Colony Details";
                    buttonNameRegex = /⛰️ Ant Colony/;
                    break;
                default:
                    // Fallback for other simple actor types
                    const capitalized = actorType.charAt(0).toUpperCase() + actorType.slice(1);
                    panelText = new RegExp(`${capitalized} Details`);
                    buttonNameRegex = new RegExp(capitalized, 'i');
            }
            const targetPanel = this.page.locator('aside').filter({ hasText: panelText });
            
            // Perform the click that might open a panel
            await canvas.click({ position: { x, y } });
            
            try {
                // Wait for either the final details panel OR the selection panel to show up.
                // This is more robust than two separate, short-timed checks.
                await expect(targetPanel.or(this.actorSelectionPanel)).toBeVisible({ timeout: 1000 });

                // Now check which one it was.
                if (await targetPanel.isVisible()) {
                    // It was a direct hit, we're done.
                    return true;
                }

                if (await this.actorSelectionPanel.isVisible()) {
                    // The selection panel appeared. Find our button and click it.
                    const actorButtons = this.actorSelectionPanel.getByRole('button', { name: buttonNameRegex });
                    if (await actorButtons.count() > 0) {
                        await actorButtons.first().click();
                        // Wait for the panels to transition
                        await expect(this.actorSelectionPanel).not.toBeVisible();
                        await expect(targetPanel).toBeVisible();
                        return true;
                    } else {
                        // Selection panel is open, but doesn't have our actor. Close it and try another spot.
                        await this.actorSelectionPanel.getByLabel('Close selection panel').click();
                        await expect(this.actorSelectionPanel).not.toBeVisible();
                    }
                }
            } catch (e) {
                // Timeout means no panel appeared for this click (e.g., empty cell). The loop will continue.
            }
        }
    }
    return false;
  }

  async selectFlower(): Promise<boolean> {
    return this.selectActor('flower');
  }


  async waitForPanel() {
    await expect(this.panel).toBeVisible();
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

  async getActorId(): Promise<string> {
    const idLocator = this.panel.locator('p.font-mono');
    await expect(idLocator).toBeVisible();
    const id = await idLocator.textContent();
    if (!id) throw new Error('Could not find flower ID in details panel');
    return id;
  }

  async copyGenome() {
    await this.page.getByTitle('Copy genome to clipboard').click();
    await expect(this.panel.getByTestId('CheckIcon')).toBeVisible();
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
  async closePanel() {
    const closeButton = this.panel.getByRole('button', { name: 'Close details panel' });
    await expect(closeButton).toBeVisible();
    await closeButton.click();
    await expect(this.panel).not.toBeVisible({ timeout: 2000 });
  }
}
