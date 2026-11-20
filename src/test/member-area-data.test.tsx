import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import MemberArea from "@/components/MemberArea";
import type { MemberStatus, Submission } from "@/lib/association";

const fixture = vi.hoisted(() => ({ application: null as Submission | null, member: null as MemberStatus | null, wallet: vi.fn(async () => ({ apple_available: false, google_url: null })) }));
vi.mock("@/lib/member-wallet", () => ({ loadMyWallet: fixture.wallet, appleWalletDownload: vi.fn() }));
vi.mock("@/lib/association", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/association")>(),
  loadMyMembership: async () => ({ ...fixture, roleCategory: "Fondatore", board: ["Presidente"] }),
  loadAssociation: async () => ({ documents: [] }), loadMyRegistrations: async () => [],
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: async () => ({ data: { user: {
  email: "synthetic@example.invalid", user_metadata: { first_name: "Synthetic", last_name: "Person" },
} } }) } } }));
afterEach(() => { cleanup(); fixture.application = null; fixture.member = null; fixture.wallet.mockClear(); });
function mount() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><MemberArea userId="00000000-0000-4000-8000-000000000001" /></MemoryRouter>
  </QueryClientProvider>);
}
describe("MemberArea continues reading existing dashboard data without permission changes", () => {
  it("keeps role-only category holders on the existing dashboard without creating an application", async () => {
    mount();
    await screen.findByRole("heading", { name: "Synthetic Person" });
    expect(fixture.application).toBeNull();
    expect(fixture.member).toBeNull();
    expect(screen.getByRole("link", { name: "Scrivi alla segreteria" })).toBeEnabled();
    expect(fixture.wallet).not.toHaveBeenCalled();
  });
  it.each(["active", "suspended", "ceased"] as const)("does not rewrite the %s projection or its card and fee", async status => {
    const member = { membership_status: status, category: "Fondatore", card_number: 12, admission_date: "2020-01-01",
      membership_year: 2026, fee_status: "paid", updated_at: "2026-10-16T00:00:00Z" } satisfies MemberStatus;
    fixture.member = member;
    mount();
    await screen.findByRole("heading", { name: "Synthetic Person" });
    expect(fixture.member).toEqual(member);
    expect(fixture.application).toBeNull();
    expect(fixture.wallet).not.toHaveBeenCalled();
  });
  it("mounts Wallet downloads only for a confirmed active member", async () => {
    fixture.member = { membership_status: "active", admission_status: "confirmed", admission_source: "board_resolution", category: "Ordinario", card_number: 12, admission_date: "2026-01-01", updated_at: "2026-11-20T00:00:00Z" };
    mount(); await screen.findByText(/La tessera è in preparazione/); expect(fixture.wallet).toHaveBeenCalledTimes(1);
  });
});
