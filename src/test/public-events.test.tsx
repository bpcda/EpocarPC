import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProssimoEventoSection from "@/components/ProssimoEventoSection";
import EventiPage from "@/pages/Eventi";

const state = vi.hoisted(() => ({ rows: [{ id: "event", title: "Il prossimo incontro", date: "2099-11-22T09:00:00Z", end_date: null, location: "Via Maculani, Piacenza", published: true, show_homepage_countdown: false, image_url: null, description: "Una giornata insieme", registration_link: null, registration_enabled: false }], error: null as { message: string } | null, from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: state.from } }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/PageMeta", () => ({ default: () => null }));
const event = { ...state.rows[0] };

beforeEach(() => {
  state.rows = [{ ...event }];
  state.error = null;
  state.from.mockImplementation(() => {
    const query = { select: () => query, eq: () => query, or: () => query, order: async () => ({ data: state.rows, error: state.error }) };
    return query;
  });
});
afterEach(cleanup);
function show(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: 0 } } });
  return render(<HelmetProvider><QueryClientProvider client={client}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider></HelmetProvider>);
}

describe("public events", () => {
  it("features the eligible flagged event once, linking to its exact calendar entry", async () => {
    state.rows = [{ ...event, id: "earlier", date: "2099-11-21T09:00:00Z" }, { ...event, id: "flagged", show_homepage_countdown: true }];
    show(<ProssimoEventoSection />);
    expect(await screen.findByRole("link", { name: "Scopri l’evento" })).toHaveAttribute("href", "/eventi#evento-flagged");
    expect(screen.getAllByRole("heading", { name: event.title })).toHaveLength(1);
    expect(screen.getByText("Mancano")).toBeInTheDocument();
  });

  it("ignores ended countdowns and respects an unflagged next event", async () => {
    state.rows = [{ ...event, id: "ended", date: "2020-01-01T10:00:00Z", show_homepage_countdown: true }, { ...event, id: "next" }];
    show(<ProssimoEventoSection />);
    expect(await screen.findByRole("link", { name: "Scopri l’evento" })).toHaveAttribute("href", "/eventi#evento-next");
    expect(screen.queryByText("Mancano")).not.toBeInTheDocument();
  });

  it("shows an honest empty state instead of a dated demo event", async () => {
    state.rows = [];
    show(<ProssimoEventoSection />);
    expect(await screen.findByText(/Stiamo preparando il prossimo raduno/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Scopri l’evento" })).not.toBeInTheDocument();
  });

  it("keeps past-event descriptions collapsed and adds a map link", async () => {
    state.rows = [{ ...event, date: "2020-01-01T10:00:00Z" }];
    show(<EventiPage />);
    const summary = await screen.findByText("Leggi il racconto");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("link", { name: /Apri la mappa/ })).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=Via%20Maculani%2C%20Piacenza");
    expect(screen.queryByRole("link", { name: /Iscriviti/ })).not.toBeInTheDocument();
  });
});
