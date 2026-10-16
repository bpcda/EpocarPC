import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";

vi.stubEnv("VITE_STRAPI_URL", "https://cms.test");
const cms = await import("@/lib/cms");

const ok = (data: unknown) => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data }) });

beforeEach(() => localStorage.clear());

describe("cms client", () => {
  it("always requests only published content", async () => {
    const f = ok(null);
    await cms.cmsGet("pages?x=1", f);
    expect(f.mock.calls[0][0]).toBe("https://cms.test/api/pages?x=1&status=published");
  });

  it("serves last cached content when the CMS is offline", async () => {
    await cms.cmsGet("homepage", ok({ heroTitle: "Ciao" }));
    const down = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await cms.cmsGet("homepage", down)).toEqual({ heroTitle: "Ciao" });
  });

  it("returns null (fallback) when offline and nothing is cached", async () => {
    expect(await cms.cmsGet("faqs", vi.fn().mockRejectedValue(new Error("x")))).toBeNull();
  });
});

describe("normalizers", () => {
  it("homepage maps fields and resolves relative image URLs with alt text", () => {
    const h = cms.toHomepage({ heroTitle: "Titolo", heroImage: { url: "/uploads/a.jpg", alternativeText: "Auto", width: 1200, formats: { small: { url: "/uploads/s.jpg", width: 500 } } } })!;
    expect(h.heroTitle).toBe("Titolo");
    expect(h.heroImage).toMatchObject({ url: "https://cms.test/uploads/a.jpg", alt: "Auto" });
    expect(h.heroImage!.srcSet).toBe("https://cms.test/uploads/s.jpg 500w, https://cms.test/uploads/a.jpg 1200w");
  });

  it("empty CMS yields null so fallbacks are used", () => {
    expect(cms.toHomepage(null)).toBeNull();
    expect(cms.toSiteSettings(undefined)).toBeNull();
  });

  it("unpublished items are never shown", () => {
    expect(cms.toNews({ title: "T", slug: "t", publishedAt: null })).toBeNull();
    expect(cms.toPage({ title: "T", slug: "t", publishedAt: null })).toBeNull();
  });

  it("inactive sponsors are hidden", () => {
    expect(cms.toOrganization({ name: "X", active: false })).toBeNull();
  });

  it("rejects invalid slugs", () => {
    expect(cms.toPage({ title: "T", slug: "../admin" })).toBeNull();
    expect(cms.toNews({ title: "T", slug: "Bad Slug" })).toBeNull();
  });

  it("page keeps SEO title, description and OG image", () => {
    const p = cms.toPage({ title: "Storia", slug: "storia", seo: { metaTitle: "S", metaDescription: "D", ogImage: { url: "https://img/x.jpg" } } })!;
    expect(p.seo).toEqual({ title: "S", description: "D", image: { url: "https://img/x.jpg", alt: "", width: undefined, height: undefined, srcSet: undefined } });
  });

  it("news maps blocks and drops unknown ones", () => {
    const n = cms.toNews({ title: "N", slug: "n", blocks: [{ __component: "blocks.separatore" }, { __component: "blocks.html", html: "<script>" }] })!;
    expect(n.blocks).toEqual([{ kind: "divider" }]);
  });

  it("blocks unsafe links and non YouTube/Vimeo videos", () => {
    expect(cms.safeHref("javascript:alert(1)")).toBeUndefined();
    expect(cms.safeHref("//evil.com")).toBeUndefined();
    expect(cms.safeHref("/eventi")).toBe("/eventi");
    expect(cms.toEmbedUrl("https://www.youtube.com/watch?v=abc")).toBe("https://www.youtube-nocookie.com/embed/abc");
    expect(cms.toEmbedUrl("https://evil.com/v")).toBeUndefined();
  });
});

describe("cms boundaries", () => {
  it("never sends tokens from the browser", () => {
    expect(readFileSync("src/lib/cms.ts", "utf8")).not.toMatch(/Authorization|Bearer/);
  });
});
