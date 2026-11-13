import { test, expect } from "@playwright/test";
import { AccessToken } from "livekit-server-sdk";

test("two browsers exchange audio, optional webcam and release devices when the meeting closes", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext({ permissions: ["microphone", "camera"] }),
    browser.newContext({ permissions: ["microphone", "camera"] }),
  ]);
  try {
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    for (const [i, page] of pages.entries()) {
      const token = new AccessToken("devkey", "secret", {
        identity: `test-${i}`,
        name: `Componente ${i + 1}`,
        ttl: 60,
      });
      token.addGrant({ roomJoin: true, room: "board-browser-test" });
      const awaitedToken = await token.toJwt();
      await page.addInitScript(
        (token) => {
          Object.assign(window, { testToken: token, testStreams: [] });
          const original = navigator.mediaDevices.getUserMedia.bind(
            navigator.mediaDevices,
          );
          navigator.mediaDevices.getUserMedia = async (options) => {
            const stream = await original(options);
            (
              window as unknown as { testStreams: MediaStream[] }
            ).testStreams.push(stream);
            return stream;
          };
        },
        await token.toJwt(),
      );
      await page.route(
        "https://project.invalid/functions/v1/board-room",
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              url: "ws://127.0.0.1:7880",
              token: awaitedToken,
            }),
          }),
      );
      await page.goto("http://127.0.0.1:5175/tests/fixtures/board-live.html");
      await page.getByRole("button", { name: "Entra nella stanza" }).click();
      await expect(
        page.getByRole("button", { name: "Accendi microfono" }),
      ).toBeVisible();
      expect(await page.locator("video").count()).toBe(0);
    }
    for (const page of pages)
      await page.getByRole("button", { name: "Accendi microfono" }).click();
    for (const page of pages)
      await expect(page.locator("audio")).toHaveCount(1);
    await pages[0].getByRole("button", { name: "Accendi webcam" }).click();
    await expect(pages[1].locator("video")).toHaveCount(1);
    await expect
      .poll(() =>
        pages[1]
          .locator("video")
          .evaluate((video: HTMLVideoElement) => video.readyState),
      )
      .toBeGreaterThanOrEqual(2);
    await pages[0].evaluate(() => {
      (
        window as unknown as { closeTestMeeting: () => void }
      ).closeTestMeeting();
    });
    await expect(
      pages[0].getByRole("region", { name: "Stanza audio e video" }),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        pages[0].evaluate(() =>
          (
            window as unknown as { testStreams: MediaStream[] }
          ).testStreams.every((s) =>
            s.getTracks().every((t) => t.readyState === "ended"),
          ),
        ),
      )
      .toBe(true);
    await expect(pages[1].locator("audio,video")).toHaveCount(0);
  } finally {
    await Promise.allSettled(contexts.map((c) => c.close()));
  }
});

test("consent revocation stops recording and a failed upload survives reload and can be retried", async ({
  browser,
}) => {
  const context = await browser.newContext({ permissions: ["microphone"] });
  let lease = true,
    failUpload = true;
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.assign(window, { testStreams: [] });
      const get = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      navigator.mediaDevices.getUserMedia = async (options) => {
        const stream = await get(options);
        (window as unknown as { testStreams: MediaStream[] }).testStreams.push(
          stream,
        );
        return stream;
      };
    });
    await page.route("https://project.invalid/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body: unknown = null,
        status = 200;
      if (
        path.endsWith("/board_audio_tracks") ||
        path.endsWith("/board_ai_jobs")
      )
        body = [];
      else if (path.endsWith("/board_recording_consents"))
        body = [
          {
            id: 1,
            participant_id: "00000000-0000-4000-8000-000000000003",
            user_id: "00000000-0000-4000-8000-000000000002",
            consented: true,
            notice_version: "v1",
            created_at: "2026-11-01T17:00:00Z",
          },
        ];
      else if (path.endsWith("/board_ai_settings"))
        body = {
          enabled: false,
          provider: "test",
          api_base: "https://provider.invalid",
          transcription_model: "test",
          drafting_model: "test",
          cost_per_min_eur: "0.01",
          max_cost_eur: "5",
          notice_version: "v1",
          draft_max_tokens: 4000,
        };
      else if (path.endsWith("/board_ai_usage"))
        body = { reserved: "0", limit: "5" };
      else if (path.endsWith("/board_audio_track_start_with_participants"))
        body = "00000000-0000-4000-8000-000000000004";
      else if (path.endsWith("/board_recording_lease")) body = lease;
      else if (path.includes("/storage/")) {
        status = failUpload ? 503 : 200;
        body = failUpload
          ? { message: "offline", statusCode: "503" }
          : { Key: "stored" };
      }
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    await page.goto("http://127.0.0.1:5175/tests/fixtures/board-audio.html");
    await page
      .getByRole("button", { name: "Avvia la mia registrazione" })
      .click();
    await expect(
      page.getByRole("button", { name: "Termina e carica" }),
    ).toBeVisible();
    lease = false;
    await expect(
      page.getByRole("button", { name: "Termina e carica" }),
    ).toHaveCount(0, { timeout: 8000 });
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as { testStreams: MediaStream[] }
          ).testStreams.every((s) =>
            s.getTracks().every((t) => t.readyState === "ended"),
          ),
        ),
      )
      .toBe(true);
    await expect(
      page.getByRole("button", { name: "Riprova caricamento" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Riprova caricamento" }),
    ).toBeVisible();
    failUpload = false;
    await page.getByRole("button", { name: "Riprova caricamento" }).click();
    await expect(
      page.getByRole("button", { name: "Riprova caricamento" }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});
