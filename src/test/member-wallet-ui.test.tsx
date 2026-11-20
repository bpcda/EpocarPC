import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MemberWallet from "@/components/MemberWallet";
import WalletCardEditor from "@/components/WalletCardEditor";
import type { ManagedMemberCard } from "@/lib/member-card-management";

const api = vi.hoisted(() => ({ loadMyWallet: vi.fn(), appleWalletDownload: vi.fn(), uploadAppleWallet: vi.fn(), removeAppleWallet: vi.fn(), saveGoogleWallet: vi.fn() }));
vi.mock("@/lib/member-wallet", () => api);
const card: ManagedMemberCard = { id: "10000000-0000-4000-8000-000000000001", full_name: "Socio sintetico", category: "Ordinario", card_number: 12, issued_at: "2026-11-20T10:00:00Z", status: "valid", svg: "<svg/>", url: "https://epocarpc.com/verifica-tessera#v2." + "a".repeat(64), apple_wallet_available: true, google_wallet_url: null };
beforeEach(() => { vi.clearAllMocks(); api.loadMyWallet.mockResolvedValue({ apple_available: false, google_url: null }); api.appleWalletDownload.mockRejectedValue(new Error("private backend error")); api.uploadAppleWallet.mockResolvedValue(undefined); api.saveGoogleWallet.mockResolvedValue(undefined); });
afterEach(cleanup);
function show(user = "own-user") { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemberWallet userId={user} /></QueryClientProvider>); }

describe("member Wallet buttons", () => {
  it("shows a pending message with no fake/disabled badges before upload", async () => {
    show(); expect(await screen.findByText(/La tessera è in preparazione/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument(); expect(api.appleWalletDownload).not.toHaveBeenCalled();
  });
  it("uses original provider badges and fetches a fresh Apple URL only on each click", async () => {
    api.loadMyWallet.mockResolvedValue({ apple_available: true, google_url: "https://pay.google.com/gp/v/save/test" });
    show(); const apple = await screen.findByRole("button", { name: "Aggiungi a Apple Wallet" });
    expect(screen.getByRole("img", { name: "Aggiungi a Apple Wallet" })).toHaveAttribute("src", expect.stringContaining("apple-wallet-it.svg"));
    expect(screen.getByRole("link", { name: "Aggiungi a Google Wallet" })).toHaveAttribute("href", "https://pay.google.com/gp/v/save/test");
    expect(api.appleWalletDownload).not.toHaveBeenCalled();
    fireEvent.click(apple); await screen.findByRole("alert"); expect(api.appleWalletDownload).toHaveBeenCalledTimes(1);
    fireEvent.click(apple); await waitFor(() => expect(api.appleWalletDownload).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("private backend error")).not.toBeInTheDocument();
  });
  it("does not reuse a previous user’s Wallet response after unmount", async () => {
    api.loadMyWallet.mockResolvedValueOnce({ apple_available: true, google_url: null }).mockResolvedValueOnce({ apple_available: false, google_url: null });
    show("first-user"); await screen.findByRole("button", { name: "Aggiungi a Apple Wallet" }); cleanup();
    show("second-user"); await screen.findByText(/La tessera è in preparazione/); expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
  it("allows recovery after an unavailable backend without showing badges", async () => {
    api.loadMyWallet.mockRejectedValueOnce(new Error("private")); show(); await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Riprova" })); await screen.findByText(/La tessera è in preparazione/);
  });
});

describe("owner Wallet editor", () => {
  it("uploads the file for the selected member and reloads its availability", async () => {
    const saved = vi.fn(async () => undefined); render(<WalletCardEditor card={card} onSaved={saved} />);
    const file = new File(["signed pass"], "socio.pkpass");
    fireEvent.change(screen.getByLabelText(/Apple Wallet · file/), { target: { files: [file] } });
    expect(await screen.findByText(/Tessera Apple caricata/)).toBeInTheDocument(); expect(api.uploadAppleWallet).toHaveBeenCalledWith(card.id, file); expect(saved).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText(/Google Wallet · link/), { target: { value: "https://pay.google.com/gp/v/save/synthetic" } });
    fireEvent.submit(screen.getByRole("button", { name: "Salva link Google" }).closest("form")!);
    await screen.findByText(/Link Google salvato/); expect(api.saveGoogleWallet).toHaveBeenCalledWith(card.id, "https://pay.google.com/gp/v/save/synthetic");
  });
  it("reports a failed upload without announcing a save or clearing the previous file", async () => {
    api.uploadAppleWallet.mockRejectedValue(new Error("Il QR non corrisponde al socio selezionato."));
    const saved = vi.fn(async () => undefined); render(<WalletCardEditor card={card} onSaved={saved} />);
    fireEvent.change(screen.getByLabelText(/Apple Wallet · file/), { target: { files: [new File(["bad"], "socio.pkpass")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("QR non corrisponde"); expect(saved).not.toHaveBeenCalled();
    expect(screen.getByText(/File Apple disponibile/)).toBeInTheDocument();
  });
});
