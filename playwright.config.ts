import { defineConfig } from '@playwright/test';
import { join, dirname } from 'node:path';
export default defineConfig({
 testDir: './e2e', timeout: 90_000, workers: 1,
 use: { baseURL: 'http://127.0.0.1:4790', channel: 'chrome', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
 webServer: {
  command: 'node --import tsx server/index.ts', url: 'http://127.0.0.1:4790/api/health', reuseExistingServer: false,
  env: { NODE_ENV:'production', LAUNCHPAGE_PORT:'4790', LAUNCHPAGE_HOME:join(process.cwd(),'.local/e2e-'+Date.now()), PATH: `${join(process.cwd(),'test/e2e-bin')}:${dirname(process.execPath)}:${process.env.PATH}` },
 },
});
