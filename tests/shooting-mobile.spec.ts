import { expect, test } from "@playwright/test";

function syntheticSession() {
  const id = "10000000-0000-4000-8000-000000000001";
  const user = { id, email: "mobile@example.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (data: object) => Buffer.from(JSON.stringify(data)).toString("base64url");
  const access = [encode({ alg: "HS256" }), encode({ sub: id, exp: expires, role: user.role }), "synthetic"].join(".");
  return { access_token: access, refresh_token: "synthetic", expires_in: 3600, expires_at: expires, token_type: "bearer", user };
}

for (const mode of ["accesso", "registrazione"]) {
test(`shooting mobile · ${mode}, richiesta e cambio serata`, async ({ page, baseURL }) => {
  expect(baseURL).toBe("http://127.0.0.1:5189");
  const garage = "20000000-0000-4000-8000-000000000002";
  const session = syntheticSession();
  const { user } = session;
  const receipt = "30000000-0000-4000-8000-000000000003";
  let submitted = false;
  let confirmed = false;
  let emailCalls = 0;
  await page.route("https://shooting.invalid/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    switch (path) {
      case "/auth/v1/signup":
      case "/auth/v1/token":
        json = session;
        break;
      case "/auth/v1/user": json = user; break;
      case "/rest/v1/vehicles": json = [{ id: garage, brand: "Fiat", model: "500", plate: null }]; break;
      case "/rest/v1/shooting_evenings":
        json = [{ day: "2026-12-03", policy_version: "test1", privacy_text: "Informativa di prova", image_text: "Autorizzazione di prova" }];
        break;
      case "/rest/v1/rpc/submit_shooting_request":
        expect(route.request().postDataJSON()).toMatchObject({ p_garage: garage, p_plate: "AB123", p_save: false, p_read: true, p_images: false, p_version: "test1" });
        submitted = true;
        json = receipt;
        break;
      case "/functions/v1/shooting-receipt":
        expect(route.request().postDataJSON()).toEqual({ id: receipt });
        emailCalls++;
        json = { state: "pending" };
        break;
      case "/rest/v1/shooting_requests":
        json = submitted ? [{ id: receipt, day: "2026-12-03", brand: "Fiat", model: "500", state: confirmed ? "confirmed" : "pending", appointment: confirmed ? "17/12/2026 · 18:45 · Piacenza" : null }] : [];
        break;
    }
    await route.fulfill({ json });
  });

  await page.goto("/natale-su-ruote/shooting");
  await page.getByRole("link", { name: "Consulta le richieste e le date aperte" }).click();
  await expect(page).toHaveURL(/\/auth\?next=/);
  if (mode === "registrazione") {
    await page.getByRole("button", { name: "Registrati" }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Socio");
    await page.getByLabel("Cognome").fill("Test");
  }
  await page.locator('input[type="email"]').fill(user.email);
  await page.locator('input[type="password"]').fill("password-sintetica");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/shooting\/richiesta$/);
  await page.getByLabel("Serata").selectOption("2026-12-03");
  await page.getByRole("combobox", { name: "Veicolo", exact: true }).selectOption(garage);
  await page.getByLabel("Targa per l’accesso").fill("AB123");
  await page.getByLabel("Ho letto l’informativa").check();
  await page.getByLabel("Non autorizzo", { exact: true }).check();
  await page.getByRole("button", { name: "Invia richiesta" }).click();
  await expect(page.getByRole("status").filter({ hasText: receipt })).toBeVisible();
  await expect.poll(() => emailCalls).toBe(1);

  confirmed = true;
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "Fiat 500" })).toContainText("Appuntamento confermato · 17/12/2026 · 18:45 · Piacenza");
});
}

test("il foglio stampa solo veicoli confermati della serata e la scelta immagini", async ({ page, baseURL }) => {
  expect(baseURL).toBe("http://127.0.0.1:5189");
  const session = syntheticSession();
  await page.addInitScript(value => localStorage.setItem("sb-shooting-auth-token", JSON.stringify(value)), session);
  const day = "2026-12-03";
  const otherDay = "2026-12-17";
  const row = { id: "r1", slot_id: "s1", state: "confirmed", brand: "Fiat", model: "500",
    image_permission: false, email: "private@example.invalid", notes: "nota privata", plate: "AB123" };
  await page.route("https://shooting.invalid/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/shooting_plate")) throw new Error("La stampa ha richiesto la targa");
    let json: unknown = [];
    if (path.endsWith("/user_roles")) json = [{ role: "admin" }];
    if (path.endsWith("/shooting_agenda")) json = {
      evenings: [{ day, meeting_place: "Piazza Test" }, { day: otherDay, cancelled: true }],
      slots: [{ id: "s1", day, starts: "18:30:00", duration_minutes: 20 }, { id: "s2", day: otherDay, starts: "19:00:00" }],
      requests: [row, { ...row, id: "r2", state: "pending", model: "In attesa" },
        { ...row, id: "r3", slot_id: "s2", model: "Altra serata" },
        { ...row, id: "r4", model: "Panda", image_permission: true }],
    };
    await route.fulfill({ json });
  });
  await page.goto("/admin?tab=shooting");
  await page.getByRole("link", { name: "Foglio per il fotografo" }).click();
  await expect(page.getByRole("heading", { name: "18:30–18:50" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fiat Panda" })).toBeVisible();
  await expect(page.getByText(/ritratto non autorizzato/)).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Stampa foglio" })).toBeHidden();
  await expect(page.locator("main")).not.toContainText(/private@example|AB123|nota privata|In attesa|Altra serata/);
  await page.goto("/admin/shooting/2026-12-17/foglio-fotografo");
  await expect(page.getByText("Serata annullata.")).toBeVisible();
  await expect(page.getByText("Fiat 500")).toHaveCount(0);
});
