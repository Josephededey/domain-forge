import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/screenshots.spec.js'], // run with `npm run screenshots`
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://localhost:4173', trace: 'on-first-retry' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      // Needs DATABASE_URL + SESSION_SECRET (from server/.env or the environment).
      command: 'npm run migrate -w server && npm run seed -w server && npm run start -w server',
      url: 'http://localhost:3001/api/ready',
      env: {
        NODE_ENV: 'development',
        PORT: '3001',
        CLIENT_URL: 'http://localhost:4173',
        SEARCH_RATE_LIMIT_MAX: '1000',
        AUTH_RATE_LIMIT_MAX: '1000',
      },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run build -w client && npm run preview -w client',
      url: 'http://localhost:4173',
      env: { VITE_API_PROXY: 'http://localhost:3001' },
      reuseExistingServer: !process.env.CI,
    },
  ],
});
