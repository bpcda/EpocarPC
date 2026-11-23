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
  const pdfPath = "event-documents/shooting/2026-12-03/privacy/00000000-0000-4000-8000-000000000001.pdf";
  let submitted = false;
  let confirmed = false;
  let emailCalls = 0;
  await page.route("https://shooting.invalid/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path === "/storage/v1/object/sign/" + pdfPath) {
      if (route.request().method() === "POST") {
        return route.fulfill({ json: { signedURL: "/object/sign/" + pdfPath + "?token=test" } });
      }
      return route.fulfill({ contentType: "application/pdf", headers: { "content-disposition": 'attachment; filename="Informativa privacy.pdf"' }, body: "%PDF-1.7" });
    }
    switch (path) {
      case "/auth/v1/signup":
      case "/auth/v1/token":
        json = session;
        break;
      case "/auth/v1/user": json = user; break;
      case "/rest/v1/vehicles": json = [{ id: garage, brand: "Fiat", model: "500", plate: null }]; break;
      case "/rest/v1/shooting_evenings":
        json = [{ day: "2026-12-03", policy_version: "test1", privacy_text: "Informativa di prova\n\n[PDF: " + pdfPath.replace("event-documents/", "") + "]", image_text: "Autorizzazione di prova" }];
        break;
      case "/rest/v1/rpc/submit_shooting_photo_request":
        expect(route.request().postDataJSON()).toMatchObject({ p_garage: garage, p_plate: "AB123", p_save: false, p_read: true, p_images: false, p_gallery: mode === "registrazione", p_version: "test1" });
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
  await page.getByRole("button", { name: "Continua ai documenti" }).click();
  await expect(page.getByRole("heading", { name: "Verifica e invia" })).toBeVisible();
  const pdf = page.waitForEvent("download");
  await page.getByRole("button", { name: "Scarica informativa privacy (PDF)" }).click();
  expect((await pdf).suggestedFilename()).toBe("Informativa privacy.pdf");
  await page.getByLabel("Ho letto l’informativa").check();
  await page.getByLabel("Non autorizzo", { exact: true }).check();
  const gallery = page.getByLabel(/Autorizzo EPOCAR a pubblicare/);
  await expect(gallery).not.toBeChecked();
  if (mode === "registrazione") await gallery.check();
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
  let settingsSaved = false;
  let deliveredId = "";
  let published = false;
  const expires = new Date(Date.now()+30*86400000).toISOString();
  const uploads: string[] = [];
  const row = { day, id: "r1", slot_id: "s1", state: "confirmed", brand: "Fiat", model: "500",
    image_permission: false, email: "private@example.invalid", notes: "nota privata", plate: "AB123" };
  await page.route("https://shooting.invalid/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/shooting_calendar_status")) {
      return route.fulfill({ status: 404, json: { code: "PGRST202", message: "Function not installed" } });
    }
    if (path.endsWith("/shooting_plate")) throw new Error("La stampa ha richiesto la targa");
    let json: unknown = [];
    if (path.startsWith("/storage/v1/object/event-documents/shooting/")) {
      uploads.push(path.slice("/storage/v1/object/event-documents/".length));
      return route.fulfill({ json: { Key: path, Id: "test" } });
    }
    if (path.endsWith("/shooting_deliver_photo")) {
      const args = route.request().postDataJSON();
      expect(args).toMatchObject({p_slot:"s1",p_requests:["r4"]});
      deliveredId = args.p_id;
    }
    if (path.endsWith("/shooting_photo_admin")) json = {permissions:{r4:true}, photos:deliveredId ? [
      {id:deliveredId,slot_id:"s1",recipients:["r4"],eligible:true,gallery_id:published?"published":null,expires_at:expires}
    ] : []};
    if (path.startsWith("/storage/v1/object/sign/shooting-photos/")) {
      if (route.request().method() === "GET") return route.fulfill({path:"src/assets/hero-car.jpg",contentType:"image/jpeg"});
      json = {signedURL:"/object/sign/shooting-photos/preview.jpg?token=example"};
    }
    if (path.endsWith("/shooting_publish_photo")) {
      const args = route.request().postDataJSON();
      expect(args.p_id).toBe(deliveredId);
      if(args.p_publish) expect(args.p_verified).toBe(true);
      published = args.p_publish;
    }
    if (path.endsWith("/my_shooting_photos")) json = [{id:deliveredId,day,expires_at:expires}];
    if (path.endsWith("/functions/v1/shooting-photo")) {
      expect(route.request().postDataJSON()).toEqual({id:deliveredId});
      return route.fulfill({contentType:"application/octet-stream",path:"src/assets/hero-car.jpg"});
    }
    if (path.endsWith("/shooting_configure")) {
      const args = route.request().postDataJSON();
      expect(uploads).toHaveLength(2);
      expect(args).toMatchObject({ p_day: day, p_version: "v2", p_privacy: "[PDF: " + uploads[0] + "]", p_images: "[PDF: " + uploads[1] + "]" });
      settingsSaved = true;
    }
    if (path.endsWith("/user_roles")) json = [{ role: "admin" }];
    if (path.endsWith("/shooting_agenda")) json = {
      evenings: [{ day, meeting_place: "Piazza Test" }, { day: otherDay, cancelled: true }],
      slots: [{ id: "s1", day, starts: "18:30:00", duration_minutes: 20 }, { id: "s2", day: otherDay, starts: "19:00:00" }],
      requests: [row, { ...row, id: "r2", state: "pending", model: "In attesa" },
        { ...row, assigned_day: otherDay, id: "r3", slot_id: "s2", model: "Altra serata" },
        { ...row, id: "r4", model: "Panda", image_permission: true }],
    };
    await route.fulfill({ json });
  });
  await page.goto("/admin?tab=shooting");
  await page.getByRole("button", { name: "Shooting · Documenti e serata" }).click();
  await expect(page.getByLabel("PDF informativa privacy")).toBeVisible();
  await expect(page.getByLabel("PDF autorizzazione immagini")).toBeVisible();
  await page.getByLabel("Versione dei testi approvati").fill("v2");
  const policy = { name: "modulo.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 test") };
  await page.getByLabel("PDF informativa privacy").setInputFiles(policy);
  await page.getByLabel("PDF autorizzazione immagini").setInputFiles(policy);
  await page.getByRole("button", { name: "Salva impostazioni" }).click();
  await expect.poll(() => settingsSaved).toBe(true);
  await page.getByRole("button", { name: "Shooting · Agenda" }).click();
  await expect(page.getByRole("link", { name: /Prepara evento in Google Calendar/ })).toHaveAttribute("href", /dates=20261203T183000%2F20261203T185000/);
  await page.getByRole("button", { name: "Shooting · Gallery" }).click();
  await expect(page.getByRole("heading", { name: "Prepara uno scatto" })).toBeVisible();
  await page.getByLabel("Foto della serata").setInputFiles("src/assets/hero-car.jpg");
  await page.getByText("Esporta una copia locale").click();
  const exportPhoto = page.getByRole("button", { name: /Scarica JPEG/ });
  await expect(exportPhoto).toBeDisabled();
  await page.getByLabel(/Ho verificato le autorizzazioni/).check();
  const jpeg = page.waitForEvent("download");
  await exportPhoto.click();
  expect((await jpeg).suggestedFilename()).toMatch(/^epocar-shooting-2026-12-03-.+\.jpg$/);
  await page.getByRole("combobox",{name:"Appuntamento",exact:true}).selectOption("s1");
  await page.getByLabel(/Panda.*Gallery consentita/).check();
  await page.getByRole("button",{name:"Consegna al socio"}).click();
  await expect(page.getByText(/Foto consegnata\./)).toBeVisible();
  await page.getByRole("button",{name:"Vedi scatto"}).click();
  await expect(page.getByRole("button",{name:"Pubblica in Gallery"})).toBeDisabled();
  await page.getByLabel(/Ho verificato per questo scatto/).check();
  await page.getByRole("button",{name:"Pubblica in Gallery"}).click();
  await page.getByRole("button",{name:"Ritira dalla Gallery"}).click();
  await expect(page.getByText("Foto ritirata.")).toBeVisible();
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
  await page.emulateMedia({media:"screen"});
  await page.goto("/account?tab=foto");
  await page.getByRole("button",{name:"Apri foto"}).click();
  const download = page.waitForEvent("download");
  await page.getByRole("link",{name:"Scarica foto"}).click();
  expect((await download).suggestedFilename()).toMatch(/^epocar-2026-12-03-/);
});
