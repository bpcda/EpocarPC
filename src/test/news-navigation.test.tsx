import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewsList } from "@/pages/News";
import Articoli from "@/pages/Articoli";

const state = vi.hoisted(() => ({
  rows: [{ id: "11111111-1111-4111-8111-111111111111", title: "Un giro insieme", summary: "Il racconto", content: "<h2>La partenza</h2><p>Una giornata speciale.</p>", image_url: null, created_at: "2026-11-18T09:00:00Z", published_at: null as string | null }],
  error: null as { message: string } | null,
  legacy: false,
  eq: vi.fn(),
  or: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: state.from } }));
vi.mock("@/hooks/use-cms", () => ({
  useNewsList: () => ({ data: [{ slug: "dal-cms", title: "Notizia dal CMS", excerpt: "Un incontro", date: "2026-11-17T09:00:00Z" }], isLoading: false, isError: false }),
}));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/PageMeta", () => ({ default: () => null }));

const article = { ...state.rows[0] };
beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [{ ...article }];
  state.error = null;
  state.legacy = false;
  state.from.mockImplementation(() => {
    let withPublication = false;
    const query = {
      select: (columns: string) => { withPublication = columns.includes("published_at"); return query; },
      eq: (column: string, value: unknown) => { state.eq(column, value); return query; },
      or: (filter: string) => { state.or(filter); return query; },
      order: async () => ({ data: state.rows, error: state.legacy && withPublication ? { code: "42703", message: "column not installed" } : state.error }),
    };
    return query;
  });
});
afterEach(cleanup);

function show(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/news" element={<NewsList />} />
    <Route path="/articoli/:id" element={<Articoli />} />
  </Routes></MemoryRouter></QueryClientProvider>);
}

describe("public news navigation", () => {
  it("lists both sources by date with durable detail links and only asks for published articles", async () => {
    show("/news");
    await screen.findByRole("heading", { name: article.title });
    const links = screen.getAllByRole("link");
    expect(links.map(link => link.getAttribute("href"))).toEqual([`/articoli/un-giro-insieme--${article.id}`, "/news/dal-cms"]);
    expect(state.eq).toHaveBeenCalledWith("published", true);
    expect(state.or).toHaveBeenCalledWith(expect.stringMatching(/^published_at.is.null,published_at.lte./));
  });

  it("opens an article directly and after a fresh page load", async () => {
    const first = show(`/articoli/${article.id}`);
    expect(await screen.findByRole("heading", { level: 1, name: article.title })).toBeInTheDocument();
    expect(screen.getByText("Una giornata speciale.")).toBeInTheDocument();
    expect(state.eq).toHaveBeenCalledWith("id", article.id);
    expect(screen.getAllByRole("link", { name: "← Tutte le news" })[0]).toHaveAttribute("href", "/news");
    first.unmount();
    show(`/articoli/${article.id}`);
    expect(await screen.findByRole("heading", { level: 1, name: article.title })).toBeInTheDocument();
  });
  it("opens a descriptive URL and follows links with an older title", async () => {
    const rendered = show(`/articoli/vecchio-titolo--${article.id}`);
    expect(await screen.findByRole("heading", { level: 1, name: article.title })).toBeInTheDocument();
    expect(state.eq).toHaveBeenCalledWith("id", article.id);
    rendered.unmount();
    show(`/articoli/un-giro-insieme--${article.id}`);
    expect(await screen.findByText("Una giornata speciale.")).toBeInTheDocument();
  });

  it("sorts and displays a backdated publication by its selected date rather than draft creation", async () => {
    state.rows = [{ ...article, published_at: "2026-11-10T23:00:00Z" }];
    const list = show("/news");
    await screen.findByRole("heading", { name: article.title });
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/news/dal-cms", `/articoli/un-giro-insieme--${article.id}`]);
    list.unmount();
    show(`/articoli/${article.id}`);
    await screen.findByRole("heading", { name: article.title });
    expect(screen.getByText("11 novembre 2026").tagName).toBe("TIME");
  });

  it("keeps CMS news visible when the archive is unavailable, without showing an empty-state claim", async () => {
    state.error = { message: "private backend detail" };
    show("/news");
    expect(await screen.findByRole("alert")).toHaveTextContent("Alcune notizie non sono disponibili");
    expect(screen.getByRole("heading", { name: "Notizia dal CMS" })).toBeInTheDocument();
    expect(screen.queryByText(/Nessuna notizia pubblicata/)).not.toBeInTheDocument();
    expect(screen.queryByText("private backend detail")).not.toBeInTheDocument();
  });
  it("preserves the existing published archive before the scheduling SQL is installed", async () => {
    state.legacy = true;
    show("/news");
    expect(await screen.findByRole("heading", { name: article.title })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(state.from).toHaveBeenCalledTimes(2);
  });

  it("shows not found for missing or invalid IDs without querying an invalid UUID", async () => {
    state.rows = [];
    const missing = show(`/articoli/${article.id}`);
    expect(await screen.findByText("404")).toBeInTheDocument();
    missing.unmount();
    state.from.mockClear();
    show("/articoli/non-esiste");
    await waitFor(() => expect(screen.getByText("404")).toBeInTheDocument());
    expect(state.from).not.toHaveBeenCalled();
  });
});
