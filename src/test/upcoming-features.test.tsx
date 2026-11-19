import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Novita, { futureFeatures, InCostruzione } from "@/pages/Novita";

vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/PageMeta", () => ({ default: () => null }));
afterEach(cleanup);

describe("upcoming public features", () => {
  it("links every preview and prioritizes free accounts without promising a launch date", () => {
    render(<MemoryRouter><Novita /></MemoryRouter>);
    for (const feature of futureFeatures) {
      expect(screen.getByRole("link", { name: feature.title })).toHaveAttribute("href", feature.path);
    }
    expect(screen.getByRole("link", { name: "Crea il tuo account gratuito" })).toHaveAttribute("href", "/auth?mode=signup");
    expect(screen.getByText(/non sono ancora attive e non hanno una data di lancio/)).toBeInTheDocument();
    expect(screen.getByText(/L’account del sito e l’ammissione a socio sono due percorsi distinti/)).toBeInTheDocument();
  });

  it.each(futureFeatures)("opens $path directly with an honest placeholder and usable next steps", (feature) => {
    render(<MemoryRouter initialEntries={[feature.path]}><Routes>
      {futureFeatures.map(item => <Route key={item.path} path={item.path} element={<InCostruzione feature={item} />} />)}
    </Routes></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: feature.title })).toBeInTheDocument();
    expect(screen.getByText("In costruzione")).toBeInTheDocument();
    expect(screen.getByText(/La funzione non è ancora disponibile/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tutte le novità" })).toHaveAttribute("href", "/novita");
    expect(screen.getByRole("link", { name: "Scopri gli eventi" })).toHaveAttribute("href", "/eventi");
    expect(screen.getByRole("link", { name: "Crea il tuo account gratuito" })).toHaveAttribute("href", "/auth?mode=signup");
    expect(screen.getByText(/Registrarsi al sito non equivale a diventare socio/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
