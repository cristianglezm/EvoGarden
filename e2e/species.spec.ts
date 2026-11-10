import { test, expect, Page } from '@playwright/test';
import { ControlPanelController } from './controllers/ControlPanelController';
import { FlowerPanelController } from './controllers/FlowerPanelController';
import { DataPanelController } from './controllers/DataPanelController';
import { FieldGuideController } from './controllers/FieldGuideController';
import { WorkersController } from './controllers/WorkersController';

// The same start as the other specs: wait for the app, then for a canvas that is not changing.
async function waitForApp(page: Page) {
  await expect(page.getByText('Initializing EvoGarden...')).not.toBeVisible({ timeout: 20000 });
  await expect(page.locator('header').getByText('Event Log:')).toBeVisible({ timeout: 15000 });
  const canvas = page.getByRole('grid', { name: 'EvoGarden simulation grid' });
  await expect(canvas).toBeVisible();
  await new FlowerPanelController(page).waitCanvasStable(canvas);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
});

test.describe('Species field guide', () => {
  test('should open from the main menu, show the whole map of species, and close', async ({ page }) => {
    const guide = new FieldGuideController(page);
    await guide.open();
    await expect(guide.getMap()).toBeVisible();
    // a species is one button of the map: the map of the embedded classifier has 12 x 8 of them
    await expect(guide.getSpeciesButtons()).toHaveCount(96);
    await guide.close();
  });

  test('should select a species of the map, and let go of it by selecting it again', async ({ page }) => {
    const guide = new FieldGuideController(page);
    await guide.open();
    const first = guide.getSpeciesButtons().first();
    await first.click();
    await expect(guide.getSelectedSpecies()).toHaveCount(1);
    await first.click();
    await expect(guide.getSelectedSpecies()).toHaveCount(0);
  });

  test('should not offer to collect samples while the collection is empty', async ({ page }) => {
    const guide = new FieldGuideController(page);
    await guide.open();
    await expect(guide.getCollectButton()).toBeDisabled();
  });
});

test.describe('Species of a flower', () => {
  test.slow();

  test.beforeEach(async ({ page }) => {
    const controls = new ControlPanelController(page);
    await controls.open();
    await controls.getFlowersInput().fill('25');
    await controls.getBirdsInput().fill('5');
    await controls.getInsectsInput().fill('10');
    await controls.getApplyAndReset().click();
    await expect(page.getByText('Resetting simulation...')).not.toBeVisible({ timeout: 15000 });
    await controls.runSimulation(3);
  });

  test('should say the species of the selected flower', async ({ page }) => {
    const flowers = new FlowerPanelController(page);
    expect(await flowers.selectFlower()).toBe(true);
    await flowers.waitForPanel();
    // it is classified on the page, once, when the flower is selected: a mark while it is asked for, then a name
    await expect(flowers.panel.getByText(/^Species: .+/)).toBeVisible({ timeout: 20000 });
    await expect(flowers.panel.getByText('Species: …')).not.toBeVisible({ timeout: 20000 });
  });

  test('should open the field guide at the species of the flower, and keep the flower selected', async ({ page }) => {
    const flowers = new FlowerPanelController(page);
    const guide = new FieldGuideController(page);
    expect(await flowers.selectFlower()).toBe(true);
    await flowers.waitForPanel();
    await expect(flowers.panel.getByText('Species: …')).not.toBeVisible({ timeout: 20000 });
    await flowers.panel.getByRole('button', { name: 'View in field guide' }).click();
    await expect(guide.dialog).toBeVisible();
    await expect(guide.getSelectedSpecies()).toHaveCount(1);
    // a click inside the guide is not a click outside the details of the flower (the guide is drawn in the body)
    await guide.dialog.getByRole('heading', { name: 'Field Guide' }).click();
    await expect(guide.dialog).toBeVisible();
    await expect(flowers.panel).toBeVisible();
    await guide.close();
    await expect(flowers.panel).toBeVisible();
  });

  test('should keep the 3D view of the flower open when it is clicked, and the details of the flower with it', async ({ page }) => {
    const flowers = new FlowerPanelController(page);
    expect(await flowers.selectFlower()).toBe(true);
    await flowers.waitForPanel();
    await page.getByRole('button', { name: 'View in 3D' }).click();
    const viewer = page.getByRole('dialog');
    const model = viewer.locator('canvas');
    await expect(model).toBeVisible({ timeout: 20000 });
    // the viewer is drawn in the body: a click on the model is not a click outside the details of the flower
    // (not on the backdrop around it, which is what closes a modal)
    await model.click();
    await expect(model).toBeVisible();
    await expect(flowers.panel).toBeVisible();
    await page.getByLabel('Close modal').click();
    await expect(viewer).not.toBeVisible();
    await expect(flowers.panel).toBeVisible();
  });
});

test.describe('Workers', () => {
  test('should show the setup of the workers before they have reported, and close with Escape', async ({ page }) => {
    const workers = new WorkersController(page);
    await workers.openDetails();
    // the plan is known before the first tick; the numbers come with it
    await expect(workers.getDetails().getByText(/^Setup: /)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(workers.getDetails()).not.toBeVisible();
  });

  test('should show what the workers are doing, and a way to copy it, once they have reported', async ({ page }) => {
    test.slow();
    const controls = new ControlPanelController(page);
    const workers = new WorkersController(page);
    // the workers report with a tick of the simulation
    await controls.runSimulation(3);
    await workers.openDetails();
    await expect(workers.getDetails().getByRole('table')).toBeVisible({ timeout: 15000 });
    await expect(workers.getDetails().getByRole('button', { name: 'Copy' })).toBeVisible();
  });

  test('should keep the number of workers the player chose, for the next time the page is loaded', async ({ page }) => {
    const controls = new ControlPanelController(page);
    const workers = new WorkersController(page);
    const select = await workers.openSetting(controls);
    await expect(select).toHaveValue('auto');
    await select.selectOption('2');
    await expect(controls.panel.getByRole('status', { name: 'Workers result' })).toHaveText('2 workers will be used when the page is loaded again.');

    await page.reload();
    await waitForApp(page);
    await expect(await workers.openSetting(controls)).toHaveValue('2');
    // and the bar says who decided
    await controls.close();
    await workers.openDetails();
    await expect(workers.getDetails().getByText(/^Setup: .*\(setting\)/)).toBeVisible();
  });
});

test.describe('Species challenges', () => {
  test('should list the challenges about the species collection', async ({ page }) => {
    const data = new DataPanelController(page);
    await data.open();
    await data.goToChallengesTab();
    for (const title of ['Field Naturalist', 'Taxonomist', 'Keeper of the Garden', 'Strange Bloom']) {
      await expect(data.panel.getByText(title)).toBeVisible();
    }
  });
});
