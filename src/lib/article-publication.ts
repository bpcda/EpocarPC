import { isoToRomeInput, romeInputToISO } from "@/lib/event-time";

export type PublicationMode = "draft" | "now" | "scheduled";
export interface PublicationForm {
  mode: PublicationMode;
  articleDate: string;
  scheduledAt: string;
}
export interface ArticleTiming {
  published?: boolean | null;
  published_at?: string | null;
  created_at?: string;
}

export function articleState(article: ArticleTiming, now = new Date()): PublicationMode {
  if (!article.published) return "draft";
  return article.published_at && Date.parse(article.published_at) > now.getTime() ? "scheduled" : "now";
}

export const articleDate = (article: ArticleTiming) => article.published_at ?? article.created_at ?? "";

function parseRomeInput(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) throw new Error("Indica una data e un’ora valide.");
  const iso = romeInputToISO(input);
  if (!iso || isoToRomeInput(iso) !== input) throw new Error("Data o ora non valida in Italia. Controlla anche il cambio dell’ora.");
  return iso;
}

export function publicationPayload(form: PublicationForm, originalPublishedAt?: string | null, now = new Date()) {
  if (form.mode === "scheduled") {
    const published_at = parseRomeInput(form.scheduledAt);
    if (Date.parse(published_at) <= now.getTime()) throw new Error("Per programmare una notizia scegli una data e un’ora future.");
    return { published: true, published_at };
  }
  let published_at: string | null = null;
  if (form.articleDate) {
    published_at = parseRomeInput(`${form.articleDate}T00:00`);
    if (form.articleDate > isoToRomeInput(now.toISOString()).slice(0, 10)) throw new Error("Per una data futura scegli «Programma».");
    if (originalPublishedAt && isoToRomeInput(originalPublishedAt).slice(0, 10) === form.articleDate) published_at = originalPublishedAt;
  }
  // A null date lets the database set the actual first publication time, even for an old draft.
  return { published: form.mode === "now", published_at };
}
