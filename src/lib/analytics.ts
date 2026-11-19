import type { BeforeSendEvent } from "@vercel/analytics";

export function publicAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const url = new URL(event.url);
    const path = decodeURIComponent(url.pathname);
    // New routes stay untracked until explicitly reviewed as public pages.
    const publicPage = path === "/" || /^\/(chi-siamo|associazione|eventi|gallery|community|contatti|faq|news(?:\/[^/]+)?|articoli(?:\/[^/]+)?|pagine\/[^/]+)\/?$/i.test(path);
    if (!publicPage) return null;
    return { ...event, url: `${url.origin}${url.pathname}` };
  } catch {
    return null;
  }
}
