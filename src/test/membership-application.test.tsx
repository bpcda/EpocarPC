import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { applicantPayload, electronicPayload, emptyForm, formFromRow, personalStep, declarationsStep, stepErrors, type ApplicationForm } from "@/lib/association";

const full: ApplicationForm = { ...emptyForm(), first_name: "Mario", last_name: "Rossi", birth_date: "1980-05-01", birth_place: "Piacenza", tax_code: "rssmra80e01g535x", email: "m@example.org", phone: "+39 333 1234567", address: "Via Roma 1", postal_code: "29121", city: "Piacenza", province: "pc", requested_category: "Ordinario", statute_accepted_at: true, regulation_accepted_at: true, admission_requested_at: true, rules_commitment_at: true, privacy_accepted_at: true };

describe("domanda di ammissione", () => {
  it("valida i campi con errori per campo", () => {
    const e = stepErrors(personalStep, { ...full, email: "x", tax_code: "123", postal_code: "12", birth_date: "2999-01-01" });
    expect(Object.keys(e).sort()).toEqual(["birth_date", "email", "postal_code", "tax_code"]);
    expect(stepErrors(personalStep, full)).toEqual({});
  });
  it("richiede ogni dichiarazione obbligatoria separatamente", () => {
    const e = stepErrors(declarationsStep, { ...full, privacy_accepted_at: false });
    expect(Object.keys(e)).toEqual(["privacy_accepted_at"]);
  });
  it("la bozza si salva anche incompleta e scarta i formati non validi", () => {
    const p = electronicPayload({ ...emptyForm(), first_name: "Mar", tax_code: "ABC" }, "draft");
    expect(p.status).toBe("draft"); expect(p.tax_code).toBeNull(); expect(p.first_name).toBe("Mar");
  });
  it("riprendendo la bozza i dati tornano nel modulo", () => {
    const p = electronicPayload(full, "draft");
    const back = formFromRow(p, emptyForm());
    expect(back.first_name).toBe("Mario"); expect(back.privacy_accepted_at).toBe(true); expect(back.communications_consent_at).toBe(false);
  });
  it("il browser non può inviare stati o campi della Tesoreria", () => {
    expect(() => applicantPayload({ status: "approved" })).toThrow();
    const out = applicantPayload({ ...electronicPayload(full, "submitted"), treasury_member_id: "x", approved_at: "x", submitted_at: "x", card_number: 1 });
    expect(out).not.toHaveProperty("treasury_member_id"); expect(out).not.toHaveProperty("approved_at"); expect(out).not.toHaveProperty("submitted_at"); expect(out).not.toHaveProperty("card_number");
    expect(out.status).toBe("submitted"); expect(out.tax_code).toBe("RSSMRA80E01G535X");
  });
  it("conserva la data di accettazione originale delle dichiarazioni", () => {
    const p = electronicPayload(full, "submitted", { statute_accepted_at: "2026-10-01T00:00:00Z" });
    expect(p.statute_accepted_at).toBe("2026-10-01T00:00:00Z");
  });
});

const state = vi.hoisted(() => ({ data: { application: null as unknown, member: null as unknown } }));
vi.mock("@/lib/association", async (orig) => ({ ...(await orig<typeof import("@/lib/association")>()), loadMyMembership: async () => state.data }));
afterEach(cleanup);
async function area() {
  const { default: MemberArea } = await import("@/components/MemberArea");
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><MemberArea userId="u" /></MemoryRouter></QueryClientProvider>);
}
const app = (status: string) => ({ id: "11111111-1111-4111-8111-111111111111", user_id: "22222222-2222-4222-8222-222222222222", full_name: "M", email: "m@x.it", file_path: null, filename: null, created_at: "2026-10-01T00:00:00Z", submitted_at: "2026-10-01T00:00:00Z", status, public_status_message: status === "rejected" ? "Motivo comunicato" : null });
describe("Area Socio", () => {
  it("nessuna domanda → CTA", async () => { state.data = { application: null, member: null }; await area(); expect(await screen.findByRole("link", { name: "Presenta domanda di ammissione" })).toBeInTheDocument(); });
  it("bozza → continua", async () => { state.data = { application: app("draft"), member: null }; await area(); expect(await screen.findByRole("link", { name: "Continua la domanda" })).toBeInTheDocument(); });
  it("inviata, in valutazione, respinta", async () => {
    state.data = { application: app("submitted"), member: null }; await area(); expect(await screen.findByText("Domanda ricevuta")).toBeInTheDocument(); cleanup();
    state.data = { application: app("review"), member: null }; await area(); expect(await screen.findByText("In valutazione")).toBeInTheDocument(); cleanup();
    state.data = { application: app("rejected"), member: null }; await area(); expect(await screen.findByText("Domanda respinta")).toBeInTheDocument(); expect(screen.getByText("Motivo comunicato")).toBeInTheDocument();
  });
  it("approvata senza tessera", async () => { state.data = { application: app("approved"), member: null }; await area(); expect(await screen.findByText("Tessera non ancora assegnata")).toBeInTheDocument(); });
});
