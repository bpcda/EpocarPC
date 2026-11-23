export interface CalendarJob {
  id: string;
  remote_id: string;
  slot_id: string | null;
  calendar_id: string;
  starts_at: string;
  ends_at: string;
  place: string;
  revision: number;
  lease: string;
}

type GoogleRequest = (path: string, init?: RequestInit) => Promise<Response>;

export async function syncEvent(job: CalendarJob, request: GoogleRequest): Promise<"done" | "recreate"> {
  const id = job.remote_id.replace(/-/g, "");
  const item = "/" + id;
  const read = await request(item);
  if (!read.ok && read.status !== 404 && read.status !== 410) throw new Error("google_read");
  const existing = read.ok ? await read.json() : null;
  if (existing && existing.status !== "cancelled" &&
      existing.extendedProperties?.private?.epocarShooting !== job.id) throw new Error("foreign_event");

  const absent = !existing || existing.status === "cancelled";
  if (!job.slot_id && absent) return "done";
  if (job.slot_id && (read.status === 410 || existing?.status === "cancelled")) return "recreate";
  if (existing && !existing.etag) throw new Error("missing_etag");
  const headers = new Headers({ "Content-Type": "application/json" });
  if (existing) headers.set("If-Match", existing.etag);
  const event = {
    summary: "Natale su Ruote · Shooting EPOCAR",
    location: job.place,
    start: { dateTime: job.starts_at, timeZone: "Europe/Rome" },
    end: { dateTime: job.ends_at, timeZone: "Europe/Rome" },
    extendedProperties: { private: { epocarShooting: job.id } },
  };
  // Google accepts a client-supplied hexadecimal ID, so a lost response can be retried.
  const response = job.slot_id
    ? await request((existing ? item : "") + "?sendUpdates=none", {
        method: existing ? "PATCH" : "POST", headers,
        body: JSON.stringify(existing ? event : { ...event, id }),
      })
    : await request(item + "?sendUpdates=none", { method: "DELETE", headers });
  if (!response.ok && !(!job.slot_id && [404,410].includes(response.status))) throw new Error("google_write");
  return "done";
}
