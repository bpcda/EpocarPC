import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Navbar from "@/components/Navbar";
import Gallery from "@/pages/Gallery";
import ScrollToTop from "@/components/ScrollToTop";

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null, canAccessDashboard: false }) }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/PageMeta", () => ({ default: () => null }));
vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe("public accessibility", () => {
  it("marks the current section, including old News links, and updates it after navigation", () => {
    render(<MemoryRouter initialEntries={["/articoli/una-notizia"]}><Navbar /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "News" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const events = screen.getAllByRole("link", { name: "Eventi" });
    fireEvent.click(events[events.length - 1]);
    expect(screen.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: "Eventi" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "News" })).not.toHaveAttribute("aria-current");
  });
  it("exposes the menu state and closes it with Escape, returning focus to the toggle", () => {
    render(<MemoryRouter><Navbar /></MemoryRouter>);
    const menu = screen.getByRole("button", { name: "Menu" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(menu.getAttribute("aria-controls") ?? "")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveFocus();
  });

  it("opens a named gallery dialog with one Italian close control", async () => {
    vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ images: [{ id: "photo", image_url: "https://images.test/auto.jpg", alt_text: "Auto al raduno", sort_order: 0 }] }) }));
    render(<MemoryRouter><Gallery /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Auto al raduno" }));
    const dialog = screen.getByRole("dialog", { name: "Auto al raduno" });
    expect(within(dialog).getAllByRole("button")).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("waits for an asynchronously loaded event before scrolling to its anchor", async () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    const view = render(<MemoryRouter initialEntries={["/eventi#evento-test"]}><ScrollToTop /></MemoryRouter>);
    expect(scroll).not.toHaveBeenCalled();
    const event = document.createElement("article");
    event.id = "evento-test";
    view.container.appendChild(event);
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: "start" }));
    const later = document.createElement("p");
    view.container.appendChild(later);
    await Promise.resolve();
    expect(scroll).toHaveBeenCalledTimes(1);
  });
});
