import { describe, expect, it } from "vitest";
import { articleDate, articleState, publicationPayload } from "@/lib/article-publication";

const now = new Date("2026-11-18T23:30:00Z"); // Already 19 November in Italy.
const form = { mode: "now" as const, articleDate: "", scheduledAt: "" };

describe("News publication dates", () => {
  it("leaves an automatic first-publication date to the server instead of using draft creation", () => {
    expect(publicationPayload(form, null, now)).toEqual({ published: true, published_at: null });
    expect(publicationPayload({ ...form, mode: "draft" }, null, now)).toEqual({ published: false, published_at: null });
  });
  it("allows immediate publication with an earlier Italian date and preserves creation metadata", () => {
    expect(publicationPayload({ ...form, articleDate: "2026-11-10" }, null, now)).toEqual({ published: true, published_at: "2026-11-09T23:00:00.000Z" });
    expect(publicationPayload({ ...form, articleDate: "2026-11-19" }, null, now).published).toBe(true);
  });
  it("retains an existing publication timestamp when editing unrelated content", () => {
    const original = "2026-11-10T15:42:12Z";
    expect(publicationPayload({ ...form, articleDate: "2026-11-10" }, original, now).published_at).toBe(original);
  });
  it("converts a scheduled time from Italy, including summer time", () => {
    expect(publicationPayload({ ...form, mode: "scheduled", scheduledAt: "2027-07-10T09:30" }, null, now)).toEqual({ published: true, published_at: "2027-07-10T07:30:00.000Z" });
    expect(publicationPayload({ ...form, mode: "scheduled", scheduledAt: "2026-11-20T09:30" }, null, now).published_at).toBe("2026-11-20T08:30:00.000Z");
  });
  it("rejects future displayed dates, expired schedules, impossible dates and nonexistent DST times", () => {
    expect(() => publicationPayload({ ...form, articleDate: "2026-11-20" }, null, now)).toThrow(/Programma/);
    expect(() => publicationPayload({ ...form, mode: "scheduled", scheduledAt: "2026-11-18T09:30" }, null, now)).toThrow(/future/);
    expect(() => publicationPayload({ ...form, articleDate: "2026-02-30" }, null, now)).toThrow(/non valida/);
    expect(() => publicationPayload({ ...form, mode: "scheduled", scheduledAt: "2027-03-28T02:30" }, null, now)).toThrow(/non valida/);
    expect(() => publicationPayload({ ...form, mode: "scheduled", scheduledAt: "" }, null, now)).toThrow(/valide/);
  });
  it("derives scheduled and visible states at read time, keeping drafts private", () => {
    const scheduled = { published: true, published_at: "2026-11-20T08:30:00Z", created_at: "2026-11-01T08:30:00Z" };
    expect(articleState(scheduled, now)).toBe("scheduled");
    expect(articleState(scheduled, new Date(scheduled.published_at))).toBe("now");
    expect(articleState({ ...scheduled, published: false }, new Date("2027-01-01"))).toBe("draft");
    expect(articleDate(scheduled)).toBe(scheduled.published_at);
    expect(articleDate({ created_at: scheduled.created_at })).toBe(scheduled.created_at);
  });
});
