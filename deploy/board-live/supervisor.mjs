import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { isIPv4 } from "node:net";
import { pathToFileURL } from "node:url";
import { RoomServiceClient } from "livekit-server-sdk";

export async function enforceRooms(api, allowed) {
  const valid = new Set(allowed.map((p) => `${p.room}:${p.identity}`));
  for (const room of await api.listRooms()) {
    if (!room.name.startsWith("board-")) {
      await api.deleteRoom(room.name);
      continue;
    }
    if (!allowed.some((p) => p.room === room.name)) {
      await api.deleteRoom(room.name);
      continue;
    }
    for (const p of await api.listParticipants(room.name))
      if (!valid.has(`${room.name}:${p.identity}`))
        await api.removeParticipant(room.name, p.identity);
  }
}
export function livekitConfig(env) {
  const key = env.LIVEKIT_API_KEY,
    secret = env.LIVEKIT_API_SECRET;
  if (
    !key ||
    !/^[a-zA-Z0-9_-]{5,80}$/.test(key) ||
    !secret ||
    !/^[a-zA-Z0-9_-]{32,128}$/.test(secret)
  )
    throw new Error(
      "Configura chiave LiveKit e segreto casuale (almeno 32 caratteri)",
    );
  const config = {
    port: 7880,
    bind_addresses: ["0.0.0.0"],
    log_level: "warn",
    rtc: { tcp_port: 7881, udp_port: 7882, use_external_ip: true },
    keys: { [key]: secret },
    room: { auto_create: true, empty_timeout: 60, max_participants: 7 },
    turn: { enabled: true, udp_port: 3478 },
  };
  if (env.LIVEKIT_NODE_IP) {
    if (!isIPv4(env.LIVEKIT_NODE_IP))
      throw new Error("Indirizzo IPv4 pubblico non valido");
    config.rtc.node_ip = env.LIVEKIT_NODE_IP;
    config.rtc.use_external_ip = false;
  }
  // TURN/TLS is optional because Coolify already owns host port 443.
  if (env.LIVEKIT_TURN_DOMAIN) {
    if (!/^[a-z0-9.-]+$/.test(env.LIVEKIT_TURN_DOMAIN))
      throw new Error("Dominio TURN non valido");
    Object.assign(config.turn, {
      domain: env.LIVEKIT_TURN_DOMAIN,
      tls_port: 443,
      cert_file: "/certs/turn.crt",
      key_file: "/certs/turn.key",
    });
  }
  return config;
}
export async function run(env = process.env) {
  const base = new URL(env.SUPABASE_URL);
  if (base.protocol !== "https:" || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Configura il progetto Supabase esterno");
  writeFileSync("/tmp/livekit-board.json", JSON.stringify(livekitConfig(env)), {
    mode: 0o600,
  });
  const child = spawn(
    env.LIVEKIT_BINARY ?? "/livekit-server",
    ["--config", "/tmp/livekit-board.json"],
    { stdio: "inherit" },
  );
  const api = new RoomServiceClient(
    "http://127.0.0.1:7880",
    env.LIVEKIT_API_KEY,
    env.LIVEKIT_API_SECRET,
  );
  let stopped = false,
    lastSuccess = Date.now(),
    busy = false;
  const stop = (code = 1) => {
    if (stopped) return;
    stopped = true;
    clearInterval(watchdog);
    clearInterval(timer);
    child.kill("SIGTERM");
    setTimeout(() => {
      child.kill("SIGKILL");
      process.exit(code);
    }, 3000);
  };
  child.on("exit", () => stop());
  child.on("error", () => stop());
  process.on("SIGTERM", () => stop(0));
  process.on("SIGINT", () => stop(0));
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
  async function sync() {
    if (busy || stopped) return;
    busy = true;
    try {
      const response = await fetch(
        new URL("/rest/v1/rpc/board_room_state", base),
        {
          method: "POST",
          headers,
          body: "{}",
          signal: AbortSignal.timeout(4000),
        },
      );
      if (!response.ok)
        throw new Error("Autorizzazioni stanza non disponibili");
      const allowed = await response.json();
      if (
        !Array.isArray(allowed) ||
        allowed.some(
          (p) => typeof p.room !== "string" || typeof p.identity !== "string",
        )
      )
        throw new Error("Autorizzazioni stanza non valide");
      await enforceRooms(api, allowed);
      const beat = await fetch(
        new URL("/rest/v1/board_room_health?on_conflict=id", base),
        {
          method: "POST",
          headers: { ...headers, Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({
            id: true,
            checked_at: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(4000),
        },
      );
      if (!beat.ok) throw new Error("Verifica server non registrata");
      lastSuccess = Date.now();
    } catch {
      console.error(
        "Controllo accessi fallito: arresto del server audio/video",
      );
      stop();
    } finally {
      busy = false;
    }
  }
  const watchdog = setInterval(() => {
    if (Date.now() - lastSuccess > 15000) {
      console.error("Controllo accessi scaduto");
      stop();
    }
  }, 1000);
  const timer = setInterval(() => void sync(), 5000);
  // Give the local SFU time to open its API before the first enforced sweep.
  setTimeout(() => void sync(), 1500);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  run().catch(() => {
    console.error("Avvio audio/video fallito: controllare la configurazione");
    process.exit(1);
  });
