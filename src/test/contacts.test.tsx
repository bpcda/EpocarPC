import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ContattiPage from "@/pages/Contatti";
import type { SiteSettings } from "@/lib/cms";

const cms = vi.hoisted(() => ({ data: undefined as SiteSettings | undefined }));
vi.mock("@/hooks/use-cms", () => ({ useSiteSettings: () => cms }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/PageMeta", () => ({ default: () => null }));

beforeEach(() => { cms.data = undefined; });
afterEach(cleanup);

describe("contacts", () => {
  it("prepares the email for each selected topic and keeps a direct fallback address", () => {
    render(<ContattiPage />);
    const compose = screen.getByRole("link", { name: "Scrivici un’email" });
    expect(compose).toHaveAttribute("href", "mailto:epocarpc@gmail.com");
    expect(screen.getByRole("link", { name: "epocarpc@gmail.com" })).toHaveAttribute("href", "mailto:epocarpc@gmail.com");
    expect(screen.getByRole("link", { name: "Instagram" })).toHaveAttribute("href", "https://instagram.com/epocar.official");
    expect(screen.getByRole("link", { name: "TikTok" })).toHaveAttribute("href", "https://tiktok.com/@epocar");

    for (const [title, subject] of [
      ["Collaborazioni", "Proposta di collaborazione"],
      ["Entrare in Epocar", "Informazioni adesione"],
      ["Eventi e raduni", "Informazioni eventi"],
    ]) {
      const link = screen.getByRole("link", { name: new RegExp(`^${title}`) });
      const url = new URL(link.getAttribute("href")!);
      expect(url.protocol).toBe("mailto:");
      expect(url.pathname).toBe("epocarpc@gmail.com");
      expect(url.searchParams.get("subject")).toBe(subject);
      expect(url.searchParams.get("body")).toContain({Collaborazioni: "collaborazione", "Entrare in Epocar": "quota associativa", "Eventi e raduni": "raduno"}[title]);
    }
  });

  it("uses published site settings for both email links and social links", () => {
    cms.data = { email: "contatti@example.org", social: [{ label: "Instagram", url: "https://instagram.com/epocar.test" }] };
    render(<ContattiPage />);
    expect(screen.getByRole("link", { name: "Scrivici un’email" })).toHaveAttribute("href", "mailto:contatti@example.org");
    expect(screen.getByRole("link", { name: "contatti@example.org" })).toHaveAttribute("href", "mailto:contatti@example.org");
    expect(screen.getByRole("link", { name: "Instagram" })).toHaveAttribute("href", "https://instagram.com/epocar.test");
    expect(screen.queryByRole("link", { name: "TikTok" })).not.toBeInTheDocument();
  });
});
