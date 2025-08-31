import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const isCI = !!process.env.CI;

// Set an environment variable to signal that tests are running.
// This will be picked up by vite.config.ts to disable plugins like autoReactDevtools.
process.env.E2E_TESTING = 'true';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 1,
  workers: isCI ? 4 : undefined,
  reporter: 'html',
  use: {
    baseURL: isCI ? 'http://localhost:4173' : 'http://localhost:5173',
    launchOptions: {
//      args: ['--disable-gpu'],
    },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retry-with-video',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
//    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
//    { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
  ],

  /* Run your web server before starting the tests */
  webServer: isCI
    ? {
        command: 'npm run build && npm run preview',
        url: 'http://localhost:4173',
        reuseExistingServer: false,
      }
    : {
        // Local: dev server with hot reload
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
      },
});
