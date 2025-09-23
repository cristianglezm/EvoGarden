import { test, expect } from '@playwright/test';
import { ControlPanelController } from './controllers/ControlPanelController';
import { FlowerPanelController } from './controllers/FlowerPanelController';
import { DataPanelController } from './controllers/DataPanelController';
import { EventLogPanelController } from './controllers/EventLogPanelController';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Initializing EvoGarden...')).not.toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('grid', { name: 'EvoGarden simulation grid' })).toBeVisible();
});

test.describe('Basic UI', () => {
  test('should have the correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/EvoGarden/);
  });

  test('should open and close the controls panel', async ({ page }) => {
    const controls = new ControlPanelController(page);
    await controls.open();
    await expect(controls.getApplyAndReset()).toBeVisible();
    await controls.close();
  });
});

test.describe('Data Panel', () => {
    test('should open and close the data panel', async ({ page }) => {
        const dataPanel = new DataPanelController(page);
        await dataPanel.open();
        await expect(dataPanel.getChallengesTab()).toBeVisible();
        await dataPanel.close();
    });

    test('should switch between Challenges, Analytics, and Seed Bank tabs', async ({ page }) => {
        const dataPanel = new DataPanelController(page);
        await dataPanel.open();
        await dataPanel.goToAnalyticsTab();
        await dataPanel.goToSeedBankTab();
        await dataPanel.goToChallengesTab();
    });
});

test.describe('Simulation Controls', () => {
  test('should start and pause the simulation', async ({ page }) => {
    const controls = new ControlPanelController(page);
    await controls.runSimulation(2);
    await expect(controls.getStart()).toBeVisible();
  });

  test('should change a parameter and apply it', async ({ page }) => {
    const controls = new ControlPanelController(page);
    await controls.open();
    await controls.getBirdsInput().fill('10');
    await expect(controls.getBirdsInput()).toHaveValue('10');
    await controls.getApplyAndReset().click();
    await expect(controls.panel).not.toBeInViewport();
  });

  test('should reject invalid wind direction', async ({ page }) => {
    const controls = new ControlPanelController(page);
    await controls.open();
    await expect(async () => {
      await controls.setWindDirection('INVALID');
    }).rejects.toThrow(/Invalid wind direction/);
  });
});

test.describe('Save and Load State', () => {
  test('should save and load state, showing event log messages', async ({ page }) => {
    const controls = new ControlPanelController(page);
    const flowers = new FlowerPanelController(page);
    const eventLog = new EventLogPanelController(page);
    const canvas = page.getByRole('grid', { name: 'EvoGarden simulation grid' });

    await flowers.waitCanvasStable(canvas);
    await controls.open();
    await controls.getSave().click();
    await expect(eventLog.getHeaderLog().getByText('Garden state saved!')).toBeVisible({ timeout: 10000 });

    await controls.getBirdsInput().fill('4');
    await controls.getApplyAndReset().click();
    await flowers.waitCanvasStable(canvas);
    await controls.open();
    await controls.getLoad().click();
    await expect(eventLog.getHeaderLog().getByText('Loaded last saved garden!')).toBeVisible({ timeout: 10000 });

    await flowers.waitCanvasStable(canvas);
  });
});

test.describe('Event Log Panel', () => {
    test('should open, display events, and close the full event log', async ({ page }) => {
        const controls = new ControlPanelController(page);
        const eventLog = new EventLogPanelController(page);

        // Set a dense initial population to guarantee events
        await controls.open();
        await controls.setMaxCapacities();

        // Run sim for a few seconds to generate plenty of events
        await controls.runSimulation(10);
        
        await eventLog.open();
        
        // Verify the panel is visible and contains event text.
        // We check for "Tick" as a reliable indicator that log entries are rendered.
        await expect(eventLog.getFullPanel()).toBeVisible();
        const tickCount = await eventLog.getFullPanel().getByText(/Tick/).count();
        expect(tickCount).toBeGreaterThan(1);
        
        await eventLog.close();
        await expect(eventLog.getFullPanel()).not.toBeInViewport();
    });
});

test.describe('Canvas and Flower Details Panel', () => {
  test.beforeEach(async ({ page }) => {
    const controls = new ControlPanelController(page);
    await controls.open();
    await controls.getFlowersInput().fill('25');
    await controls.getBirdsInput().fill('5');
    await controls.getInsectsInput().fill('10');
    await controls.getApplyAndReset().click();
    await controls.runSimulation(3);
  });

  test('should select a flower and show the details panel', async ({ page }) => {
    const flowers = new FlowerPanelController(page);
    expect(await flowers.selectFlower()).toBe(true);
    await flowers.waitForDetails();
    await flowers.waitForFlowerData();
    await expect(flowers.getGenomeTextarea()).toBeVisible();
  });

  test('should copy and show download for a selected flower genome', async ({ page, context }) => {
    const flowers = new FlowerPanelController(page);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    expect(await flowers.selectFlower()).toBe(true);
    await flowers.waitForDetails();
    const genomeValue = await flowers.getGenomeTextarea().inputValue();
    await flowers.copyGenome();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(genomeValue);
    await expect(flowers.getDownloadGenomeButton()).toBeEnabled();
  });

  test('should open the 3D viewer from the details panel', async ({ page }) => {
    const flowers = new FlowerPanelController(page);
    expect(await flowers.selectFlower()).toBe(true);
    await flowers.waitForDetails();
    await flowers.view3DFlower();
  });

  test('should close the flower panel after viewing', async ({ page }) => {
    const flowers = new FlowerPanelController(page);
    expect(await flowers.selectFlower()).toBe(true);
    await flowers.waitForDetails();
    await flowers.closeDetails();
  });

  test('should resume simulation when deselecting a flower', async ({ page }) => {
    const controls = new ControlPanelController(page);
    const flowers = new FlowerPanelController(page);
    const canvas = page.getByRole('grid', { name: 'EvoGarden simulation grid' });

    // The beforeEach has paused the simulation. Start it.
    await controls.open();
    await controls.getStart().click();
    await page.waitForTimeout(500); // Let it run

    // Select a flower, which should pause it
    expect(await flowers.selectFlower()).toBe(true);
    await flowers.waitForDetails();

    // Verify it is paused by waiting for the canvas to become static.
    // The waitCanvasStable helper is more robust than a manual check because it retries.
    await flowers.waitCanvasStable(canvas);
    const pausedCanvasScreenshot = await canvas.screenshot();
    
    // Deselect the flower by clicking an empty area
    await flowers.closeDetails();

    // Wait for the simulation to resume
    await page.waitForTimeout(500); 

    // Verify the canvas has changed
    const resumedCanvasScreenshot = await canvas.screenshot();
    expect(pausedCanvasScreenshot.equals(resumedCanvasScreenshot)).toBe(false);
  });
});

test.describe('Full Environment Parameter Test', () => {
  test('should set Flower Detail multiplier', async ({ page }) => {
    const controls = new ControlPanelController(page);
    await controls.open();
    await controls.setFlowerDetail('x32');
    await controls.getApplyAndReset().click();
  });

  test('should set all parameters and apply', async ({ page }) => {
    const controls = new ControlPanelController(page);
    await controls.open();
    await controls.getGridWidthInput().fill('15');
    await controls.getGridHeightInput().fill('15');
    await controls.getTemperatureInput().fill('20');
    await controls.getHumidityInput().fill('0.5');
    await controls.setWindDirection('NE');
    await controls.getWindStrengthInput().fill('5');
    await controls.getFlowersInput().fill('10');
    await controls.getInsectsInput().fill('5');
    await controls.getBirdsInput().fill('3');
    await controls.getApplyAndReset().click();
  });
});
