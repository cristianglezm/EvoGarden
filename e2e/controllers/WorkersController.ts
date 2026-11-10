import { Page, Locator, expect } from '@playwright/test';
import { ControlPanelController } from './ControlPanelController';

export class WorkersController {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    /** The bar of the header that shows what the workers are doing. */
    getBar(): Locator {
        return this.page.getByRole('button', { name: /Genetics Worker: \d+ pending|No pending flowers/ });
    }

    getDetails(): Locator {
        return this.page.getByRole('region', { name: 'Worker details' });
    }

    async openDetails() {
        await this.getBar().click();
        await expect(this.getDetails()).toBeVisible();
    }

    /** The "Workers" setting in Controls. */
    async openSetting(controls: ControlPanelController): Promise<Locator> {
        await controls.open();
        await controls.openCollapsibleSection('Workers');
        const select = controls.panel.getByRole('combobox', { name: 'Workers' });
        await expect(select).toBeVisible();
        return select;
    }
}
