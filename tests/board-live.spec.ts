import { test, expect } from "@playwright/test";
import { AccessToken } from "livekit-server-sdk";

test("desktop workspace preserves the call, unsaved minutes and recording across views and adapts to mobile", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["microphone", "camera"] });
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const stamp = "2026-11-13T17:00:00Z";
  const token = new AccessToken("devkey", "secret", { identity: uuid(4), name: "Luca Bianchi", ttl: 120 });
  token.addGrant({ roomJoin: true, room: "board-workspace-test" });
  const jwt = await token.toJwt();
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.assign(window, { testStreams: [] });
      const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (options) => {
        const stream = await get(options);
        (window as unknown as { testStreams: MediaStream[] }).testStreams.push(stream);
        return stream;
      };
    });
    await page.route("https://project.invalid/**", async (route) => {
      const url = new URL(route.request().url());
      const name = url.pathname.split("/").pop();
      let body: unknown = [];
      if (name === "board-room") body = { url: "ws://127.0.0.1:7880", token: jwt };
      else if (name === "board_quorum") body = { total: 7, present: 4, required: 4, met: true };
      else if (name === "board_chair_user") body = uuid(2);
      else if (name === "board_voter_eligible" || name === "board_recording_lease") body = true;
      else if (name === "board_minutes") {
        const row = { id: uuid(20), meeting_id: uuid(1), number: 3, status: "BOZZA", current_version: 1, signed_path: null, signed_at: null, origin_minutes_id: null,
          board_minute_versions: [{ id: uuid(21), version: 1, body: "Verbale della seduta\n\nSono presenti quattro componenti. Si esamina il programma delle attività associative.", content_hash: "12345678", source: "manuale", created_by: uuid(4), created_at: stamp }], board_minute_rectifications: [] };
        body = route.request().headers()["accept"]?.includes("vnd.pgrst.object") ? row : url.searchParams.has("origin_minutes_id") && url.searchParams.get("origin_minutes_id") === "not.is.null" ? [] : [row];
      }
      else if (name === "board_recording_consents") body = [{ id: 1, participant_id: uuid(7), user_id: uuid(4), consented: true, notice_version: "v1", created_at: stamp }];
      else if (name === "board_ai_settings") body = { enabled: false, provider: "test", api_base: "https://provider.invalid", transcription_model: "test", drafting_model: "test", cost_per_min_eur: "0.01", max_cost_eur: "5", notice_version: "v1", draft_max_tokens: 4000 };
      else if (name === "board_ai_usage") body = { reserved: "0", limit: "5" };
      else if (name === "board_document_worker_status") body = { paired: false, online: false };
      else if (name === "board_audio_track_start_with_participants") body = uuid(30);
      else if (url.pathname.includes("/storage/")) body = { Key: "stored" };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto("http://127.0.0.1:5175/tests/fixtures/board-workspace.html");
    await expect(page.getByText("Sei il verbalizzante")).toBeVisible();
    await expect(page.getByRole("button", { name: "Chiudi seduta" })).toHaveCount(0);
    await page.getByRole("button", { name: "Entra nella stanza" }).click();
    await page.getByRole("button", { name: "Accendi microfono" }).click();
    await expect(page.getByText("Collegato · microfono acceso")).toBeVisible();
    await page.getByRole("tab", { name: "Verbale", exact: true }).click();
    const draft = page.getByRole("textbox", { name: "Testo del verbale" });
    await draft.fill("Bozza non ancora salvata, da conservare durante la seduta.");
    await page.getByRole("tab", { name: "Registrazione", exact: true }).click();
    await page.getByRole("button", { name: "Avvia registrazione della stanza" }).click();
    await expect(page.getByRole("button", { name: "Termina e carica" })).toBeVisible();
    await page.getByRole("tab", { name: "Ordine del giorno" }).click();
    await expect(page.getByRole("button", { name: "Registrazione in corso", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Spegni microfono" })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { testStreams: MediaStream[] }).testStreams.every((s) => s.getTracks().every((t) => t.readyState === "live")))).toBe(true);
    await page.getByRole("tab", { name: "Verbale", exact: true }).click();
    await expect(draft).toHaveValue("Bozza non ancora salvata, da conservare durante la seduta.");
    await expect(page.getByRole("tab", { name: "Verbale", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Verbale", exact: true })).toHaveCSS("font-weight", "600");
    await page.screenshot({ path: testInfo.outputPath("workspace-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "Spegni microfono" })).toBeVisible();
    await page.getByLabel("Vista della seduta").selectOption("presenze");
    await expect(page.getByRole("region", { name: "Presenze della seduta" })).toBeVisible();
    await page.getByLabel("Vista della seduta").selectOption("verbale");
    await expect(draft).toHaveValue("Bozza non ancora salvata, da conservare durante la seduta.");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("workspace-mobile.png"), fullPage: true });
    await page.getByRole("button", { name: "Registrazione in corso", exact: true }).click();
    await page.getByRole("button", { name: "Termina e carica" }).click();
    await expect(page.getByRole("button", { name: "Registrazione in corso", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Esci dalla stanza" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { testStreams: MediaStream[] }).testStreams.every((s) => s.getTracks().every((t) => t.readyState === "ended")))).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("http://127.0.0.1:5175/tests/fixtures/board-workspace.html?role=president");
    await expect(page.getByText("Presiedi questa seduta")).toBeVisible();
    await expect(page.getByRole("button", { name: "Chiudi seduta" })).toBeVisible();
    await page.getByRole("tab", { name: "Presenze", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Ordine del giorno" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Registro attività" }).click();
    await expect(page.getByRole("dialog")).toContainText("Registro della seduta");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally { await context.close(); }
});

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
      .getByRole("button", { name: "Avvia registrazione in sala" })
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
