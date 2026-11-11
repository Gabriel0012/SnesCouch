import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 5174;
const SIGNAL_PORT = 8788;
const ci = !!process.env.CI;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: ci ? 1 : 0,
  reporter: ci ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } } }],
  webServer: [
    {
      command: `npx wrangler dev --port ${SIGNAL_PORT} --ip 127.0.0.1 --var E2E:1`,
      cwd: "apps/signal",
      url: `http://127.0.0.1:${SIGNAL_PORT}/api/health`,
      reuseExistingServer: !ci,
      timeout: 120_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
      cwd: "apps/web",
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: !ci,
      timeout: 120_000,
      stderr: "ignore",
      env: { VITE_E2E: "1", SIGNAL_URL: `http://127.0.0.1:${SIGNAL_PORT}` },
    },
  ],
});
