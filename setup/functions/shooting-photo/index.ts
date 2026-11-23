// Public GET resolves a currently published gallery entry. Private POST checks the caller's album.
import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const empty = (status: number) => new Response(null, { status, headers });
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(204);
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  if (req.method === "POST" && new URL(req.url).searchParams.has("cleanup")) {
    const secret = req.headers.get("X-Cleanup-Key") ?? "";
    if (!uuid.test(secret)) return empty(403);
    const batch = await service.rpc("shooting_photo_cleanup_batch", { p_secret: secret });
    if (batch.error) return empty(403);
    const names = batch.data.map((row: { name: string }) => row.name);
    if (names.length && (await service.storage.from("shooting-photos").remove(names)).error) {
      return empty(503);
    }
    return empty(204);
  }
  let id: string;
  if (req.method === "GET") {
    const gallery = new URL(req.url).searchParams.get("gallery") ?? "";
    if (!uuid.test(gallery)) return empty(404);
    const row = await service.from("shooting_photos").select("id").eq("gallery_id", gallery).maybeSingle();
    if (row.error) return empty(503);
    if (!row.data) return empty(404);
    id = row.data.id;
  } else if (req.method === "POST") {
    const token = req.headers.get("Authorization");
    if (!token?.startsWith("Bearer ")) return empty(401);
    id = (await req.json().catch(() => null))?.id;
    if (typeof id !== "string" || !uuid.test(id)) return empty(400);
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: token } },
      auth: { persistSession: false },
    });
    const rows = await caller.rpc("my_shooting_photos", { p_id: id });
    if (rows.error || !rows.data?.length) return empty(404);
  } else return empty(405);
  const image = await service.storage.from("shooting-photos").download(id + ".jpg");
  if (image.error || !image.data) return empty(404);
  return new Response(image.data, {
    headers: { ...headers, "Content-Type": req.method === "GET" ? "image/jpeg" : "application/octet-stream" },
  });
});
