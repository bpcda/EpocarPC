// Event timing, always evaluated in Europe/Rome. DB keeps UTC timestamptz.
export const EVENT_TZ = "Europe/Rome";

export type EventPhase = "upcoming" | "current" | "past" | "undated";
export interface TimedEvent { date: string | null; end_date?: string | null; published?: boolean | null }

const parts = (d: Date) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
};
/** Offset of Rome from UTC (ms) at the given instant — handles CET/CEST. */
const offsetAt = (t: number) => { const p = parts(new Date(t)); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000; };

/** Rome wall-clock (y,m,d,h,mi) → UTC instant. */
export function romeWallToDate(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return new Date(t);
}
/** "YYYY-MM-DDTHH:mm" typed in the admin (Rome time) → ISO UTC. */
export function romeInputToISO(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  return m ? romeWallToDate(+m[1], +m[2], +m[3], +m[4], +m[5]).toISOString() : null;
}
/** ISO → "YYYY-MM-DDTHH:mm" in Rome time for datetime-local inputs. */
export function isoToRomeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = parts(new Date(iso)), z = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${z(p.mo)}-${z(p.d)}T${z(p.h)}:${z(p.mi)}`;
}

/** When the event is over: end_date, otherwise the end of its Rome calendar day (single-day event). */
export function effectiveEnd(e: TimedEvent): Date | null {
  if (e.end_date) return new Date(e.end_date);
  if (!e.date) return null;
  const p = parts(new Date(e.date));
  return new Date(romeWallToDate(p.y, p.mo, p.d + 1).getTime() - 1);
}

export function eventPhase(e: TimedEvent, now = new Date()): EventPhase {
  if (!e.date) return "undated";
  const start = new Date(e.date), end = effectiveEnd(e)!;
  if (now < start) return "upcoming";
  if (now <= end) return "current";
  return "past";
}

/** Public split: drafts are always hidden, whatever the date. */
export function splitEvents<T extends TimedEvent>(events: T[], now = new Date()) {
  const visible = events.filter((e) => e.published !== false);
  const ts = (e: T) => (e.date ? new Date(e.date).getTime() : 0);
  const upcoming = visible.filter((e) => ["upcoming", "current", "undated"].includes(eventPhase(e, now)))
    .sort((a, b) => (a.date ? ts(a) : Infinity) - (b.date ? ts(b) : Infinity));
  const past = visible.filter((e) => eventPhase(e, now) === "past").sort((a, b) => ts(b) - ts(a));
  return { upcoming, past };
}

/** Countdown target: start if not begun; null when not eligible (draft, flag off, ended). */
export function countdownState(e: TimedEvent & { show_homepage_countdown?: boolean | null }, now = new Date()) {
  if (!e.show_homepage_countdown || e.published === false) return null;
  const phase = eventPhase(e, now);
  if (phase === "current") return { phase, days: 0, hours: 0, minutes: 0, seconds: 0 } as const;
  if (phase !== "upcoming") return null;
  const diff = Math.max(0, new Date(e.date!).getTime() - now.getTime());
  const s = Math.floor(diff / 1000);
  return { phase, days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 } as const;
}

export function formatEventDate(e: TimedEvent, withTime = false): string {
  if (!e.date) return "";
  const o: Intl.DateTimeFormatOptions = { timeZone: EVENT_TZ, day: "numeric", month: "long", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) };
  const start = new Date(e.date).toLocaleString("it-IT", o);
  if (!e.end_date) return start;
  const sameDay = isoToRomeInput(e.date).slice(0, 10) === isoToRomeInput(e.end_date).slice(0, 10);
  if (sameDay) return withTime ? `${start} – ${new Date(e.end_date).toLocaleTimeString("it-IT", { timeZone: EVENT_TZ, hour: "2-digit", minute: "2-digit" })}` : start;
  return `${start} – ${new Date(e.end_date).toLocaleString("it-IT", o)}`;
}
