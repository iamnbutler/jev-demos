import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath =
  process.env.CHROME_PATH || (existsSync(systemChrome) ? systemChrome : undefined);

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.pw.ts",
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4317",
    viewport: { width: 1440, height: 1050 },
    launchOptions: { executablePath },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun dev",
    url: "http://127.0.0.1:4317/api/health",
    reuseExistingServer: true,
    timeout: 30000,
  },
});
