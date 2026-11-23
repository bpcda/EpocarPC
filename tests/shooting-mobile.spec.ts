import { expect, test } from "@playwright/test";

for (const mode of ["accesso", "registrazione"]) {
test(`shooting mobile · ${mode}, richiesta e cambio serata`, async ({ page, baseURL }) => {
  expect(baseURL).toBe("http://127.0.0.1:5189");
  const id = "10000000-0000-4000-8000-000000000001";
  const garage = "20000000-0000-4000-8000-000000000002";
  const user = { id, email: "mobile@example.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (data: object) => Buffer.from(JSON.stringify(data)).toString("base64url");
  const access = [encode({ alg: "HS256" }), encode({ sub: id, exp: expires, role: user.role }), "synthetic"].join(".");
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
        json = { access_token: access, refresh_token: "synthetic", expires_in: 3600, expires_at: expires, token_type: "bearer", user };
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
