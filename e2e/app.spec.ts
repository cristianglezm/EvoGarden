import { test, expect, Page, Locator } from '@playwright/test';
import { ControlPanelController } from './controllers/ControlPanelController';
import { FlowerPanelController } from './controllers/FlowerPanelController';
import { DataPanelController } from './controllers/DataPanelController';
import { EventLogPanelController } from './controllers/EventLogPanelController';
import { GlobalSearchController } from './controllers/GlobalSearchController';
import { InsectDetailsPanelController } from './controllers/InsectDetailsPanelController';
import { ToolsPanelController } from './controllers/ToolsPanelController';

// Helper controller for generic actor panels since we can't create new files.
class GenericActorPanelController {
    readonly page: Page;
    readonly panel: Locator;

    constructor(page: Page, panelText: string | RegExp) {
        this.page = page;
        this.panel = page.locator('aside').filter({ hasText: panelText });
    }

    async waitForPanel() {
        await expect(this.panel).toBeVisible();
    }

    async getActorId(): Promise<string> {
        // Find the mono-spaced ID, which is common across all panels
        const idLocator = this.panel.locator('p.font-mono');
        await expect(idLocator.first()).toBeVisible();
        const id = await idLocator.first().textContent();
        if (!id) throw new Error(`Could not find actor ID in panel`);
        return id.trim();
    }

    async closePanel() {
        await this.panel.getByLabel('Close details panel').click();
        await expect(this.panel).not.toBeVisible();
    }
}


test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Initializing EvoGarden...')).not.toBeVisible({ timeout: 20000 });
  
  // Wait for a stable part of the UI to appear, indicating the app has loaded.
  await expect(page.locator('header').getByText('Event Log:')).toBeVisible({ timeout: 15000 });

  const canvas = page.getByRole('grid', { name: 'EvoGarden simulation grid' });
  await expect(canvas).toBeVisible();
  // Wait for the initial render to be static to prevent race conditions
  const tempController = new FlowerPanelController(page);
  await tempController.waitCanvasStable(canvas);
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
    await controls.open();
    await controls.getStart().click(); // This automatically closes the panel
    await expect(controls.panel).not.toBeInViewport();

    // Re-open to verify state
    await controls.open();
    await expect(controls.getPause()).toBeVisible();

    // Pause it
    await controls.getPause().click();
    await expect(controls.getStart()).toBeVisible();
    
    await controls.close();
  });

  test('should change a parameter and apply it', async ({ page }) => {
    const controls = new ControlPanelController(page);
    await controls.open();
    await controls.getBirdsInput().fill('10');
    await expect(controls.getBirdsInput()).toHaveValue('10');
    await controls.getApplyAndReset().click();
    await expect(controls.panel).not.toBeInViewport();
    // Wait for the loading screen to finish
    await expect(page.getByText('Resetting simulation...')).toBeVisible();
    await expect(page.getByText('Resetting simulation...')).not.toBeVisible({ timeout: 15000 });
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
    await expect(page.getByText('Resetting simulation...')).not.toBeVisible({ timeout: 15000 });

    await flowers.waitCanvasStable(canvas);
    await controls.open();
    await controls.getLoad().click();
    await expect(page.getByText('Loading saved garden...')).toBeVisible();
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
        await expect(page.getByText('Resetting simulation...')).not.toBeVisible({ timeout: 15000 });

        // Run sim for a few seconds to generate plenty of events
        await controls.runSimulation(5);
        
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

  test('should select a flower and show the details panel', async ({ page }) => {
    const flowers = new FlowerPanelController(page);
    expect(await flowers.selectFlower()).toBe(true);
    await flowers.waitForPanel();
    await flowers.waitForFlowerData();
    await expect(flowers.getGenomeTextarea()).toBeVisible();
  });

  test('should copy and show download for a selected flower genome', async ({ page, context }) => {
    const flowers = new FlowerPanelController(page);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    expect(await flowers.selectFlower()).toBe(true);
    await flowers.waitForPanel();
    const genomeValue = await flowers.getGenomeTextarea().inputValue();
    await flowers.copyGenome();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(genomeValue);
    await expect(flowers.getDownloadGenomeButton()).toBeEnabled();
  });

  test('should open the 3D viewer from the details panel', async ({ page }) => {
    const flowers = new FlowerPanelController(page);
    expect(await flowers.selectFlower()).toBe(true);
    await flowers.waitForPanel();
    await flowers.view3DFlower();
  });

  test('should close the flower panel after viewing', async ({ page }) => {
    const flowers = new FlowerPanelController(page);
    expect(await flowers.selectFlower()).toBe(true);
    await flowers.waitForPanel();
    await flowers.closePanel();
  });

  test('should resume simulation when deselecting a flower', async ({ page }) => {
    const controls = new ControlPanelController(page);
    const flowers = new FlowerPanelController(page);
    const canvas = page.getByRole('grid', { name: 'EvoGarden simulation grid' });

    // The beforeEach has paused the simulation. Start it.
    await controls.open();
    await controls.getStart().click();
    await expect(controls.panel).not.toBeInViewport();
    await page.waitForTimeout(500); // Let it run

    // Select a flower, which should pause it
    expect(await flowers.selectFlower()).toBe(true);
    await flowers.waitForPanel();

    // Verify it is paused by waiting for the canvas to become static.
    await flowers.waitCanvasStable(canvas);
    const pausedCanvasScreenshot = await canvas.screenshot();
    
    // Deselect the flower by closing the panel
    await flowers.closePanel();

    // Wait for the simulation to resume
    await page.waitForTimeout(500); 

    // Verify the canvas has changed
    const resumedCanvasScreenshot = await canvas.screenshot();
    expect(pausedCanvasScreenshot.equals(resumedCanvasScreenshot)).toBe(false);
  });
});

test.describe('Global Search', () => {
    test.slow();
    test('should find, highlight, and track an actor by its ID', async ({ page }) => {
        const controls = new ControlPanelController(page);
        const actorSelector = new FlowerPanelController(page);
        const search = new GlobalSearchController(page);

        // Run sim for a few seconds to generate a variety of actors
        await controls.open();
        await controls.getApplyAndReset().click();
        await expect(page.getByText('Resetting simulation...')).not.toBeVisible({ timeout: 15000 });
        await controls.runSimulation(5);

        const actorTypesToTry: ('insect' | 'flower' | 'hive' | 'antColony')[] = [
            'insect', 'flower', 'hive', 'antColony'
        ];
        
        let actorWasFoundAndTested = false;

        for (const actorType of actorTypesToTry) {
            const selected = await actorSelector.selectActor(actorType);
            
            if (selected) {
                let panelController: any;

                // Dynamically select the correct controller for the actor type we found
                switch (actorType) {
                    case 'insect':
                        panelController = new InsectDetailsPanelController(page);
                        break;
                    case 'flower':
                        panelController = new FlowerPanelController(page);
                        break;
                    case 'hive':
                        panelController = new GenericActorPanelController(page, /Honeybee Hive/);
                        break;
                    case 'antColony':
                        panelController = new GenericActorPanelController(page, /Ant Colony Details/);
                        break;
                }

                await panelController.waitForPanel();
                const actorId = await panelController.getActorId();
                const partialId = actorId.substring(0, 10);
                
                await panelController.closePanel();
                await expect(panelController.panel).not.toBeVisible();

                // Test search and highlight
                await search.searchFor(partialId);
                await search.selectSuggestion(actorId);

                await panelController.waitForPanel();
                const highlightedId = await panelController.getActorId();
                expect(highlightedId).toBe(actorId);

                // Test tracking
                await search.clickTrackButton();

                const getShortId = (id: string): string => {
                    const parts = id.split('-');
                    if (parts.length > 2) {
                        const dataParts = parts.slice(1, parts.length - 1);
                        const timestamp = parts[parts.length - 1];
                        if (!isNaN(parseInt(timestamp, 10))) {
                            return `${dataParts.join('-')}-${timestamp.slice(-2)}`;
                        }
                    }
                    return id.slice(-5);
                };
                const trackingInput = page.getByLabel('Currently tracking actor');
                await expect(trackingInput).toBeVisible();
                await expect(trackingInput).toHaveValue(`Tracking: ${getShortId(actorId)}`);
                
                actorWasFoundAndTested = true;
                break; // Exit loop after first successful test
            }
        }

        expect(actorWasFoundAndTested, 'Could not find any actor on the grid to test Global Search.').toBe(true);
    });
});

test.describe('Ant Colony Simulation', () => {
  test.beforeEach(async ({ page }) => {
    // Setup a specific scenario for ant testing
    const controls = new ControlPanelController(page);
    await controls.open();
    await controls.getInsectsInput().fill('20'); // More insects to create corpses
    await controls.getBirdsInput().fill('5'); // Birds to create corpses
    await controls.getApplyAndReset().click();
    await expect(page.getByText('Resetting simulation...')).not.toBeVisible({ timeout: 15000 });
  });

  test('should allow setting ant colony parameters', async ({ page }) => {
    const controls = new ControlPanelController(page);
    await controls.open();
    await controls.openHiveColonyRulesSection();

    await controls.getColonyGridAreaInput().fill('8');
    await controls.getAntDormancyTempInput().fill('5');
    await controls.getAntColonySpawnThresholdInput().fill('150');
    await controls.getAntColonySpawnCostInput().fill('30');
    await controls.getPheromoneLifespanInput().fill('250');
    await controls.getPheromoneStrengthDecayInput().fill('0.08');
    
    await expect(controls.getColonyGridAreaInput()).toHaveValue('8');

    await controls.getApplyAndReset().click();
    await expect(page.getByText('Resetting simulation...')).not.toBeVisible({ timeout: 15000 });
  });
});

test.describe('Permitted Actors', () => {
    test('should not spawn birds if they are disabled', async ({ page }) => {
        const controls = new ControlPanelController(page);
        const eventLog = new EventLogPanelController(page);

        // Setup for bird spawn: high insect count, no initial birds
        await controls.open();
        await controls.getInsectsInput().fill('30');
        await controls.getBirdsInput().fill('0');

        // Uncheck birds from the permitted list
        await controls.openCollapsibleSection('Permitted Actors');
        await controls.panel.getByRole('checkbox', { name: '🐦 Bird' }).uncheck();

        await controls.getApplyAndReset().click();
        await expect(page.getByText('Resetting simulation...')).not.toBeVisible({ timeout: 15000 });
        
        // Run sim for a few seconds to trigger population manager
        await controls.runSimulation(15);

        // Check the log for bird spawn events
        await eventLog.open();
        await expect(eventLog.getFullPanel().getByText('A new bird has arrived to hunt!')).not.toBeVisible();
    });

    test.slow();
    test('should spawn birds if they are enabled under the right conditions', async ({ page }) => {
        const controls = new ControlPanelController(page);
        const eventLog = new EventLogPanelController(page);

        // Setup for bird spawn
        await controls.open();
        await controls.getInsectsInput().fill('30');
        await controls.getBirdsInput().fill('0');
        
        // Ensure birds are checked (they are by default)
        await controls.getApplyAndReset().click();
        await expect(page.getByText('Resetting simulation...')).not.toBeVisible({ timeout: 15000 });
        
        await controls.runSimulation(15);

        await eventLog.open();
        // Use a less strict locator to avoid flakes if multiple events happen
        const birdSpawnEvent = eventLog.getFullPanel().getByText(/A new bird has arrived/);
        await expect(birdSpawnEvent.first()).toBeVisible({ timeout: 15000 });
    });
});

test.describe('Full Environment Parameter Test', () => {
  test('should set Flower Detail multiplier', async ({ page }) => {
    const controls = new ControlPanelController(page);
    await controls.open();
    await controls.setFlowerDetail('x32');
    await controls.getApplyAndReset().click();
    await expect(page.getByText('Resetting simulation...')).not.toBeVisible({ timeout: 15000 });
  });

  test('should set all parameters and apply', async ({ page }) => {
    const controls = new ControlPanelController(page);
    await controls.open();

    // World Parameters
    await controls.getGridWidthInput().fill('15');
    await controls.getGridHeightInput().fill('15');
    await controls.getTemperatureInput().fill('20');
    await controls.getHumidityInput().fill('0.5');
    await controls.setWindDirection('NE');
    await controls.getWindStrengthInput().fill('5');
    
    // Initial Population
    await controls.getFlowersInput().fill('10');
    await controls.getInsectsInput().fill('5');
    await controls.getBirdsInput().fill('3');

    await controls.openHiveColonyRulesSection();
    await controls.getHiveGridAreaInput().fill('12');
    await controls.getBeeDormancyTempInput().fill('8');
    await controls.getWinterHoneyUseInput().fill('0.02');
    await controls.getPollenToHoneyInput().fill('0.6');
    await controls.getHiveSpawnThresholdInput().fill('120');
    await controls.getHiveSpawnCostInput().fill('25');
    await controls.getTerritoryMarkLifespanInput().fill('150');
    await controls.getSignalTTLInput().fill('15');
    await controls.getBeePollinationWanderChanceInput().fill('0.3');
    await controls.getColonyGridAreaInput().fill('8');
    await controls.getAntDormancyTempInput().fill('5');
    await controls.getAntColonySpawnThresholdInput().fill('150');
    await controls.getAntColonySpawnCostInput().fill('30');
    await controls.getPheromoneLifespanInput().fill('250');
    await controls.getPheromoneStrengthDecayInput().fill('0.08');

    // Open closed sections and set values
    await controls.openSpiderRulesSection();
    await controls.setSpiderGridAreaInput('10');
    await controls.setSpiderWebStaminaInput('120');
    await controls.setSpiderWebStaminaRegenInput('0.70');
    await controls.setSpiderWebBuildCostInput('30');
    await controls.setSpiderMaxWebsInput('7');
    await controls.setSpiderWebLifespanInput('600');
    await controls.setSpiderWebStrengthInput('25');
    await controls.setSpiderWebTrapChanceInput('0.5');
    await controls.setSpiderEscapeChanceModifierInput('0.75');

    await controls.openEcosystemRulesSection();
    await controls.getHerbicideDamageInput().fill('30');
    await controls.getHerbicideCooldownInput().fill('100');
    await controls.getHerbicideThresholdInput().fill('0.8');

    await controls.openEvolutionReproductionSection();
    await controls.getReproductionCooldownInput().fill('5');
    await controls.getMutationChanceInput().fill('0.1');
    await controls.getMutationAmountInput().fill('0.25');

    await controls.openWeatherEventsSection();
    await controls.getWeatherEventChanceInput().fill('0.01');
    await controls.getWeatherMinDurationInput().fill('25');
    await controls.getWeatherMaxDurationInput().fill('55');

    await controls.openGraphicsUISection();
    await controls.setNotificationMode('log');

    await controls.getApplyAndReset().click();
    await expect(page.getByText('Resetting simulation...')).not.toBeVisible({ timeout: 15000 });
  });
});

test.describe('Intervention Tools Panel', () => {
    test.slow();

    test('should trigger a weather event and enter cooldown', async ({ page }) => {
        const tools = new ToolsPanelController(page);
        const eventLog = new EventLogPanelController(page);
        const header = page.locator('header');
        const controls = new ControlPanelController(page);

        // Start the simulation first for the event to be processed
        await controls.open();
        await controls.getStart().click();

        await tools.open();

        const heatwaveButton = tools.getWeatherButton('Heatwave');
        await expect(heatwaveButton).toBeEnabled();
        await heatwaveButton.click();

        // Panel should close after action
        await expect(tools.panel).not.toBeInViewport();

        // Check for UI feedback
        await expect(header.getByText('Heatwave')).toBeVisible({ timeout: 10000 });
        await eventLog.open();
        await expect(eventLog.getFullPanel().getByText('A heatwave has begun!')).toBeVisible();
        await eventLog.close();

        // Check for cooldown
        await tools.open();
        await expect(tools.getWeatherButton('Heatwave')).toBeDisabled();
        await expect(tools.getWeatherButton('Coldsnap')).toBeDisabled();
    });

    test('should introduce a new species', async ({ page }) => {
        const tools = new ToolsPanelController(page);
        const eventLog = new EventLogPanelController(page);
        const controls = new ControlPanelController(page);

        // Ensure snails are allowed
        await controls.open();
        await controls.openCollapsibleSection('Permitted Actors');
        await controls.panel.getByRole('checkbox', { name: '🐌 Snail' }).check();
        await controls.getApplyAndReset().click();
        await expect(page.getByText('Resetting simulation...')).not.toBeVisible({ timeout: 15000 });
        
        // Start the simulation before introducing actors
        await controls.open();
        await controls.getStart().click();

        await tools.open();
        await tools.getActorSelect().selectOption({ label: '🐌 Snail' });
        await tools.getActorCountInput().fill('7');
        await tools.getIntroduceActorsButton().click();

        await expect(tools.panel).not.toBeInViewport();

        await eventLog.open();
        await expect(eventLog.getFullPanel().getByText('Introduced 7 🐌 into the garden.')).toBeVisible();
    });
    
    test('should allow planting a champion seed', async ({ page }) => {
        const controls = new ControlPanelController(page);
        const eventLog = new EventLogPanelController(page);
        const dataPanel = new DataPanelController(page);
        const tools = new ToolsPanelController(page);
        const canvas = page.getByRole('grid', { name: 'EvoGarden simulation grid' });

        // 1. Generate a champion by letting one flower live for a while
        await controls.open();
        await controls.getFlowersInput().fill('1');
        await controls.getInsectsInput().fill('0');
        await controls.getBirdsInput().fill('0');
        await controls.getSeasonLengthInput().fill('1000'); // Long season to prevent winter death
        await controls.openGraphicsUISection();
        await controls.page.getByLabel('Simulation Speed').selectOption('4');
        await controls.getApplyAndReset().click();
        await expect(page.getByText('Resetting simulation...')).not.toBeVisible({ timeout: 15000 });
        
        // At 4x speed, 15 seconds is enough ticks to pass the 100-tick challenge.
        await controls.runSimulation(15);

        // 2. Verify champion was saved
        await eventLog.open();
        await expect(eventLog.getFullPanel().getByText(/New champion saved! Longest Lived/)).toBeVisible({timeout: 15000});
        await eventLog.close();
        
        await dataPanel.open();
        await dataPanel.goToSeedBankTab();
        await expect(dataPanel.panel.getByText('Longest Lived')).toBeVisible();
        await dataPanel.close();

        // 3. Start planting mode
        await tools.open();
        await tools.getChampionButton('longestLived').click();

        // 4. Verify planting mode is active
        await expect(tools.getPlantingModeBanner()).toBeVisible();
        await expect(canvas).toHaveCSS('cursor', 'crosshair');

        // 5. Plant the seed on an empty cell
        await canvas.click({ position: { x: 10, y: 10 } });

        // 6. Verify planting was successful
        await expect(tools.getPlantingModeBanner()).not.toBeVisible();
        await eventLog.open();
        await expect(eventLog.getFullPanel().getByText('Champion seed planted!')).toBeVisible();
    });
});
