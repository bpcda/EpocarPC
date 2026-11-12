import { readFileSync } from "node:fs";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { describe, expect, it, vi } from "vitest";

const meetingId = "00000000-0000-4000-8000-000000000001";
const trackId = "00000000-0000-4000-8000-000000000002";

describe.each(["board-transcribe", "board-draft-minutes"])("%s current meeting authority", (name) => {
  async function request(chair: boolean, minuteTaker: boolean, rpcError = false) {
    let handler!: (req: Request) => Promise<Response>;
    const user = {
      auth: { getUser: async () => ({ data: { user: { id: "former-minute-taker" } }, error: null }) },
      rpc: vi.fn(async (rpc: string) => ({ data: rpc === "board_is_chair" ? chair : minuteTaker, error: rpcError ? { message: "unavailable" } : null })),
    };
    const rows: Record<string, unknown> = {
      board_audio_tracks: { status: "caricata", meeting_id: meetingId },
      board_meetings: { id: meetingId, minute_taker_id: "former-minute-taker", started_at: "2026-11-12T17:00:00Z" },
      board_ai_settings: { enabled: false },
    };
    const db = { from: (table: string) => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: rows[table], error: null }) };
      return q;
    } };
    const createClient = vi.fn().mockReturnValueOnce(user).mockReturnValueOnce(db);
    const source = readFileSync(`setup/functions/${name}/index.ts`, "utf8").replace(/^import .*;\r?\n/gm, "");
    const js = transpileModule(source, { compilerOptions: { target: ScriptTarget.ES2020, module: ModuleKind.None } }).outputText;
    new Function("createClient", "corsHeaders", "Deno", js)(createClient, {}, {
      env: { get: () => "configured" }, serve: (fn: typeof handler) => { handler = fn; },
    });
    const response = await handler(new Request("https://example.invalid", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer session" },
      body: JSON.stringify(name === "board-transcribe" ? { track_id: trackId } : { meeting_id: meetingId }) }));
    return { response, user };
  }
  it("accepts an activated chair or current minute taker before checking AI settings", async () => {
    for (const [chair, minuteTaker] of [[true,false],[false,true]]) {
      const { response, user } = await request(chair,minuteTaker);
      expect(response.status).toBe(409);
      expect((await response.json()).error).toBe("ai_disabled");
      expect(user.rpc).toHaveBeenCalledWith("board_is_chair", { _meeting: meetingId });
      expect(user.rpc).toHaveBeenCalledWith("board_is_minute_taker", { _meeting: meetingId });
    }
  });
  it("rejects a former minute taker and fails closed when authority cannot be read", async () => {
    expect((await request(false,false)).response.status).toBe(403);
    expect((await request(true,true,true)).response.status).toBe(403);
  });
});
