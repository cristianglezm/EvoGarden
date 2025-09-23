import { Page, Locator, expect } from '@playwright/test';

export class ControlPanelController {
  readonly page: Page;
  readonly panel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.panel = page.locator('aside:has-text("Controls")');
  }

  async open() {
    await this.page.getByRole('button', { name: 'Open Controls' }).click();
    await expect(this.panel).toBeVisible();
  }

  async close() {
    await this.page.getByRole('button', { name: 'Close controls panel' }).click();
    await expect(this.panel).not.toBeInViewport();
  }

  getStart() { return this.page.getByRole('button', { name: /Start simulation/i }); }
  getPause() { return this.page.getByRole('button', { name: /Pause simulation/i }); }
  getSave() { return this.page.getByRole('button', { name: /Save/i }); }
  getLoad() { return this.page.getByRole('button', { name: /Load/i }); }
  getApplyAndReset() { return this.page.getByRole('button', { name: /Apply & Reset/i }); }

  getLabel(label: string) { return this.page.getByLabel(new RegExp(label, 'i')); }
  getBirdsInput() { return this.getLabel('Birds'); }
  getFlowersInput() { return this.getLabel('Flowers'); }
  getInsectsInput() { return this.getLabel('Insects'); }
  getGridWidthInput() { return this.getLabel('Grid Width'); }
  getGridHeightInput() { return this.getLabel('Grid Height'); }
  getSeasonLengthInput() { return this.getLabel('Season Length'); }
  getTemperatureInput() { return this.getLabel('Base Temperature'); }
  getTemperatureVariationInput() { return this.getLabel('Temp, Variation'); }
  getHumidityInput() { return this.getLabel('Base Humidity'); }
  getHumidityVariationInput() { return this.getLabel('Humidity Variation'); }
  getWindDirectionInput() { return this.getLabel('Wind Direction'); }
  getWindStrengthInput() { return this.getLabel('Wind Strength'); }

  async setWindDirection(direction: string) {
    const valid = ['N','NE','E','SE','S','SW','W','NW'];
    if (!valid.includes(direction)) {
      throw new Error(`Invalid wind direction: ${direction}`);
    }
    // Now use selectOption for the <select> element
    await this.getWindDirectionInput().selectOption(direction);
  }

  getRadiusSectionButton() {
    return this.panel.getByRole('button', { name: /Radius/i });
  }

  async openRadiusSection() {
    const btn = this.getRadiusSectionButton();
    const expanded = await btn.getAttribute('aria-expanded');
    if (expanded !== 'true') {
      await btn.click();
    }
  }

  getFlowerDetailSelect() {
    return this.page.getByLabel(/Flower Detail/i);
  }

  async setFlowerDetail(multiplier: string) {
    const valid = ['x4','x8','x16','x32','x64'];
    if (!valid.includes(multiplier)) {
      throw new Error(`Invalid Flower Detail value: ${multiplier}`);
    }
    await this.openRadiusSection(); // Ensure the section is open before interacting
    await this.getFlowerDetailSelect().selectOption(multiplier);
  }

  async setMaxCapacities() {
    await this.getFlowersInput().fill('40');
    await this.getBirdsInput().fill('15');
    await this.getInsectsInput().fill('15');
    await this.getApplyAndReset().click();
  }

  async runSimulation(seconds: number) {
    await this.open();
    await this.getStart().click();
    await this.page.waitForTimeout(seconds * 1000);
    await this.open();
    await this.getPause().click();
    await this.close();
  }
}
