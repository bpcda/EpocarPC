import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChiSiamo from "@/pages/ChiSiamo";
import type { CmsPage } from "@/lib/cms";

const cms = vi.hoisted(() => ({ data: null as CmsPage | null, query: vi.fn() }));
vi.mock("@/hooks/use-cms", () => ({ useCmsPage: (slug: string) => { cms.query(slug); return { data: cms.data }; } }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/PageMeta", () => ({ default: () => null }));
beforeEach(() => { cms.data = null; cms.query.mockClear(); });
afterEach(cleanup);

describe("about page", () => {
  it("keeps a complete page and working navigation when the CMS is empty or unavailable", () => {
    render(<MemoryRouter><ChiSiamo /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Prima le persone. Poi i motori.");
    expect(cms.query).toHaveBeenCalledWith("chi-siamo");
    expect(screen.getByRole("heading", { name: "Ci incontriamo." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ci scambiamo storie." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Facciamo strada." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "La nostra storia" })).toHaveAttribute("href", "#storia");
    expect(screen.getByRole("link", { name: "Vieni al prossimo incontro" })).toHaveAttribute("href", "/eventi");
    expect(screen.getByRole("link", { name: "Conosci l’associazione" })).toHaveAttribute("href", "/associazione");
  });

  it("lets editors change the opening and story through the existing page fields", () => {
    cms.data = {
      title: "Ci vediamo in piazza", slug: "chi-siamo", excerpt: "La nostra community a Piacenza.",
      heroImage: { url: "https://cms.example.invalid/gruppo.jpg", alt: "Il gruppo Epocar" },
      blocks: [
        { kind: "heading-text", title: "Un altro layout", body: [] },
        { kind: "text", body: [{ type: "paragraph", children: [{ type: "text", text: "Il racconto aggiornato dal CMS." }] }] },
      ],
      seo: {},
    };
    render(<MemoryRouter><ChiSiamo /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: cms.data.title })).toBeInTheDocument();
    expect(screen.getByText(cms.data.excerpt!)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Il gruppo Epocar" })).toHaveAttribute("src", cms.data.heroImage!.url);
    expect(screen.getByText("Il racconto aggiornato dal CMS.")).toBeInTheDocument();
    expect(screen.queryByText("Un altro layout")).not.toBeInTheDocument();
    expect(screen.queryByText(/Epocar nasce dall’idea/)).not.toBeInTheDocument();
  });

  it("retains the story and photos when optional CMS fields are missing", () => {
    cms.data = { title: "La nostra storia", slug: "chi-siamo", blocks: [], seo: {} };
    render(<MemoryRouter><ChiSiamo /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: "La nostra storia" })).toBeInTheDocument();
    expect(screen.getByText(/Epocar nasce dall’idea/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Appassionati di diverse generazioni/ })).toBeInTheDocument();
  });
});
