import { Page, Locator, expect } from '@playwright/test';
import { DataPanelController } from './DataPanelController';

export class FieldGuideController {
  readonly page: Page;
  readonly dialog: Locator;

  constructor(page: Page) {
    this.page = page;
    // the guide is a modal in the body: it is not inside any panel
    this.dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Field Guide' }) });
  }

  /** From the Seed Bank tab of the Data panel, the way a player finds it. */
  async openFromSeedBank() {
    const data = new DataPanelController(this.page);
    await data.open();
    await data.goToSeedBankTab();
    await data.panel.getByRole('button', { name: /Field Guide/ }).click();
    await expect(this.dialog).toBeVisible();
  }

  async close() {
    await this.dialog.getByLabel('Close modal').click();
    await expect(this.dialog).not.toBeVisible();
  }

  getMap() {
    return this.dialog.getByRole('group', { name: /Species map: \d+ of \d+ species discovered/ });
  }

  getSpeciesButtons() {
    return this.getMap().getByRole('button');
  }

  getSelectedSpecies() {
    return this.getMap().getByRole('button', { pressed: true });
  }

  getCollectButton() {
    return this.dialog.getByRole('button', { name: /Collect samples|Collecting/ });
  }
}
