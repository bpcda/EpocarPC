import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GestioneTessere from "@/pages/GestioneTessere";
import { MEMBER_CARDS_OWNER_ID } from "../../setup/functions/member-card-management/owner";

const state = vi.hoisted(() => ({ id: "", load: vi.fn(), one: vi.fn(), all: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: state.id }, isAdmin: true, isStaff: true }) }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/PageMeta", () => ({ default: () => null }));
vi.mock("@/lib/member-wallet", () => ({ appleWalletDownload: vi.fn(), removeAppleWallet: vi.fn(), saveGoogleWallet: vi.fn(), uploadAppleWallet: vi.fn() }));
vi.mock("@/lib/member-card-management", async () => ({
  MEMBER_CARDS_OWNER_ID: (await import("../../setup/functions/member-card-management/owner")).MEMBER_CARDS_OWNER_ID,
  loadMemberCards: state.load, downloadMemberCard: state.one, downloadAllMemberCards: state.all,
}));
const card = { id: "10000000-0000-4000-8000-000000000001", full_name: "Socio sintetico", category: "Ordinario", card_number: 12, issued_at: "2026-11-20T10:00:00Z", status: "valid", url: "https://epocarpc.com/verifica-tessera#v2." + "a".repeat(64), svg: "<svg></svg>" };
beforeEach(() => { vi.clearAllMocks(); state.id = MEMBER_CARDS_OWNER_ID; state.load.mockResolvedValue([card]); state.one.mockResolvedValue(undefined); state.all.mockResolvedValue(undefined); });
afterEach(cleanup);
function show() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><GestioneTessere /></MemoryRouter></QueryClientProvider>); }

describe("owner-only card management page", () => {
  it("denies other administrators before loading any private cards", () => {
    state.id = "20000000-0000-4000-8000-000000000002";
    show(); expect(screen.getByRole("alert")).toHaveTextContent("riservata al titolare"); expect(state.load).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Scarica tutti (ZIP)" })).not.toBeInTheDocument();
  });
  it("makes existing QR codes visible and downloadable without a manual generation step", async () => {
    show(); expect(await screen.findByRole("heading", { name: card.full_name })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Codice QR tessera n. 12" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Verifica" })).toHaveAttribute("href", card.url);
    fireEvent.click(screen.getByRole("button", { name: "Scarica PNG" }));
    expect(state.one).toHaveBeenCalledWith(card, "png");
    await screen.findByRole("button", { name: "Scarica PNG" });
  });
  it("filters by member/card number and explains an empty list or backend failure safely", async () => {
    show(); await screen.findByRole("heading", { name: card.full_name });
    fireEvent.change(screen.getByLabelText("Cerca per nome o numero tessera"), { target: { value: "99" } });
    expect(screen.getByText("Nessuna tessera corrisponde alla ricerca.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cerca per nome o numero tessera"), { target: { value: "12" } });
    expect(screen.getByRole("heading", { name: card.full_name })).toBeInTheDocument();
    cleanup(); state.load.mockRejectedValue(new Error("private-backend-error")); show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossibile caricare");
    expect(screen.queryByText("private-backend-error")).not.toBeInTheDocument();
  });
});
