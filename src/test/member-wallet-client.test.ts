import { beforeEach, describe, expect, it, vi } from "vitest";
import { appleWalletDownload, loadMyWallet, uploadAppleWallet, saveGoogleWallet } from "@/lib/member-wallet";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co"); });
describe("Wallet client contract", () => {
  it("never sends a user or member selector when requesting the member’s own Wallet", async () => {
    invoke.mockResolvedValue({ data: { apple_available: false, google_url: null }, error: null });
    expect(await loadMyWallet()).toEqual({ apple_available: false, google_url: null });
    expect(invoke).toHaveBeenCalledWith("member-wallet", { body: { action: "get" } });
  });
  it("accepts only short-lived URLs in the correct private bucket, never a redirect to another origin", async () => {
    const url = "https://project.supabase.co/storage/v1/object/sign/member-wallet-passes/own.pkpass?token=short";
    invoke.mockResolvedValue({ data: { url }, error: null }); expect(await appleWalletDownload()).toBe(url);
    expect(invoke).toHaveBeenCalledWith("member-wallet", { body: { action: "apple" } });
    invoke.mockResolvedValue({ data: { url: "https://foreign.invalid/pass" }, error: null }); await expect(appleWalletDownload()).rejects.toThrow();
  });
  it("uploads FormData for the owner without forcing a JSON content type", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const file = new File(["signed"], "socio.pkpass"); await uploadAppleWallet("member-id", file);
    const body = invoke.mock.calls[0][1].body;
    expect(body).toBeInstanceOf(FormData); expect(body.get("member_id")).toBe("member-id"); expect(body.get("file")).toBe(file);
    expect(invoke.mock.calls[0][1].headers).toBeUndefined();
    await expect(uploadAppleWallet("member-id", new File(["wrong"], "socio.png"))).rejects.toThrow(".pkpass");
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it("clears an empty Google link and rejects unrelated URLs before sending", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await saveGoogleWallet("member-id", "  "); expect(invoke).toHaveBeenCalledWith("member-wallet", { body: { action: "set_google", member_id: "member-id", url: null } });
    await expect(saveGoogleWallet("member-id", "https://evil.invalid/pass")).rejects.toThrow(); expect(invoke).toHaveBeenCalledTimes(1);
  });
  it("uses safe fallback errors for empty service responses", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "private details", context: new Response("{}", { status: 503 }) } });
    await expect(loadMyWallet()).rejects.toThrow("Operazione Wallet non riuscita");
  });
});
