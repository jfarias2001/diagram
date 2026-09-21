import { defineConfig } from '@playwright/test';

// Usa o Chrome já instalado na máquina (sem baixar navegadores).
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: './e2e/.results',
  use: {
    baseURL: 'http://localhost:5199',
    channel: process.env.PW_CHANNEL ?? 'chrome',
    headless: true,
    viewport: { width: 1360, height: 820 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx tsx e2e/stack.ts',
    url: 'http://localhost:5199/login',
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
