/**
 * Read-only client for the editorial Strapi CMS (Strapi v5 REST, flattened responses).
 * - Base URL from VITE_STRAPI_URL; when missing every call resolves to null (site uses fallbacks).
 * - Only published content is requested (status=published); no token is ever sent from the browser.
 * - Responses are cached in localStorage and served stale if the CMS is offline.
 * Operational data (auth, members, applications, events registrations, treasury) never lives here.
 */

export const CMS_URL: string = ((import.meta.env.VITE_STRAPI_URL as string | undefined) ?? "").replace(/\/+$/, "");
export const cmsEnabled = () => CMS_URL.length > 0;

const CACHE_PREFIX = "epocar-cms:";
const TIMEOUT_MS = 6000;

export interface CmsImage { url: string; alt: string; width?: number; height?: number; srcSet?: string }
export interface CmsLink { label: string; url: string }

export type InlineNode = { type: "text"; text: string; bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; code?: boolean }
  | { type: "link"; url: string; children: InlineNode[] };
export type RichNode =
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "heading"; level: number; children: InlineNode[] }
  | { type: "quote"; children: InlineNode[] }
  | { type: "list"; format: "ordered" | "unordered"; children: { type: "list-item"; children: InlineNode[] }[] }
  | { type: "image"; image: { url: string; alternativeText?: string | null } };
export type RichText = RichNode[];

export type Block =
  | { kind: "text"; body: RichText }
  | { kind: "heading-text"; title: string; body: RichText }
  | { kind: "image"; image: CmsImage; caption?: string }
  | { kind: "gallery"; images: CmsImage[] }
  | { kind: "quote"; text: string; author?: string }
  | { kind: "cta"; title: string; text?: string; link: CmsLink }
  | { kind: "two-columns"; left: RichText; right: RichText }
  | { kind: "video"; embedUrl: string; title?: string }
  | { kind: "divider" };

export interface Seo { title?: string; description?: string; image?: CmsImage }

export interface SiteSettings {
  siteName?: string; logo?: CmsImage; email?: string; phone?: string; address?: string;
  footerText?: string; social: CmsLink[];
}
export interface Homepage {
  heroTitle?: string; heroSubtitle?: string; heroImage?: CmsImage;
  missionLabel?: string; missionText?: string;
  ctaTitle?: string; ctaText?: string; ctaPrimary?: CmsLink; ctaSecondary?: CmsLink;
  showSponsors: boolean; showPartners: boolean; showNews: boolean;
}
export interface CmsPage { title: string; slug: string; excerpt?: string; heroImage?: CmsImage; blocks: Block[]; seo: Seo }
export interface NewsItem {
  title: string; slug: string; excerpt?: string; cover?: CmsImage; author?: string; date?: string;
  featured: boolean; blocks: Block[]; gallery: CmsImage[]; seo: Seo;
}
export interface Organization { name: string; logo?: CmsImage; website?: string; description?: string; order: number }
export interface Faq { question: string; answer: RichText; order: number }

/* ───────────── fetch layer ───────────── */

type Json = Record<string, unknown>;

export async function cmsGet(path: string, fetchImpl: typeof fetch = fetch): Promise<unknown | null> {
  if (!cmsEnabled()) return null;
  const sep = path.includes("?") ? "&" : "?";
  const url = `${CMS_URL}/api/${path}${sep}status=published`;
  const key = CACHE_PREFIX + path;
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : undefined;
  try {
    const res = await fetchImpl(url, { signal: ctrl?.signal, headers: { Accept: "application/json" } });
    if (res.status === 404) return null; // single type not yet created
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as Json;
    const data = json?.data ?? null;
    try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* storage full/blocked */ }
    return data;
  } catch {
    try {
      const cached = localStorage.getItem(key);
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  } finally { if (timer) clearTimeout(timer); }
}

/* ───────────── normalizers (defensive: CMS content is untrusted) ───────────── */

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const obj = (v: unknown): Json | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function absUrl(u: string): string {
  if (/^https?:\/\//i.test(u)) return u;
  return `${CMS_URL}${u.startsWith("/") ? "" : "/"}${u}`;
}

/** Only http(s), mailto, tel and site-relative links are allowed. */
export function safeHref(u: unknown): string | undefined {
  const s = str(u);
  if (!s) return undefined;
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  return undefined;
}

export function toImage(v: unknown): CmsImage | undefined {
  const m = obj(v);
  const url = m && str(m.url);
  if (!m || !url) return undefined;
  const formats = obj(m.formats);
  const srcSet = formats
    ? Object.values(formats).map(obj).filter((f): f is Json => !!f && !!str(f.url) && typeof f.width === "number")
        .sort((a, b) => num(a.width) - num(b.width))
        .map((f) => `${absUrl(str(f.url)!)} ${num(f.width)}w`)
        .concat(typeof m.width === "number" ? [`${absUrl(url)} ${m.width}w`] : [])
        .join(", ") || undefined
    : undefined;
  return {
    url: absUrl(url),
    alt: str(m.alternativeText) ?? str(m.caption) ?? "",
    width: typeof m.width === "number" ? m.width : undefined,
    height: typeof m.height === "number" ? m.height : undefined,
    srcSet,
  };
}

const toLink = (v: unknown): CmsLink | undefined => {
  const o = obj(v);
  const label = o && str(o.label);
  const url = o && safeHref(o.url);
  return label && url ? { label, url } : undefined;
};

export const toRichText = (v: unknown): RichText => (Array.isArray(v) ? (v as RichText) : []);

/** Converts YouTube/Vimeo page URLs into embeddable URLs; anything else is rejected. */
export function toEmbedUrl(raw: unknown): string | undefined {
  const s = str(raw);
  if (!s) return undefined;
  let u: URL;
  try { u = new URL(s); } catch { return undefined; }
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.searchParams.get("v") ?? (u.pathname.startsWith("/embed/") ? u.pathname.split("/")[2] : null);
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : undefined;
  }
  if (host === "youtube-nocookie.com") return u.toString();
  if (host === "vimeo.com") { const id = u.pathname.split("/").filter(Boolean)[0]; return id ? `https://player.vimeo.com/video/${id}` : undefined; }
  if (host === "player.vimeo.com") return u.toString();
  return undefined;
}

export function toBlocks(v: unknown): Block[] {
  const out: Block[] = [];
  for (const raw of arr(v)) {
    const b = obj(raw);
    if (!b) continue;
    switch (b.__component) {
      case "blocks.testo": out.push({ kind: "text", body: toRichText(b.body) }); break;
      case "blocks.titolo-testo": { const title = str(b.title); if (title) out.push({ kind: "heading-text", title, body: toRichText(b.body) }); break; }
      case "blocks.immagine": { const image = toImage(b.image); if (image) out.push({ kind: "image", image, caption: str(b.caption) }); break; }
      case "blocks.galleria": { const images = arr(b.images).map(toImage).filter((i): i is CmsImage => !!i); if (images.length) out.push({ kind: "gallery", images }); break; }
      case "blocks.citazione": { const text = str(b.text); if (text) out.push({ kind: "quote", text, author: str(b.author) }); break; }
      case "blocks.cta": { const title = str(b.title); const link = toLink(b.link); if (title && link) out.push({ kind: "cta", title, text: str(b.text), link }); break; }
      case "blocks.due-colonne": out.push({ kind: "two-columns", left: toRichText(b.left), right: toRichText(b.right) }); break;
      case "blocks.video": { const embedUrl = toEmbedUrl(b.url); if (embedUrl) out.push({ kind: "video", embedUrl, title: str(b.title) }); break; }
      case "blocks.separatore": out.push({ kind: "divider" }); break;
    }
  }
  return out;
}

const toSeo = (v: unknown): Seo => {
  const s = obj(v);
  return s ? { title: str(s.metaTitle), description: str(s.metaDescription), image: toImage(s.ogImage) } : {};
};

/** Strapi v5 drafts never come back with status=published, but double-check publishedAt. */
const isPublished = (o: Json) => o.publishedAt === undefined || (o.publishedAt !== null && o.publishedAt !== "");

export function toSiteSettings(v: unknown): SiteSettings | null {
  const o = obj(v);
  if (!o) return null;
  return {
    siteName: str(o.siteName), logo: toImage(o.logo), email: str(o.email), phone: str(o.phone),
    address: str(o.address), footerText: str(o.footerText),
    social: arr(o.social).map(toLink).filter((l): l is CmsLink => !!l),
  };
}

export function toHomepage(v: unknown): Homepage | null {
  const o = obj(v);
  if (!o || !isPublished(o)) return null;
  return {
    heroTitle: str(o.heroTitle), heroSubtitle: str(o.heroSubtitle), heroImage: toImage(o.heroImage),
    missionLabel: str(o.missionLabel), missionText: str(o.missionText),
    ctaTitle: str(o.ctaTitle), ctaText: str(o.ctaText), ctaPrimary: toLink(o.ctaPrimary), ctaSecondary: toLink(o.ctaSecondary),
    showSponsors: o.showSponsors !== false, showPartners: o.showPartners !== false, showNews: o.showNews !== false,
  };
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function toPage(v: unknown): CmsPage | null {
  const o = obj(v);
  const title = o && str(o.title);
  const slug = o && str(o.slug);
  if (!o || !title || !slug || !SLUG_RE.test(slug) || !isPublished(o)) return null;
  return { title, slug, excerpt: str(o.excerpt), heroImage: toImage(o.heroImage), blocks: toBlocks(o.blocks), seo: toSeo(o.seo) };
}

export function toNews(v: unknown): NewsItem | null {
  const o = obj(v);
  const title = o && str(o.title);
  const slug = o && str(o.slug);
  if (!o || !title || !slug || !SLUG_RE.test(slug) || !isPublished(o)) return null;
  return {
    title, slug, excerpt: str(o.excerpt), cover: toImage(o.cover), author: str(o.authorName),
    date: str(o.date) ?? str(o.publishedAt), featured: o.featured === true,
    blocks: toBlocks(o.blocks), gallery: arr(o.gallery).map(toImage).filter((i): i is CmsImage => !!i), seo: toSeo(o.seo),
  };
}

export function toOrganization(v: unknown): Organization | null {
  const o = obj(v);
  const name = o && str(o.name);
  if (!o || !name || o.active === false || !isPublished(o)) return null;
  return { name, logo: toImage(o.logo), website: safeHref(o.website), description: str(o.description), order: num(o.order) };
}

export function toFaq(v: unknown): Faq | null {
  const o = obj(v);
  const question = o && str(o.question);
  if (!o || !question || o.active === false || !isPublished(o)) return null;
  return { question, answer: toRichText(o.answer), order: num(o.order) };
}

const list = <T,>(v: unknown, f: (x: unknown) => T | null) => arr(v).map(f).filter((x): x is T => x !== null);
const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

/* ───────────── public API ───────────── */

const IMG = "populate[0]=heroImage";
const BLOCKS = "populate[blocks][populate]=*&populate[seo][populate]=*";

export const fetchSiteSettings = async () => toSiteSettings(await cmsGet("site-setting?populate=*"));
export const fetchHomepage = async () => toHomepage(await cmsGet(`homepage?populate=*`));
export async function fetchPage(slug: string) {
  if (!SLUG_RE.test(slug)) return null;
  const d = await cmsGet(`pages?filters[slug][$eq]=${encodeURIComponent(slug)}&${IMG}&${BLOCKS}`);
  return list(d, toPage)[0] ?? null;
}
export async function fetchNewsList(limit = 50) {
  const d = await cmsGet(`news-items?sort[0]=date:desc&pagination[pageSize]=${limit}&populate[0]=cover`);
  return list(d, toNews);
}
export async function fetchNews(slug: string) {
  if (!SLUG_RE.test(slug)) return null;
  const d = await cmsGet(`news-items?filters[slug][$eq]=${encodeURIComponent(slug)}&populate[cover]=true&populate[gallery]=true&${BLOCKS}`);
  return list(d, toNews)[0] ?? null;
}
export const fetchSponsors = async () => list(await cmsGet("sponsors?populate=logo&filters[active][$eq]=true&pagination[pageSize]=100"), toOrganization).sort(byOrder);
export const fetchPartners = async () => list(await cmsGet("partners?populate=logo&filters[active][$eq]=true&pagination[pageSize]=100"), toOrganization).sort(byOrder);
export const fetchFaqs = async () => list(await cmsGet("faqs?filters[active][$eq]=true&pagination[pageSize]=100"), toFaq).sort(byOrder);
