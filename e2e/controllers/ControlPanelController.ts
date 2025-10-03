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

  getLabel(label: string) { return this.page.getByLabel(new RegExp(`^${label}`, 'i')); }
  
  // World Parameters
  getBirdsInput() { return this.getLabel('Birds'); }
  getFlowersInput() { return this.getLabel('Flowers'); }
  getInsectsInput() { return this.getLabel('Insects'); }
  getGridWidthInput() { return this.getLabel('Grid Width'); }
  getGridHeightInput() { return this.getLabel('Grid Height'); }
  getSeasonLengthInput() { return this.getLabel('Season Length'); }
  getTemperatureInput() { return this.getLabel('Base Temperature'); }
  getTemperatureVariationInput() { return this.getLabel('Temp. Variation'); }
  getHumidityInput() { return this.getLabel('Base Humidity'); }
  getHumidityVariationInput() { return this.getLabel('Humidity Variation'); }
  getWindDirectionInput() { return this.getLabel('Wind Direction'); }
  getWindStrengthInput() { return this.getLabel('Wind Strength'); }
  
  // Collapsible section helpers
  async openCollapsibleSection(title: string) {
    const btn = this.panel.getByRole('button', { name: new RegExp(title, 'i') });
    await expect(btn).toBeVisible();
    const expanded = await btn.getAttribute('aria-expanded');
    if (expanded !== 'true') {
      await btn.click();
      await expect(btn).toHaveAttribute('aria-expanded', 'true');
    }
  }

  async openHiveColonyRulesSection() { await this.openCollapsibleSection("Hive & Colony Rules"); }
  async openEcosystemRulesSection() { await this.openCollapsibleSection("Ecosystem Rules"); }
  async openEvolutionReproductionSection() { await this.openCollapsibleSection("Evolution & Reproduction"); }
  async openWeatherEventsSection() { await this.openCollapsibleSection("Weather Events"); }
  async openGraphicsUISection() { await this.openCollapsibleSection("Graphics & UI"); }

  // Hive & Colony Rules
  getHiveGridAreaInput() { return this.getLabel('Hive Grid Area'); }
  getBeeDormancyTempInput() { return this.getLabel('Bee Dormancy Temp'); }
  getWinterHoneyUseInput() { return this.getLabel('Winter Honey Use'); }
  getPollenToHoneyInput() { return this.getLabel('Pollen to Honey'); }
  getHiveSpawnThresholdInput() { return this.getLabel('Hive Spawn Threshold'); }
  getHiveSpawnCostInput() { return this.getLabel('Hive Spawn Cost'); }
  getTerritoryMarkLifespanInput() { return this.getLabel('Territory Mark Lifespan'); }
  getSignalTTLInput() { return this.getLabel('Signal TTL'); }
  getBeePollinationWanderChanceInput() { return this.getLabel('Pollination Wander'); }

  // Ecosystem Rules
  getHerbicideDamageInput() { return this.getLabel('Herbicide Damage'); }
  getHerbicideCooldownInput() { return this.getLabel('Herbicide Cooldown'); }
  getHerbicideThresholdInput() { return this.getLabel('Herbicide Threshold'); }
  
  // Evolution & Reproduction
  getReproductionCooldownInput() { return this.getLabel('Reproduction Cooldown'); }
  getMutationChanceInput() { return this.getLabel('Mutation Chance'); }
  getMutationAmountInput() { return this.getLabel('Mutation Amount'); }

  // Weather Events
  getWeatherEventChanceInput() { return this.getLabel('Event Chance'); }
  getWeatherMinDurationInput() { return this.getLabel('Min Event Duration'); }
  getWeatherMaxDurationInput() { return this.getLabel('Max Event Duration'); }

  // Graphics & UI
  getNotificationModeSelect() { return this.getLabel('Notification Mode'); }
  async setNotificationMode(mode: 'log' | 'toasts' | 'both') {
    await this.getNotificationModeSelect().selectOption({ value: mode });
  }

  async setWindDirection(direction: string) {
    const valid = ['N','NE','E','SE','S','SW','W','NW'];
    if (!valid.includes(direction)) {
      throw new Error(`Invalid wind direction: ${direction}`);
    }
    await this.getWindDirectionInput().selectOption(direction);
  }

  getFlowerDetailSelect() {
    return this.getLabel('Flower Detail');
  }

  async setFlowerDetail(multiplier: string) {
    const valid = ['x4','x8','x16','x32','x64'];
    if (!valid.includes(multiplier)) {
      throw new Error(`Invalid Flower Detail value: ${multiplier}`);
    }
    await this.openGraphicsUISection();
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
