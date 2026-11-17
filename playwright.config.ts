import { defineConfig } from "@playwright/test";
import { mkdtempSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";

mkdirSync(".artifacts", { recursive: true });
process.env.RELAY_TEST_DIR ??= mkdtempSync(resolve(".artifacts/relay-test-e2e-"));
process.env.RELAY_TEST_SECRET ??= randomBytes(48).toString("base64url");
const baseURL = "http://127.0.0.1:3100";
const testDir = process.env.RELAY_TEST_DIR;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/auth.setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 }, storageState: join(testDir, "alice.json") } },
    { name: "mobile", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: join(testDir, "alice.json") } },
  ],
  webServer: {
    command: process.env.RELAY_TEST_SERVER === "production"
      ? "npm run start -- --port 3100"
      : "npm run dev -- --port 3100",
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: join(testDir, "workspace.db"),
      BETTER_AUTH_SECRET: process.env.RELAY_TEST_SECRET,
      BETTER_AUTH_URL: baseURL,
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
