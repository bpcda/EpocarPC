import { describe, it, expect } from "vitest";
import { countdownState, eventPhase, isoToRomeInput, romeInputToISO, splitEvents } from "@/lib/event-time";

const now = new Date("2026-10-12T20:00:00Z"); // 22:00 Rome (CEST)
const ev = (date: string | null, extra: Record<string, unknown> = {}) => ({ date, published: true, ...extra });

describe("phases", () => {
  it("future → upcoming, past → past, ongoing → current", () => {
    expect(eventPhase(ev("2026-10-20T08:00:00Z"), now)).toBe("upcoming");
    expect(eventPhase(ev("2026-10-01T08:00:00Z"), now)).toBe("past");
    expect(eventPhase(ev("2026-10-11T08:00:00Z", { end_date: "2026-10-13T18:00:00Z" }), now)).toBe("current");
  });
  it("single-day event stays current until midnight Rome", () => {
    expect(eventPhase(ev("2026-10-12T08:00:00Z"), now)).toBe("current");
    expect(eventPhase(ev("2026-10-12T08:00:00Z"), new Date("2026-10-12T22:00:01Z"))).toBe("past"); // 00:00:01 Rome
  });
});

describe("split", () => {
  const list = [
    ev("2026-11-01T10:00:00Z", { id: "b" }), ev("2026-10-20T10:00:00Z", { id: "a" }),
    ev("2026-09-01T10:00:00Z", { id: "old" }), ev("2026-10-01T10:00:00Z", { id: "recent" }),
    ev("2026-12-01T10:00:00Z", { id: "draftF", published: false }), ev("2026-01-01T10:00:00Z", { id: "draftP", published: false }),
  ];
  const { upcoming, past } = splitEvents(list, now);
  it("hides drafts in both lists", () => {
    expect([...upcoming, ...past].map((e) => e.id)).not.toContain("draftF");
    expect([...upcoming, ...past].map((e) => e.id)).not.toContain("draftP");
  });
  it("orders upcoming ascending and past descending", () => {
    expect(upcoming.map((e) => e.id)).toEqual(["a", "b"]);
    expect(past.map((e) => e.id)).toEqual(["recent", "old"]);
  });
});

describe("countdown", () => {
  it("needs the flag and a future event", () => {
    expect(countdownState(ev("2026-10-20T10:00:00Z", { show_homepage_countdown: false }), now)).toBeNull();
    expect(countdownState(ev("2026-10-20T10:00:00Z", { show_homepage_countdown: true }), now)?.phase).toBe("upcoming");
    expect(countdownState(ev("2026-10-01T10:00:00Z", { show_homepage_countdown: true }), now)).toBeNull();
    expect(countdownState(ev("2026-10-20T10:00:00Z", { show_homepage_countdown: true, published: false }), now)).toBeNull();
  });
  it("computes units and never goes negative", () => {
    const s = countdownState(ev("2026-10-14T21:01:05Z", { show_homepage_countdown: true }), now)!;
    expect([s.days, s.hours, s.minutes, s.seconds]).toEqual([2, 1, 1, 5]);
    const zero = countdownState(ev("2026-10-12T20:00:00Z", { show_homepage_countdown: true }), now)!;
    expect(zero.phase).toBe("current");
    expect(Math.min(zero.days, zero.hours, zero.minutes, zero.seconds)).toBe(0);
  });
});

describe("Europe/Rome", () => {
  it("converts admin input across CET/CEST", () => {
    expect(romeInputToISO("2026-07-01T10:00")).toBe("2026-07-01T08:00:00.000Z");
    expect(romeInputToISO("2026-12-01T10:00")).toBe("2026-12-01T09:00:00.000Z");
    expect(romeInputToISO("2026-10-25T02:30")).toMatch(/^2026-10-25T0[01]:30/);
    expect(isoToRomeInput("2026-12-01T09:00:00Z")).toBe("2026-12-01T10:00");
  });
});
