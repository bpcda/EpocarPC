import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "@supabase/supabase-js/cors";
import { AccessToken, TrackSource } from "livekit-server-sdk";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
export async function boardRoom(
  req: Request,
  env: (key: string) => string | undefined,
  client = createClient,
) {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")
    return json(405, { message: "Metodo non consentito" });
  const user = client(env("SUPABASE_URL")!, env("SUPABASE_ANON_KEY")!, {
    global: {
      headers: { Authorization: req.headers.get("Authorization") ?? "" },
    },
    auth: { persistSession: false },
  });
  const auth = await user.auth.getUser();
  if (auth.error || !auth.data.user)
    return json(401, { message: "Sessione non valida" });
  try {
    const text = await req.text();
    if (text.length > 1024) throw new Error("Richiesta non valida");
    const { meeting_id } = JSON.parse(text);
    if (
      typeof meeting_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        meeting_id,
      )
    )
      return json(422, { message: "Seduta non valida" });
    const { data, error } = await user.rpc("board_room_access", {
      _meeting: meeting_id,
    });
    if (
      error ||
      !data ||
      data.identity !== auth.data.user.id ||
      data.room !== `board-${meeting_id}`
    )
      return json(403, { message: error?.message ?? "Stanza non disponibile" });
    const url = env("LIVEKIT_URL"),
      key = env("LIVEKIT_API_KEY"),
      secret = env("LIVEKIT_API_SECRET");
    if (!url || !key || !secret)
      return json(503, {
        message: "Audio/video in attesa della configurazione del server",
      });
    const endpoint = new URL(url);
    if (
      endpoint.protocol !== "wss:" ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    )
      throw new Error("Indirizzo della stanza non valido");
    const token = new AccessToken(key, secret, {
      identity: auth.data.user.id,
      name: data.name,
      ttl: 30,
    });
    token.addGrant({
      roomJoin: true,
      room: data.room,
      canPublish: true,
      canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA],
      canSubscribe: true,
      canPublishData: false,
    });
    return json(200, { url, token: await token.toJwt() });
  } catch {
    return json(409, { message: "Collegamento audio/video non riuscito" });
  }
}
