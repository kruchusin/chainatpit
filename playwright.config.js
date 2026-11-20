import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:8788', locale: 'th-TH' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Run via `firebase emulators:exec` (see npm run test:e2e) so the emulators are up.
    // --binding passes the vars to Pages Functions; env covers the wrangler process itself.
    command: 'npx wrangler pages dev public --port 8788 --binding FIREBASE_PROJECT_ID=demo-chainatpit --binding FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 --binding FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 --r2=MEDIA',
    url: 'http://localhost:8788',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      FIREBASE_PROJECT_ID: 'demo-chainatpit',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    },
  },
});
