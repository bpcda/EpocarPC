import { createClient } from "@supabase/supabase-js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (status: number, data: unknown) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});
// verify_jwt=false: this endpoint accepts only a revocable, scoped worker credential.
export async function boardWorker(req: Request, env: (name: string) => string | undefined, client = createClient) {
  if (req.method !== "POST") return json(405, { message: "Metodo non consentito" });
  const token = req.headers.get("x-board-worker-token") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return json(401, { message: "Routine non autorizzata" });
  if (Number(req.headers.get("content-length") ?? 0) > 2200000) return json(413, { message: "Richiesta troppo grande" });
  const db = client(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const auth = await db.rpc("board_document_worker_auth", { _token: token });
  if (auth.error || !auth.data) return json(401, { message: "Routine non autorizzata o scaduta" });
  let body;
  try { const raw = await req.text(); if (raw.length > 2200000) throw new Error(); body = JSON.parse(raw); }
  catch { return json(422, { message: "Richiesta non valida" }); }
  if (!body || !["claim", "heartbeat", "transcript", "drafting", "complete", "failed", "audio"].includes(body.action)
    || body.action !== "claim" && (!uuid.test(body.job_id) || !uuid.test(body.lease_id))
    || body.track_id && !uuid.test(body.track_id)) return json(422, { message: "Parametri non validi" });
  try {
    if (["claim", "heartbeat", "audio"].includes(body.action)) {
      const result = await db.rpc("board_documents_claim", {
        _worker: auth.data, _job: body.action === "claim" ? null : body.job_id,
        _lease: body.action === "claim" ? null : body.lease_id,
      });
      if (result.error) throw new Error(result.error.message);
      if (body.action === "audio") {
        const track = result.data?.tracks?.find((t: { id: string }) => t.id === body.track_id);
        if (!track?.storage_path) return json(403, { message: "Fonte non autorizzata" });
        const file = await db.storage.from("board-audio").download(track.storage_path);
        if (file.error || !file.data || file.data.size > 25 * 1024 * 1024) throw new Error("Fonte audio non disponibile");
        return new Response(file.data, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" } });
      }
      if (body.action === "heartbeat") return result.data ? json(200, { ok: true }) : json(409, { message: "Lavoro non più attivo" });
      return json(200, { job: result.data });
    }
    if (body.action === "complete" && (typeof body.body !== "string" || !Array.isArray(body.notes) || body.notes.some((n: unknown) => typeof n !== "string"))) return json(422, { message: "Risultato non valido" });
    const result = await db.rpc("board_documents_progress", {
      _worker: auth.data, _job: body.job_id, _lease: body.lease_id, _stage: body.action,
      _track: body.track_id ?? null, _transcript: body.transcript ?? null, _body: body.body ?? null, _notes: body.notes ?? [],
    });
    if (result.error) throw new Error(result.error.message);
    return json(200, result.data);
  } catch (error) {
    return json(409, { message: error instanceof Error ? error.message : "Elaborazione non riuscita" });
  }
}
