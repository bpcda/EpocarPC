import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "board-live.spec.ts",
  timeout: 60000,
  workers: 1,
  use: {
    headless: true,
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
    permissions: ["microphone", "camera"],
  },
  webServer: [
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5175",
      url: "http://127.0.0.1:5175",
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_SUPABASE_URL: "https://project.invalid",
        VITE_SUPABASE_PUBLISHABLE_KEY: "synthetic-anon-key",
      },
    },
    {
      command: "livekit-server --dev --bind 127.0.0.1 --node-ip 127.0.0.1",
      url: "http://127.0.0.1:7880",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
