import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Auth from "@/pages/Auth";
import { authReturnPath } from "@/lib/auth-navigation";

const service = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn(), oauth: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signInWithPassword: service.signIn, signUp: service.signUp, signInWithOAuth: service.oauth } } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("sonner", () => ({ toast: { success: service.success, error: service.error } }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/PageMeta", () => ({ default: () => null }));
beforeEach(() => {
  vi.clearAllMocks();
  service.signIn.mockResolvedValue({ error: null });
  service.signUp.mockResolvedValue({ data: { session: null }, error: null });
});
afterEach(cleanup);

function show(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/auth" element={<Auth />} />
    <Route path="/associazione/iscrizione" element={<p>Domanda di ammissione</p>} />
    <Route path="/account" element={<p>Area personale</p>} />
  </Routes></MemoryRouter>);
}
function fill() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "test@example.invalid" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-password" } });
}

describe("authentication UI with a simulated service", () => {
  it("opens registration directly and waits for email confirmation when there is no session", async () => {
    show("/auth?mode=signup&next=%2Fassociazione%2Fiscrizione");
    expect(screen.getByRole("heading", { name: "REGISTRATI" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nome")).toHaveAttribute("autocomplete", "given-name");
    expect(screen.getByLabelText("Cognome")).toHaveAttribute("autocomplete", "family-name");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
    fill();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText("Cognome"), { target: { value: "Sintetico" } });
    fireEvent.submit(screen.getByRole("button", { name: "CREA ACCOUNT" }).closest("form")!);
    await waitFor(() => expect(service.signUp).toHaveBeenCalledWith(expect.objectContaining({ options: { emailRedirectTo: `${window.location.origin}/associazione/iscrizione`, data: { first_name: "Test", last_name: "Sintetico" } } })));
    expect(service.signIn).not.toHaveBeenCalled();
    expect(service.success).toHaveBeenCalledWith(expect.stringContaining("confermare"));
    expect(screen.getByRole("heading", { name: "REGISTRATI" })).toBeInTheDocument();
  });

  it("returns to the requested internal page after sign-in", async () => {
    show("/auth?next=%2Fassociazione%2Fiscrizione");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    fill();
    fireEvent.submit(screen.getByRole("button", { name: "ACCEDI" }).closest("form")!);
    expect(await screen.findByText("Domanda di ammissione")).toBeInTheDocument();
  });

  it("locks the form and mode toggle while a request is pending", async () => {
    let finish = () => {};
    service.signIn.mockImplementation(() => new Promise(resolve => { finish = () => resolve({ error: null }); }));
    show("/auth"); fill();
    fireEvent.submit(screen.getByRole("button", { name: "ACCEDI" }).closest("form")!);
    expect(screen.getByRole("button", { name: "Registrati" })).toBeDisabled();
    expect(screen.getByLabelText("Password")).toBeDisabled();
    await act(async () => finish());
    expect(await screen.findByText("Area personale")).toBeInTheDocument();
  });

  it("shows safe fallback errors and restores the controls", async () => {
    service.signIn.mockResolvedValue({ error: { status: 503, request: { secret: "never-display" } } });
    show("/auth"); fill();
    fireEvent.submit(screen.getByRole("button", { name: "ACCEDI" }).closest("form")!);
    await waitFor(() => expect(service.error).toHaveBeenCalled());
    expect(service.error.mock.calls[0][0]).toContain("HTTP 503");
    expect(service.error.mock.calls[0][0]).not.toContain("never-display");
    expect(screen.getByLabelText("Password")).toBeEnabled();
  });
});

describe("authentication return paths", () => {
  it("preserves local paths, queries and anchors", () => {
    expect(authReturnPath("/eventi/test/iscrizione?claim=example#riepilogo")).toBe("/eventi/test/iscrizione?claim=example#riepilogo");
  });
  it("rejects external, malformed and non-path destinations", () => {
    for (const value of [null, "", "https://example.org", "//example.org", "/\\example.org", "javascript:alert(1)", "account"]) expect(authReturnPath(value)).toBe("/account");
  });
});
