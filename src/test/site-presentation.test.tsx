import { readFileSync } from "node:fs";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PageMeta from "@/components/PageMeta";
import Footer from "@/components/Footer";

vi.mock("@/hooks/use-cms", () => ({ useSiteSettings: () => ({ data: { email: "info@example.invalid", phone: "+39 333 1234567", social: [] } }) }));
beforeEach(() => { document.head.innerHTML = ""; });
afterEach(cleanup);

describe("public presentation", () => {
  it("replaces static metadata without duplicate descriptions or social titles", async () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).not.toContain("lovable.app");
    const initial = new DOMParser().parseFromString(html, "text/html");
    for (const meta of initial.querySelectorAll("meta[data-rh]")) document.head.appendChild(meta.cloneNode(true));
    render(<HelmetProvider><PageMeta title="News — Epocar" description="Notizie dalla community" path="/news" /></HelmetProvider>);
    await waitFor(() => expect(document.querySelector("meta[property='og:title']")).toHaveAttribute("content", "News — Epocar"));
    expect(document.querySelectorAll("meta[name='description']")).toHaveLength(1);
    expect(document.querySelectorAll("meta[property='og:title']")).toHaveLength(1);
    expect(document.querySelectorAll("meta[name='twitter:title']")).toHaveLength(1);
    expect(document.querySelector("link[rel='canonical']")).toHaveAttribute("href", "https://epocarpc.com/news");
    expect(document.querySelector("meta[property='og:image']")).toHaveAttribute("content", "https://epocarpc.com/epocar-social.jpg");
    expect(document.querySelector("meta[name='twitter:image']")).toHaveAttribute("content", "https://epocarpc.com/epocar-social.jpg");
  });

  it("uses a news cover consistently for both social previews", async () => {
    render(<HelmetProvider><PageMeta title="Un raduno" description="Il racconto" path="/news/raduno" image="https://images.example.invalid/cover.jpg" /></HelmetProvider>);
    await waitFor(() => expect(document.querySelector("meta[property='og:image']")).toHaveAttribute("content", "https://images.example.invalid/cover.jpg"));
    expect(document.querySelector("meta[name='twitter:image']")).toHaveAttribute("content", "https://images.example.invalid/cover.jpg");
  });

  it("makes the configured footer contacts actionable", () => {
    render(<MemoryRouter><Footer /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "info@example.invalid" })).toHaveAttribute("href", "mailto:info@example.invalid");
    expect(screen.getByRole("link", { name: "+39 333 1234567" })).toHaveAttribute("href", "tel:+39 333 1234567");
  });
});
