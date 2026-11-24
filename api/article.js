import { readFile } from "node:fs/promises";
import sanitizeHtml from "sanitize-html";

const identifier = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const text = value => sanitizeHtml(value ?? "", { allowedTags: [], allowedAttributes: {} }).trim();
const pathFor = article => {
  const slug = article.title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100).replace(/-+$/, "") || "notizia";
  return `/articoli/${slug}--${article.id}`;
};

export default async function handler(req, res) {
  const segment = typeof req.query.segment === "string" ? req.query.segment : "";
  const id = segment.slice(-36);
  if (!identifier.test(id) || (segment !== id && !segment.endsWith("--" + id))) {
    res.status(404).setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end("<!doctype html><html lang='it'><title>Pagina non trovata — EPOCAR</title><h1>Pagina non trovata</h1><a href='/news'>Tutte le news</a></html>");
  }
  const host = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!host || !key) return res.status(503).send("Notizia temporaneamente non disponibile.");
  try {
    const url = new URL("/rest/v1/articles", host);
    url.searchParams.set("select", "id,title,summary,content,image_url,created_at,published_at");
    url.searchParams.set("id", "eq." + id);
    url.searchParams.set("published", "eq.true");
    url.searchParams.set("or", `(published_at.is.null,published_at.lte.${new Date().toISOString()})`);
    const load = () => fetch(url, { headers: { apikey: key, Authorization: "Bearer " + key }, signal: AbortSignal.timeout(8000) });
    let result = await load();
    if (!result.ok) {
      const error = await result.json().catch(() => null);
      if (["42703", "PGRST204"].includes(error?.code)) {
        url.searchParams.set("select", "id,title,summary,content,image_url,created_at");
        url.searchParams.delete("or");
        result = await load();
      }
    }
    if (!result.ok) throw new Error("database");
    const [article] = await result.json();
    if (!article) return res.status(404).send("Notizia non trovata.");
    const path = pathFor(article);
    if (segment !== path.slice("/articoli/".length)) {
      res.status(301).setHeader("Location", path);
      return res.end();
    }
    const shell = await readFile("dist/index.html", "utf8");
    const title = escape(article.title + " — Epocar");
    const description = escape(text(article.summary) || "Notizie dalla community Epocar di Piacenza.");
    const canonical = "https://epocarpc.com" + path;
    let image = "https://epocarpc.com/epocar-social.jpg";
    try { if (["http:", "https:"].includes(new URL(article.image_url).protocol)) image = article.image_url; } catch { /* use default */ }
    const clean = sanitizeHtml(article.content ?? "", {
      allowedTags: ["p", "h2", "h3", "h4", "ul", "ol", "li", "strong", "em", "b", "i", "a", "blockquote", "br"],
      allowedAttributes: { a: ["href", "title"] }, allowedSchemes: ["http", "https", "mailto"],
    });
    const content = `<main><article><a href="/news">Tutte le news</a><h1>${escape(article.title)}</h1><p>${description}</p>${article.image_url ? `<img src="${escape(image)}" alt="${escape(article.title)}">` : ""}${clean}</article></main>`;
    const html = shell.replace(/<title>[^<]*<\/title>/, `<title data-rh="true">${title}</title>`)
      .replace(/<meta data-rh="true" name="description"[^>]*>/, `<meta data-rh="true" name="description" content="${description}">`)
      .replace(/<meta data-rh="true" property="og:title"[^>]*>/, `<meta data-rh="true" property="og:title" content="${title}">`)
      .replace(/<meta data-rh="true" name="twitter:title"[^>]*>/, `<meta data-rh="true" name="twitter:title" content="${title}">`)
      .replace(/<meta data-rh="true" property="og:description"[^>]*>/, `<meta data-rh="true" property="og:description" content="${description}">`)
      .replace(/<meta data-rh="true" name="twitter:description"[^>]*>/, `<meta data-rh="true" name="twitter:description" content="${description}">`)
      .replace(/<meta data-rh="true" property="og:image"[^>]*>/, `<meta data-rh="true" property="og:image" content="${escape(image)}">`)
      .replace(/<meta data-rh="true" name="twitter:image"[^>]*>/, `<meta data-rh="true" name="twitter:image" content="${escape(image)}">`)
      .replace("</head>", `<link data-rh="true" rel="canonical" href="${canonical}"><meta data-rh="true" property="og:url" content="${canonical}"></head>`)
      .replace('<div id="root"></div>', `<div id="root">${content}</div>`);
    res.status(200).setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    return res.end(html);
  } catch {
    return res.status(503).send("Notizia temporaneamente non disponibile.");
  }
}
