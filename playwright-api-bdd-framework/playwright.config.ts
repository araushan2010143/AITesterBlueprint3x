import type { PlaywrightTestConfig } from '@playwright/test';
import { devices } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: 'tests',
  timeout: 120000,
  expect: {
    timeout: 5000
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    actionTimeout: 10000,
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'api',
      use: {
        ...devices['Desktop Chrome']
      }
    }
  ]
};

export default config;
