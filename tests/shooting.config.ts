import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testMatch: "shooting-mobile.spec.ts",
  use: {
    ...devices["Pixel 7"],
    baseURL: "http://127.0.0.1:5189",
    launchOptions: { executablePath: process.env.CHROMIUM_PATH },
  },
  webServer: {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    command: "npm run dev -- --host 127.0.0.1 --port 5189 --strictPort",
    url: "http://127.0.0.1:5189",
    env: { VITE_SUPABASE_URL: "https://shooting.invalid", VITE_SUPABASE_PUBLISHABLE_KEY: "synthetic-anon-key", VITE_STRAPI_URL: "" },
  },
});
