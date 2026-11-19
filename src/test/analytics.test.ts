import { describe, expect, it } from "vitest";
import { publicAnalyticsEvent } from "@/lib/analytics";

describe("Vercel public page analytics", () => {
  it.each(["/", "/eventi", "/news/un-raduno", "/articoli/11111111-1111-4111-8111-111111111111", "/pagine/storia", "/contatti/"])("tracks %s without query parameters or fragments", path => {
    expect(publicAnalyticsEvent({ type: "pageview", url: `https://epocarpc.com${path}?email=private@example.invalid&token=secret#access_token=secret` }))
      .toEqual({ type: "pageview", url: `https://epocarpc.com${path}` });
  });
  it.each(["/auth", "/admin", "/admin/eventi/nuovo", "/account", "/consiglio-direttivo", "/tesoreria/movimenti", "/associazione/iscrizione", "/eventi/event-id/iscrizione", "/ADMIN", "/%61ccount", "/nuova-area-riservata"])("does not track %s", path => {
    expect(publicAnalyticsEvent({ type: "pageview", url: `https://epocarpc.com${path}` })).toBeNull();
  });
  it("fails closed for malformed URLs and invalid URL encoding", () => {
    expect(publicAnalyticsEvent({ type: "pageview", url: "not a URL" })).toBeNull();
    expect(publicAnalyticsEvent({ type: "pageview", url: "https://epocarpc.com/news/%FF" })).toBeNull();
  });
});
