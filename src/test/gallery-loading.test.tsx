import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Gallery from "@/pages/Gallery";

vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/PageMeta", () => ({ default: () => null }));

const photo = (id: number) => ({ id: String(id), image_url: `https://images.example.invalid/${id}.jpg`, alt_text: `Foto ${id}`, sort_order: id });
const page = (start: number) => Array.from({ length: 20 }, (_, index) => photo(start + index));
const response = (images: ReturnType<typeof page>) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ images }) });
let request: ReturnType<typeof vi.fn>;
let intersect: (() => void) | undefined;
beforeEach(() => {
  sessionStorage.clear(); intersect = undefined;
  request = vi.fn(); vi.stubGlobal("fetch", request);
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) { intersect = () => callback([{ isIntersecting: true }]); }
    observe() {} disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); });
const show = () => render(<MemoryRouter><Gallery /></MemoryRouter>);

describe("gallery loading and recovery", () => {
  it("distinguishes a failed request from an empty gallery and retries the same first page", async () => {
    request.mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce(response([photo(1)]));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riusciamo a caricare le foto");
    expect(screen.queryByText(/Non ci sono ancora foto/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("button", { name: "Foto 1" }, { timeout: 2000 })).toBeInTheDocument();
    expect(request.mock.calls.map(call => call[0])).toEqual([expect.stringContaining("from=0&to=19"), expect.stringContaining("from=0&to=19")]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("retains loaded photos and never skips a failed later page", async () => {
    request.mockResolvedValueOnce(response(page(0))).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(response(page(20)));
    show();
    await screen.findByRole("button", { name: "Foto 0" });
    await waitFor(() => expect(intersect).toBeTypeOf("function"));
    act(() => intersect!());
    await screen.findByRole("alert", {}, { timeout: 2000 });
    expect(screen.getAllByRole("img")).toHaveLength(20);
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    await screen.findByRole("button", { name: "Foto 39" }, { timeout: 2000 });
    expect(request.mock.calls.map(call => call[0])).toEqual([expect.stringContaining("from=0&to=19"), expect.stringContaining("from=20&to=39"), expect.stringContaining("from=20&to=39")]);
    expect(screen.getAllByRole("img")).toHaveLength(40);
  });
  it("reuses cached photos on failure and revalidates them without duplicating the page", async () => {
    sessionStorage.setItem("epocar:gallery:v2", JSON.stringify({ 1: { images: page(20), hasMore: true, etag: "saved", ts: 0 } }));
    request.mockResolvedValueOnce(response(page(0))).mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce(response(page(20)));
    show();
    await screen.findByRole("button", { name: "Foto 0" });
    await waitFor(() => expect(intersect).toBeTypeOf("function"));
    act(() => intersect!());
    expect(await screen.findByRole("alert", {}, { timeout: 2000 })).toHaveTextContent("copia salvata");
    expect(screen.getAllByRole("img")).toHaveLength(40);
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getAllByRole("img")).toHaveLength(40);
  });
  it("only shows an empty state after a successful empty response", async () => {
    request.mockResolvedValue(response([])); show();
    expect(await screen.findByText(/Non ci sono ancora foto/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
