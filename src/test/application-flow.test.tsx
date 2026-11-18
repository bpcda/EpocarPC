import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Adesione from "@/pages/Adesione";
import { DECLARATIONS } from "@/lib/association";

const db = vi.hoisted(() => ({ insert: vi.fn(), readError: false, success: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "22222222-2222-4222-8222-222222222222", email: "test@example.invalid" }, loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "profiles" ? {} : null, error: table === "membership_applications" && db.readError ? { message: "private detail" } : null }) }) }),
  insert: (fields: Record<string, unknown>) => { db.insert(fields); return { select: () => ({ single: async () => ({ data: { id: "11111111-1111-4111-8111-111111111111", file_path: null, filename: null, created_at: "2026-11-18T10:00:00Z", ...fields }, error: null }) }) }; },
}) } }));
vi.mock("@/lib/association", async original => ({ ...(await original<typeof import("@/lib/association")>()), loadAssociation: async () => ({ documents: [] }) }));
vi.mock("sonner", () => ({ toast: { success: db.success, error: vi.fn() } }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/PageMeta", () => ({ default: () => null }));
beforeEach(() => {
  vi.clearAllMocks(); db.readError = false;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function start() {
  render(<MemoryRouter><Adesione /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Presenta domanda di ammissione" }));
}

describe("membership application using synthetic data only", () => {
  it("focuses the first invalid field and does not save on validation failure", async () => {
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    const firstName = screen.getByLabelText("Nome *");
    await waitFor(() => expect(firstName).toHaveFocus());
    expect(firstName).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(firstName.getAttribute("aria-describedby")!)).toBeInTheDocument();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("allows saving an incomplete draft without granting membership", async () => {
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Salva bozza" }));
    await waitFor(() => expect(db.success).toHaveBeenCalled());
    expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ status: "draft", user_id: "22222222-2222-4222-8222-222222222222" }));
    expect(db.insert.mock.calls[0][0]).not.toHaveProperty("approved_at");
    expect(db.insert.mock.calls[0][0]).not.toHaveProperty("card_number");
  });

  it("completes the four steps, keeps optional consent off, and submits only on confirmation", async () => {
    await start();
    for (const [label, value] of [["Nome", "Mario"], ["Cognome", "Rossi"], ["Data di nascita", "1980-05-01"], ["Luogo di nascita", "Piacenza"], ["Codice fiscale", "RSSMRA80E01G535X"], ["Email", "test@example.invalid"], ["Telefono", "3331234567"], ["Indirizzo", "Via Roma 1"], ["CAP", "29121"], ["Comune", "Piacenza"], ["Provincia (sigla)", "PC"]]) fireEvent.change(screen.getByLabelText(`${label} *`), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    fireEvent.click(screen.getByRole("radio", { name: "Ordinario" }));
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    const required = DECLARATIONS.filter(d => d.required);
    await waitFor(() => expect(document.getElementById(`f-${required[0].key}`)).toHaveFocus());
    for (const declaration of required) fireEvent.click(screen.getByRole("checkbox", { name: `${declaration.label} *` }));
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    expect(screen.getByRole("heading", { name: "Riepilogo" })).toBeInTheDocument();
    expect(db.insert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Invia domanda di ammissione" }));
    expect(await screen.findByRole("heading", { name: "Domanda ricevuta" })).toBeInTheDocument();
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.insert.mock.calls[0][0]).toMatchObject({ status: "submitted", communications_consent_at: null, application_kind: "electronic" });
    expect(db.insert.mock.calls[0][0]).not.toHaveProperty("approved_at");
  });

  it("blocks editing when the existing application cannot be read", async () => {
    db.readError = true;
    render(<MemoryRouter><Adesione /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossibile caricare la domanda");
    expect(screen.queryByRole("button", { name: "Presenta domanda di ammissione" })).not.toBeInTheDocument();
    expect(db.insert).not.toHaveBeenCalled();
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  });
});
