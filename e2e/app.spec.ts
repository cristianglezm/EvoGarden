import { test, expect, Page, Locator } from '@playwright/test';
import { ControlPanelController } from './controllers/ControlPanelController';
import { FlowerPanelController } from './controllers/FlowerPanelController';
import { DataPanelController } from './controllers/DataPanelController';
import { EventLogPanelController } from './controllers/EventLogPanelController';
import { GlobalSearchController } from './controllers/GlobalSearchController';
import { InsectDetailsPanelController } from './controllers/InsectDetailsPanelController';

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
    await controls.runSimulation(5);
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
    await page.waitForTimeout(500); // Let it run

    // Select a flower, which should pause it
    expect(await flowers.selectFlower()).toBe(true);
    await flowers.waitForPanel();

    // Verify it is paused by waiting for the canvas to become static.
    // The waitCanvasStable helper is more robust than a manual check because it retries.
    await flowers.waitCanvasStable(canvas);
    const pausedCanvasScreenshot = await canvas.screenshot();
    
    // Deselect the flower by clicking an empty area
    await flowers.closePanel();

    // Wait for the simulation to resume
    await page.waitForTimeout(500); 

    // Verify the canvas has changed
    const resumedCanvasScreenshot = await canvas.screenshot();
    expect(pausedCanvasScreenshot.equals(resumedCanvasScreenshot)).toBe(false);
  });
});

test.describe('Global Search', () => {
    test('should find, highlight, and track an actor by its ID', async ({ page }) => {
        const controls = new ControlPanelController(page);
        const actorSelector = new FlowerPanelController(page);
        const search = new GlobalSearchController(page);

        // Run sim for a few seconds to generate a variety of actors
        await controls.open();
        await controls.getApplyAndReset().click();
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
        await controls.page.getByLabel('🐦 Bird').uncheck();

        await controls.getApplyAndReset().click();
        
        // Run sim for a few seconds to trigger population manager
        await controls.runSimulation(5);

        // Check the log for bird spawn events
        await eventLog.open();
        await expect(eventLog.getFullPanel().getByText('A new bird has arrived to hunt!')).not.toBeVisible();
    });

    test('should spawn birds if they are enabled under the right conditions', async ({ page }) => {
        const controls = new ControlPanelController(page);
        const eventLog = new EventLogPanelController(page);

        // Setup for bird spawn
        await controls.open();
        await controls.getInsectsInput().fill('30');
        await controls.getBirdsInput().fill('0');
        
        // Ensure birds are checked (they are by default)
        await controls.getApplyAndReset().click();
        
        await controls.runSimulation(5);

        await eventLog.open();
        // Use a less strict locator to avoid flakes if multiple events happen
        const birdSpawnEvent = eventLog.getFullPanel().getByText(/A new bird has arrived/);
        await expect(birdSpawnEvent.first()).toBeVisible({ timeout: 10000 });
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
  });
});
