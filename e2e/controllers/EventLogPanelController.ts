import { Page, Locator, expect } from '@playwright/test';

export class EventLogPanelController {
  readonly page: Page;
  readonly headerLog: Locator;
  readonly fullPanel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.headerLog = page.getByTitle('Open Full Event Log');
    this.fullPanel = page.locator('aside:has-text("Full Event Log")');
  }

  getHeaderLog() {
    return this.headerLog;
  }

  getFullPanel() {
    return this.fullPanel;
  }

  async open() {
    await this.headerLog.click();
    await expect(this.fullPanel).toBeVisible();
  }

  async close() {
    await this.fullPanel.getByRole('button', { name: 'Close full event log panel' }).click();
    await expect(this.fullPanel).not.toBeInViewport();
  }
}
