// @vitest-environment node
import { expect, it, vi } from "vitest";
import { syncEvent, type CalendarJob } from "../../setup/functions/shooting-calendar/google";

const job: CalendarJob = {
  id: "job", remote_id: "1234-abcd", slot_id: "slot1", calendar_id: "test", lease: "lease", revision: 2,
  starts_at: "2026-12-03T17:30:00Z", ends_at: "2026-12-03T17:50:00Z", place: "Piacenza",
};
const existing = () => Response.json({ etag: '"v1"', extendedProperties: { private: { epocarShooting: job.id } } });

it("creates one deterministic Google event and patches that event on retry or move", async () => {
  const request = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(Response.json({}));
  await syncEvent(job, request);
  const insert = request.mock.calls[1][1];
  expect(insert.method).toBe("POST");
  expect(JSON.parse(insert.body)).toEqual({
    id: "1234abcd", summary: "Natale su Ruote · Shooting EPOCAR", location: "Piacenza",
    start: { dateTime: job.starts_at, timeZone: "Europe/Rome" }, end: { dateTime: job.ends_at, timeZone: "Europe/Rome" },
    extendedProperties: { private: { epocarShooting: job.id } },
  });
  request.mockClear().mockResolvedValueOnce(existing()).mockResolvedValueOnce(Response.json({}));
  await syncEvent({ ...job, slot_id: "moved", starts_at: "2026-12-17T17:30:00Z" }, request);
  expect(request.mock.calls[1][0]).toBe("/1234abcd?sendUpdates=none");
  expect(request.mock.calls[1][1].method).toBe("PATCH");
  expect(request.mock.calls[1][1].headers.get("If-Match")).toBe('"v1"');
});

it("retries failed writes, treats repeat deletes as done and protects unrelated events", async () => {
  const request = vi.fn().mockResolvedValueOnce(existing()).mockResolvedValueOnce(new Response(null, { status: 503 }));
  await expect(syncEvent({ ...job, slot_id: null }, request)).rejects.toThrow();
  expect(request.mock.calls[1][1].method).toBe("DELETE");
  request.mockClear().mockResolvedValueOnce(new Response(null, { status: 404 }));
  expect(await syncEvent({ ...job, slot_id: null }, request)).toBe("done");
  expect(request).toHaveBeenCalledTimes(1);
  request.mockClear().mockResolvedValueOnce(Response.json({ etag: '"v2"' }));
  await expect(syncEvent(job, request)).rejects.toThrow("foreign_event");
  expect(request).toHaveBeenCalledTimes(1);
  request.mockResolvedValueOnce(Response.json({ status: "cancelled" }));
  expect(await syncEvent(job, request)).toBe("recreate");
});
