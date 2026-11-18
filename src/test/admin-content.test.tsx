import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminArticleEditor from "@/pages/AdminArticleEditor";
import AdminEventEditor from "@/pages/AdminEventEditor";

const service = vi.hoisted(() => ({
  admin: true, staff: false, treasurer: false, installed: true, failSave: false, failLoad: false,
  from: vi.fn(), write: vi.fn(),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "admin", email: "editor@example.invalid" }, isAdmin: service.admin, isStaff: service.staff, isTreasurer: service.treasurer, signOut: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: service.from } }));
vi.mock("@/components/RichTextEditor", () => ({ default: ({ content, onChange, label = "Contenuto", disabled }: { content: string; onChange: (v: string) => void; label?: string; disabled?: boolean }) => <textarea aria-label={label} disabled={disabled} value={content} onChange={e => onChange(e.target.value)} /> }));
vi.mock("@/components/AddressAutocomplete", () => ({ default: () => <input aria-label="Luogo" /> }));
vi.mock("@/components/admin/GalleryTab", () => ({ default: () => <p>Gestione immagini</p> }));
vi.mock("@/components/admin/RegistrationsTab", () => ({ default: () => <p>Partecipanti</p> }));
vi.mock("@/components/admin/UsersTab", () => ({ default: () => <p>Gestione account</p> }));
vi.mock("@/components/admin/RoleAuditTab", () => ({ default: () => <p>Registro ruoli</p> }));
vi.mock("@/components/admin/AssociationTab", () => ({ default: () => <p>Associazione</p> }));

const events = [{ id: "event", title: "Raduno in piazza", description: "Ritrovo alle 9\nPartenza alle 10", date: "2026-11-22T09:00:00Z", location: "Piacenza", published: false, created_at: "2026-11-01T09:00:00Z" }];
const articles = [
  { id: "draft", title: "Storia da finire", published: false, published_at: null, created_at: "2020-01-01T09:00:00Z" },
  { id: "scheduled", title: "La prossima uscita", published: true, published_at: "2099-11-20T09:00:00Z", created_at: "2026-11-01T09:00:00Z" },
  { id: "published", title: "Il racconto del raduno", published: true, published_at: "2026-11-10T09:00:00Z", created_at: "2026-11-01T09:00:00Z" },
];
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  service.admin = true; service.staff = false; service.treasurer = false;
  service.installed = true; service.failSave = false; service.failLoad = false;
  service.from.mockImplementation((table: string) => {
    let mutation = false;
    let wantedId = "";
    const query = {
      select: () => query,
      eq: (field: string, value: string) => { if (field === "id") wantedId = value; return query; },
      limit: async () => ({ data: [], error: service.installed ? null : { code: "42703" } }),
      order: async () => ({ data: table === "events" ? events : articles, error: service.failLoad ? { message: "private database detail" } : null }),
      maybeSingle: async () => ({ data: table === "events" ? events[0] : articles.find(row => row.id === wantedId), error: service.failLoad ? { message: "private database detail" } : null }),
      insert: (payload: unknown) => { mutation = true; service.write(table, payload); return query; },
      update: (payload: unknown) => { mutation = true; service.write(table, payload); return query; },
      delete: () => { mutation = true; service.write(table, { delete: true }); return query; },
      single: async () => ({ data: service.failSave ? null : { id: mutation ? "saved" : wantedId }, error: service.failSave ? { message: "private backend detail" } : null }),
    };
    return query;
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

function show(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/admin" element={<AdminDashboard />} />
    <Route path="/admin/articoli/:id" element={<AdminArticleEditor />} />
    <Route path="/admin/eventi/:id" element={<AdminEventEditor />} />
  </Routes></MemoryRouter></QueryClientProvider>);
}
async function choose(label: string, option: string) {
  const trigger = screen.getByRole("combobox", { name: label });
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

describe("mobile-first content dashboard", () => {
  it("opens the correct section after editing and searches/filter statuses including scheduled news", async () => {
    show("/admin?tab=articles");
    expect(await screen.findByRole("heading", { name: "La prossima uscita" })).toBeInTheDocument();
    expect(screen.getByText("Programmata")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "News" })).toHaveAttribute("aria-selected", "true");
    await choose("Filtra per stato", "Programmati");
    expect(screen.queryByRole("heading", { name: "Storia da finire" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "La prossima uscita" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "inesistente" } });
    expect(screen.getByRole("heading", { name: "Nessun risultato" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Azzera ricerca e filtri" }));
    expect(screen.getByRole("heading", { name: "Storia da finire" })).toBeInTheDocument();
  });
  it("keeps staff content read-only and hides admin-only account sections", async () => {
    service.admin = false; service.staff = true;
    show("/admin");
    await screen.findByRole("heading", { name: events[0].title });
    expect(screen.queryByRole("button", { name: "Nuovo evento" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Modifica/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Elimina/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Utenti" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Storico ruoli" })).not.toBeInTheDocument();
  });
  it("does not read editorial data or expose treasury links to a treasury-only user", () => {
    service.admin = false; service.treasurer = true;
    show("/admin");
    expect(screen.getByRole("status")).toHaveTextContent("Nessuna funzione disponibile");
    expect(service.from).not.toHaveBeenCalled();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
  it("shows an actionable load failure rather than a false empty-state message", async () => {
    service.failLoad = true;
    show("/admin");
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riusciamo a caricare l’elenco");
    expect(screen.queryByText("private database detail")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Prepariamo il prossimo incontro" })).not.toBeInTheDocument();
  });
  it("requires a specific deletion confirmation and retains the list on a failed delete", async () => {
    show("/admin");
    fireEvent.click(await screen.findByRole("button", { name: `Elimina ${events[0].title}` }));
    expect(service.write).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(service.write).not.toHaveBeenCalled();
    service.failSave = true;
    fireEvent.click(screen.getByRole("button", { name: `Elimina ${events[0].title}` }));
    fireEvent.click(screen.getByRole("button", { name: "Elimina definitivamente" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Non possiamo confermare l’eliminazione");
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(screen.getByRole("heading", { name: events[0].title })).toBeInTheDocument();
  });
});

describe("editorial saves with a simulated service", () => {
  it("keeps programming unavailable until the external database supports it", async () => {
    service.installed = false;
    show("/admin/articoli/nuovo");
    await screen.findByLabelText("Data mostrata nella notizia");
    expect(screen.getByLabelText("Data mostrata nella notizia")).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Quando va online?" }), { key: "ArrowDown" });
    expect(await screen.findByRole("option", { name: "Programma" })).toHaveAttribute("aria-disabled", "true");
    expect(service.write).not.toHaveBeenCalled();
  });
  it("defaults an old draft to the actual first publication day, not its creation date", async () => {
    show("/admin/articoli/draft");
    await screen.findByDisplayValue("Storia da finire");
    await choose("Quando va online?", "Pubblica subito");
    fireEvent.click(screen.getByRole("button", { name: "Salva e pubblica" }));
    await waitFor(() => expect(service.write).toHaveBeenCalledWith("articles", expect.objectContaining({ published: true, published_at: null })));
    expect(service.write.mock.calls[0][1]).not.toHaveProperty("created_at");
    expect(service.write.mock.calls[0][1]).not.toHaveProperty("uploaded_by");
  });
  it("saves immediate backdated news and safely converts a scheduled Italian time", async () => {
    const first = show("/admin/articoli/nuovo");
    await screen.findByLabelText("Titolo *");
    fireEvent.change(screen.getByLabelText("Titolo *"), { target: { value: "Una storia" } });
    await choose("Quando va online?", "Pubblica subito");
    fireEvent.change(screen.getByLabelText("Data mostrata nella notizia"), { target: { value: "2020-11-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva e pubblica" }));
    await waitFor(() => expect(service.write).toHaveBeenCalledWith("articles", expect.objectContaining({ published_at: "2020-11-09T23:00:00.000Z", published: true })));
    first.unmount(); service.write.mockClear(); localStorage.clear();
    show("/admin/articoli/nuovo");
    await screen.findByLabelText("Titolo *");
    fireEvent.change(screen.getByLabelText("Titolo *"), { target: { value: "Un’uscita futura" } });
    await choose("Quando va online?", "Programma");
    fireEvent.change(screen.getByLabelText("Data e ora di uscita (Italia)"), { target: { value: "2099-11-20T09:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva programmazione" }));
    await waitFor(() => expect(service.write).toHaveBeenCalledWith("articles", expect.objectContaining({ published_at: "2099-11-20T08:30:00.000Z", published: true })));
  });
  it("keeps local work and the editor open when a save fails", async () => {
    service.failSave = true;
    show("/admin/articoli/nuovo");
    await screen.findByLabelText("Titolo *");
    fireEvent.change(screen.getByLabelText("Titolo *"), { target: { value: "Da non perdere" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva bozza" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Non possiamo confermare il salvataggio");
    expect(JSON.parse(localStorage.getItem("epocar:draft:article:new")!).title).toBe("Da non perdere");
    expect(screen.getByRole("heading", { name: "Nuova notizia" })).toBeInTheDocument();
    expect(screen.queryByText("private backend detail")).not.toBeInTheDocument();
  });
  it("saves rich event descriptions without changing booking settings or attribution", async () => {
    show("/admin/eventi/event");
    await waitFor(() => expect(screen.getByLabelText("Descrizione evento")).toHaveValue(events[0].description));
    fireEvent.change(screen.getByLabelText("Descrizione evento"), { target: { value: "<h2>Programma</h2><p>Ritrovo <strong>alle 9</strong>.</p>" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva bozza" }));
    await waitFor(() => expect(service.write).toHaveBeenCalledWith("events", expect.objectContaining({ description: "<h2>Programma</h2><p>Ritrovo <strong>alle 9</strong>.</p>", published: false })));
    expect(service.write.mock.calls[0][1]).not.toHaveProperty("booking_settings");
    expect(service.write.mock.calls[0][1]).not.toHaveProperty("uploaded_by");
  });
  it("blocks overwriting an event when its original content cannot be read", async () => {
    service.failLoad = true;
    show("/admin/eventi/event");
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riusciamo a caricare l’evento");
    expect(screen.getByRole("button", { name: "Salva bozza" })).toBeDisabled();
    expect(service.write).not.toHaveBeenCalled();
  });
});
