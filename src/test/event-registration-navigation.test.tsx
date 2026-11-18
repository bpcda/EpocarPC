import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import EventRegistrationForm from "@/components/EventRegistrationForm";

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
afterEach(cleanup);
const id = "11111111-1111-4111-8111-111111111111";
const target = `/auth?next=${encodeURIComponent(`/eventi/${id}/iscrizione`)}`;

describe("event sign-in navigation", () => {
  it("returns to the event after required sign-in", () => {
    render(<MemoryRouter><EventRegistrationForm eventId={id} allowGuests={false} fields={[]} /></MemoryRouter>);
    const link = screen.getByRole("link", { name: "ACCEDI / REGISTRATI" });
    expect(link).toHaveAttribute("href", target);
    expect(link.querySelector("button")).toBeNull();
  });

  it("retains the event when signing in to upload a file and labels the guest contact fields", () => {
    render(<MemoryRouter><EventRegistrationForm eventId={id} allowGuests fields={[{ id: "file", label: "Documento", type: "file_upload", required: false }]} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "accedi al tuo account" })).toHaveAttribute("href", target);
    expect(screen.getByRole("textbox", { name: "Nome e cognome" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute("autocomplete", "email");
  });
});
