const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function articleId(segment = "") {
  const match = segment.match(ID);
  if (!match || (segment.length !== match[0].length && !segment.endsWith("--" + match[0]))) return undefined;
  return match[0];
}

export function articlePath(article: { id?: string; title?: string }) {
  const slug = (article.title ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100).replace(/-+$/, "") || "notizia";
  return `/articoli/${slug}--${article.id}`;
}
