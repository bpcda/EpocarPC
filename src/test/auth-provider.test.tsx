import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/hooks/use-auth";
import ProtectedRoute from "@/components/ProtectedRoute";

const service = vi.hoisted(() => ({ session: vi.fn(), roles: vi.fn(), subscribe: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: service.session, onAuthStateChange: service.subscribe },
  from: () => ({ select: () => ({ eq: service.roles }) }),
} }));
beforeEach(() => { vi.clearAllMocks(); service.subscribe.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }); });
afterEach(cleanup);
function show() {
  return render(<MemoryRouter initialEntries={["/admin/eventi/nuovo"]}><AuthProvider><Routes>
    <Route path="/admin/eventi/nuovo" element={<ProtectedRoute adminOnly><p>Editor evento</p></ProtectedRoute>} />
    <Route path="/admin/login" element={<p>Accesso richiesto</p>} />
  </Routes></AuthProvider></MemoryRouter>);
}
describe("cold loading protected dashboard links", () => {
  it("waits for both the stored session and its roles before opening an admin editor", async () => {
    let sessionReady!: (value: unknown) => void;
    let rolesReady!: (value: unknown) => void;
    service.session.mockReturnValue(new Promise(resolve => { sessionReady = resolve; }));
    service.roles.mockReturnValue(new Promise(resolve => { rolesReady = resolve; }));
    show();
    expect(screen.getByText("Caricamento...")).toBeInTheDocument();
    expect(screen.queryByText("Accesso richiesto")).not.toBeInTheDocument();
    await act(async () => { sessionReady({ data: { session: { user: { id: "editor" } } } }); });
    expect(screen.getByText("Caricamento...")).toBeInTheDocument();
    await act(async () => { rolesReady({ data: [{ role: "admin" }] }); });
    expect(screen.getByText("Editor evento")).toBeInTheDocument();
    expect(service.roles).toHaveBeenCalledWith("user_id", "editor");
  });
  it("still denies an absent session and staff access to admin-only editors", async () => {
    service.session.mockResolvedValue({ data: { session: null } });
    const first = show();
    expect(await screen.findByText("Accesso richiesto")).toBeInTheDocument();
    expect(service.roles).not.toHaveBeenCalled();
    first.unmount();
    service.session.mockResolvedValue({ data: { session: { user: { id: "staff" } } } });
    service.roles.mockResolvedValue({ data: [{ role: "staff" }] });
    show();
    expect(await screen.findByText("Accesso richiesto")).toBeInTheDocument();
    expect(screen.queryByText("Editor evento")).not.toBeInTheDocument();
  });
  it.each(["empty", "rejected"])("keeps a live sign-in when the older initial session lookup is %s", async outcome => {
    let sessionReady!: (value: unknown) => void;
    let sessionFailed!: (error: Error) => void;
    service.session.mockReturnValue(new Promise((resolve, reject) => { sessionReady = resolve; sessionFailed = reject; }));
    service.roles.mockResolvedValue({ data: [{ role: "admin" }] });
    show();
    const changed = service.subscribe.mock.calls[0][0];
    await act(async () => { changed("SIGNED_IN", { user: { id: "editor" } }); });
    expect(await screen.findByText("Editor evento")).toBeInTheDocument();
    await act(async () => {
      if (outcome === "empty") sessionReady({ data: { session: null } });
      else sessionFailed(new Error("older bootstrap lookup failed"));
    });
    expect(screen.getByText("Editor evento")).toBeInTheDocument();
    expect(screen.queryByText("Accesso richiesto")).not.toBeInTheDocument();
  });
  it("does not resurrect an old stored user after a newer sign-out event", async () => {
    let sessionReady!: (value: unknown) => void;
    service.session.mockReturnValue(new Promise(resolve => { sessionReady = resolve; }));
    service.roles.mockResolvedValue({ data: [{ role: "admin" }] });
    show();
    const changed = service.subscribe.mock.calls[0][0];
    await act(async () => { changed("SIGNED_OUT", null); });
    await act(async () => { sessionReady({ data: { session: { user: { id: "editor" } } } }); });
    expect(await screen.findByText("Accesso richiesto")).toBeInTheDocument();
    expect(screen.queryByText("Editor evento")).not.toBeInTheDocument();
  });
  it("ignores an initial-session notification delivered after a newer sign-in", async () => {
    service.session.mockReturnValue(new Promise(() => {}));
    service.roles.mockResolvedValue({ data: [{ role: "admin" }] });
    show();
    const changed = service.subscribe.mock.calls[0][0];
    await act(async () => { changed("SIGNED_IN", { user: { id: "editor" } }); });
    expect(await screen.findByText("Editor evento")).toBeInTheDocument();
    await act(async () => { changed("INITIAL_SESSION", null); });
    expect(screen.getByText("Editor evento")).toBeInTheDocument();
  });
});
