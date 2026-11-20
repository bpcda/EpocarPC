// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { memberWallet } from "../../setup/functions/member-wallet/handler";
import { MEMBER_CARDS_OWNER_ID } from "../../setup/functions/member-card-management/owner";
import { validateApplePass } from "../../setup/functions/member-wallet/pass";
import { googleWalletUrl, MAX_APPLE_PASS_BYTES } from "../../setup/functions/member-wallet/validation";

const id = "10000000-0000-4000-8000-000000000001";
const user = "20000000-0000-4000-8000-000000000001";
const token = "v2." + "a".repeat(64);
const qr = "https://epocarpc.com/verifica-tessera#" + token;
const oldPath = `${id}/30000000-0000-4000-8000-000000000001.pkpass`;
const google = (overrides = {}, barcode = qr) => {
  const enc = (x: object) => Buffer.from(JSON.stringify(x)).toString("base64url");
  return `https://pay.google.com/gp/v/save/${enc({ alg: "RS256" })}.${enc({ iss: "issuer@example.invalid", aud: "google", typ: "savetowallet", payload: { genericObjects: [{ barcode: { type: "QR_CODE", value: barcode } }] }, ...overrides })}.c2lnbmF0dXJl`;
};
async function pass(barcode = qr, extra = false) {
  const zip = new JSZip();
  const data = new TextEncoder().encode(JSON.stringify({ formatVersion: 1, passTypeIdentifier: "pass.synthetic", teamIdentifier: "SYNTHETIC", serialNumber: "12", barcodes: [{ format: "PKBarcodeFormatQR", message: barcode }] }));
  const hash = Buffer.from(await crypto.subtle.digest("SHA-1", data)).toString("hex");
  zip.file("pass.json", data).file("manifest.json", JSON.stringify({ "pass.json": hash })).file("signature", "synthetic-test-only");
  if (extra) zip.file("unexpected.txt", "not-in-manifest");
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
function harness({ userId = user as string | null, active = true, attested = true, path = oldPath as string | null, googleUrl = null as string | null, failed = "" } = {}) {
  const auth = vi.fn(async () => ({ data: { user: userId ? { id: userId, user_metadata: { id: MEMBER_CARDS_OWNER_ID } } : null }, error: null }));
  const writes = vi.fn(); const filters = vi.fn();
  const from = vi.fn((table: string) => {
    let update = false;
    const result = () => ({ data: update ? null : table === "member_public_status" ? { treasury_member_id: id, admission_status: attested ? "confirmed" : "unverified", admission_source: "board_resolution", admission_date: "2026-01-01", admission_decision_date: "2026-01-01", treasury_updated_at: "2026-01-01T00:00:00Z", last_revision: 1, card_number: 12, membership_status: active ? "active" : "ceased" } : { qr_token: token, apple_wallet_path: path, google_wallet_url: googleUrl }, error: failed === table || update && failed === "write" ? { message: "private service error" } : null });
    const chain = { select: () => chain, eq: (...args: unknown[]) => { filters(table, ...args); return chain; }, maybeSingle: async () => result(), update: (data: unknown) => { update = true; writes(data); return chain; }, then: (fn: (data: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(fn) };
    return chain;
  });
  const upload = vi.fn(async (_path: string, _bytes: Uint8Array, _options: object) => ({ error: failed === "upload" ? {} : null }));
  const remove = vi.fn(async () => ({ error: null }));
  const sign = vi.fn(async () => ({ data: { signedUrl: "https://project.supabase.co/storage/v1/object/sign/member-wallet-passes/own.pkpass?token=short" }, error: null }));
  const bucket = vi.fn(() => ({ upload, remove, createSignedUrl: sign }));
  const db = { auth: { getUser: auth }, from, storage: { from: bucket } } as unknown as Parameters<typeof memberWallet>[1];
  const call = (body: unknown = { action: "get" }, jwt = "verified-session", origin = "https://epocarpc.com") => memberWallet(new Request("https://edge.invalid", { method: "POST", headers: { ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), Origin: origin, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) }, body: body instanceof FormData ? body : JSON.stringify(body) }), db);
  const uploadPass = async (bytes?: Uint8Array) => { const form = new FormData(); form.append("member_id", id); form.append("file", new File([bytes ?? await pass()], "socio.pkpass")); return call(form); };
  return { call, uploadPass, from, filters, writes, upload, remove, sign };
}

describe("private Wallet delivery", () => {
  it("rejects guests, invalid sessions, foreign origins and admin impersonation before reads", async () => {
    const h = harness(); expect((await h.call(undefined, "")).status).toBe(401); expect((await h.call(undefined, "session", "https://foreign.invalid")).status).toBe(403); expect(h.from).not.toHaveBeenCalled();
    const invalid = harness({ userId: null }); expect((await invalid.call()).status).toBe(401); expect(invalid.from).not.toHaveBeenCalled();
    expect((await h.call({ action: "get", member_id: id })).status).toBe(403);
    expect((await h.call({ action: "set_google", member_id: id, url: google() })).status).toBe(403);
    expect((await h.uploadPass()).status).toBe(403); expect(h.writes).not.toHaveBeenCalled();
  });
  it("derives the member only from the authenticated account and signs its own path on demand", async () => {
    const h = harness({ googleUrl: google() }); const response = await h.call();
    expect(await response.json()).toEqual({ apple_available: true, google_url: google() });
    expect(response.headers.get("Cache-Control")).toBe("no-store"); expect(h.sign).not.toHaveBeenCalled();
    expect(h.filters).toHaveBeenCalledWith("member_public_status", "user_id", user);
    expect(h.filters).toHaveBeenCalledWith("member_card_credentials", "treasury_member_id", id);
    expect((await h.call({ action: "apple" })).status).toBe(200); expect(h.sign).toHaveBeenCalledWith(oldPath, 120);
    expect(h.writes).not.toHaveBeenCalled();
  });
  it.each([{ active: false }, { attested: false }])("does not release a pass without current confirmed admission: %j", async options => {
    const h = harness(options); expect(await (await h.call()).json()).toEqual({ apple_available: false, google_url: null });
    expect((await h.call({ action: "apple" })).status).toBe(403); expect(h.sign).not.toHaveBeenCalled();
  });
  it("handles unpublished Apple and expired Google without hiding a valid Apple pass", async () => {
    const h = harness({ path: null }); expect(await (await h.call()).json()).toEqual({ apple_available: false, google_url: null });
    expect((await h.call({ action: "apple" })).status).toBe(404);
    expect(await (await harness({ googleUrl: google({ exp: 1 }) }).call()).json()).toEqual({ apple_available: true, google_url: null });
    const foreign = harness({ path: "20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001.pkpass" });
    expect((await foreign.call({ action: "apple" })).status).toBe(404); expect(foreign.sign).not.toHaveBeenCalled();
  });
  it("only the owner uploads a matching pass and replaces the pointer before deleting the old object", async () => {
    const h = harness({ userId: MEMBER_CARDS_OWNER_ID }); const bytes = await pass();
    expect((await h.uploadPass(bytes)).status).toBe(200);
    const [path, uploaded, options] = h.upload.mock.calls[0] as unknown as [string, Uint8Array, object];
    expect(path).toMatch(new RegExp(`^${id}/[0-9a-f-]{36}\\.pkpass$`)); expect(uploaded).toEqual(bytes);
    expect(options).toMatchObject({ contentType: "application/vnd.apple.pkpass", upsert: false });
    expect(h.writes).toHaveBeenCalledWith({ apple_wallet_path: path, wallet_updated_at: expect.any(String) });
    expect(h.remove).toHaveBeenCalledWith([oldPath]); expect(h.writes.mock.invocationCallOrder[0]).toBeLessThan(h.remove.mock.invocationCallOrder[0]);
  });
  it("keeps the previous pass on upload/database failure and removes only the failed new object", async () => {
    const h = harness({ userId: MEMBER_CARDS_OWNER_ID, failed: "member_card_credentials" });
    // A failed registry read must stop before Storage; exercise the separate write failure below.
    expect((await h.uploadPass()).status).toBe(503); expect(h.upload).not.toHaveBeenCalled();
    const failUpload = harness({ userId: MEMBER_CARDS_OWNER_ID, failed: "upload" });
    expect((await failUpload.uploadPass()).status).toBe(503); expect(failUpload.writes).not.toHaveBeenCalled(); expect(failUpload.remove).not.toHaveBeenCalled();
    const failWrite = harness({ userId: MEMBER_CARDS_OWNER_ID, failed: "write" });
    expect((await failWrite.uploadPass()).status).toBe(503); expect(failWrite.remove).not.toHaveBeenCalledWith([oldPath]);
    expect(failWrite.remove).toHaveBeenCalledWith([failWrite.upload.mock.calls[0][0]]);
  });
  it("rejects another member’s QR, malformed/oversized pass and arbitrary extra fields", async () => {
    const h = harness({ userId: MEMBER_CARDS_OWNER_ID });
    expect((await h.uploadPass(await pass(qr + "wrong"))).status).toBe(400);
    expect((await h.uploadPass(new Uint8Array(MAX_APPLE_PASS_BYTES + 1))).status).toBe(400);
    expect((await h.call({ action: "get", user_id: user })).status).toBe(400);
    expect(h.upload).not.toHaveBeenCalled(); expect(h.writes).not.toHaveBeenCalled();
  });
  it("lets only the owner save/clear genuine Google links and remove Apple without altering QR", async () => {
    const h = harness({ userId: MEMBER_CARDS_OWNER_ID });
    expect((await h.call({ action: "set_google", member_id: id, url: google() })).status).toBe(200);
    expect(h.writes).toHaveBeenLastCalledWith({ google_wallet_url: google(), wallet_updated_at: expect.any(String) });
    expect((await h.call({ action: "set_google", member_id: id, url: google({}, "wrong") })).status).toBe(400);
    expect((await h.call({ action: "set_google", member_id: id, url: null })).status).toBe(200);
    expect(h.writes).toHaveBeenLastCalledWith({ google_wallet_url: null, wallet_updated_at: expect.any(String) });
    expect((await h.call({ action: "remove_apple", member_id: id })).status).toBe(200);
    expect(h.writes).toHaveBeenLastCalledWith({ apple_wallet_path: null, wallet_updated_at: expect.any(String) });
    expect(h.remove).toHaveBeenCalledWith([oldPath]);
  });
});

describe("Wallet input validation", () => {
  it("checks Apple manifest and QR while preserving the externally signed bytes", async () => {
    await expect(validateApplePass(await pass(), qr)).resolves.toBeUndefined();
    await expect(validateApplePass(await pass(qr + "wrong"), qr)).rejects.toThrow("QR");
    await expect(validateApplePass(await pass(qr, true), qr)).rejects.toThrow("incompleto");
    await expect(validateApplePass(new Uint8Array([1, 2, 3]), qr)).rejects.toThrow();
    const zip = new JSZip(); zip.file("pass.json", "{private").file("manifest.json", "{}").file("signature", "x");
    await expect(validateApplePass(await zip.generateAsync({ type: "uint8array" }), qr)).rejects.toThrow("non sono leggibili");
  });
  it("bounds expanded data independently of the compressed size", async () => {
    const zip = new JSZip(); zip.file("pass.json", " ".repeat(300000)).file("manifest.json", "{}").file("signature", "x");
    await expect(validateApplePass(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }), qr)).rejects.toThrow();
  });
  it("accepts signed Google Save URLs only, rejects expired and cross-member barcodes", () => {
    expect(googleWalletUrl(google(), qr)).toBe(google());
    for (const url of ["javascript:alert(1)", "https://evil.invalid/", google().replace("pay.google.com", "pay.google.com.evil.invalid"), google() + "?next=bad", google({ exp: 1 }), google({}, "wrong")]) expect(() => googleWalletUrl(url, qr)).toThrow();
  });
});
