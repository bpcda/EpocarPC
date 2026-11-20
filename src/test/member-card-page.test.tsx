import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VerificaTessera from "@/pages/VerificaTessera";

const verify = vi.hoisted(() => vi.fn());
vi.mock("@/lib/member-card", () => ({ verifyMemberCard: verify }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/PageMeta", () => ({ default: () => null }));
vi.mock("react-helmet-async", () => ({ Helmet: () => null }));
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());
const show = (hash = "#signed-qr") => render(<MemoryRouter initialEntries={["/verifica-tessera" + hash]}><VerificaTessera /></MemoryRouter>);

describe("card verification page", () => {
  it("does not ask for a login or query the service without a personal QR", () => {
    show("");
    expect(screen.getByText(/Scansiona il QR personale/)).toBeInTheDocument();
    expect(verify).not.toHaveBeenCalled();
  });
  it("verifies a scanned QR and lets the reader refresh the current result", async () => {
    verify.mockResolvedValueOnce({ status: "valid", card_number: 12, valid_until: "2027-02-28", checked_at: "2026-11-20T10:00:00Z" }).mockResolvedValueOnce({ status: "invalid", card_number: 12 });
    show();
    expect(await screen.findByRole("heading", { name: "Tessera valida" })).toBeInTheDocument();
    expect(verify).toHaveBeenCalledWith("signed-qr");
    expect(screen.getByText("Tessera n. 12")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna verifica" }));
    expect(await screen.findByRole("heading", { name: "Tessera non valida" })).toBeInTheDocument();
    expect(screen.queryByText(/Validità verificabile fino/)).not.toBeInTheDocument();
  });
  it("distinguishes unknown validity from an invalid membership and never records a visit", async () => {
    verify.mockResolvedValue({ status: "unavailable" });
    show();
    expect(await screen.findByRole("heading", { name: "Verifica non disponibile" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Tessera non valida" })).not.toBeInTheDocument();
    expect(screen.getByText(/non registra una visita/)).toBeInTheDocument();
  });
});
