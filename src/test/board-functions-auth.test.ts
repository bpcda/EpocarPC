// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleBoardAi } from "../../setup/functions/_shared/board-ai";
import { boardRoom } from "../../setup/functions/board-room/handler";
import { TokenVerifier } from "livekit-server-sdk";

const meeting = "00000000-0000-4000-8000-000000000001",
  track = "00000000-0000-4000-8000-000000000002",
  actor = "00000000-0000-4000-8000-000000000003",
  minutes = "00000000-0000-4000-8000-000000000004",
  requestId = "00000000-0000-4000-8000-000000000005";
export function wav(seconds = 1) {
  const bytes = new Uint8Array(44 + 8000 * 2 * seconds),
    v = new DataView(bytes.buffer),
    text = (offset: number, s: string) =>
      bytes.set(new TextEncoder().encode(s), offset);
  text(0, "RIFF");
  v.setUint32(4, bytes.length - 8, true);
  text(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, bytes.length - 44, true);
  return bytes;
}
function harness(
  options: {
    chair?: boolean;
    taker?: boolean;
    permissionError?: boolean;
    contextError?: boolean;
    storageError?: boolean;
    audio?: Uint8Array;
  } = {},
) {
  let job: Record<string, unknown> | null = null;
  const user = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: actor } },
        error: null,
      })),
    },
    rpc: vi.fn(async (name: string) => {
      if (name === "board_is_chair" || name === "board_is_minute_taker")
        return {
          data:
            name === "board_is_chair"
              ? (options.chair ?? true)
              : (options.taker ?? false),
          error: options.permissionError ? { message: "offline" } : null,
        };
      if (name === "board_minutes_ensure")
        return { data: minutes, error: null };
      if (name === "board_ai_context")
        return {
          data: options.contextError
            ? null
            : {
                context: {
                  meeting: { id: meeting },
                  minutes: { id: minutes, current_version: 1 },
                  ballots: [],
                },
                revision: 1,
                hash: "a".repeat(32),
              },
          error: options.contextError
            ? { message: "Contesto non disponibile" }
            : null,
        };
      if (name === "board_room_access")
        return {
          data: {
            room: `board-${meeting}`,
            identity: actor,
            name: "Presidente",
          },
          error: options.permissionError
            ? { message: "carica decaduta" }
            : null,
        };
      return { data: true, error: null };
    }),
  };
  const db = {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data:
            table === "board_ai_jobs"
              ? job
              : {
                  id: track,
                  meeting_id: meeting,
                  status: "caricata",
                  storage_path: `${meeting}/${track}.webm`,
                  kind: "individual",
                  consent_snapshot: [{ name: "Presidente" }],
                },
          error: null,
        }),
        single: async () => ({ data: job, error: null }),
      };
      return query;
    },
    storage: {
      from: () => ({
        download: async () => ({
          data: new Blob([new Uint8Array(options.audio ?? wav()).buffer]),
          error: options.storageError
            ? { message: "Storage non disponibile" }
            : null,
        }),
      }),
    },
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "board_ai_reserve") {
        job = {
          id: requestId,
          request_id: requestId,
          status: "reserved",
          actor,
          kind: args._kind,
          target_id: args._target,
          meeting_id: meeting,
          settings_snapshot: {
            api_base: "https://provider.invalid/v1",
            transcription_model: "speech",
            drafting_model: "draft",
            draft_max_tokens: 4000,
          },
        };
        return { data: job, error: null };
      }
      if (name === "board_ai_job_begin") {
        job!.status = "running";
        return { data: true, error: null };
      }
      if (name === "board_ai_job_complete") {
        job!.status = "succeeded";
        return { data: null, error: null };
      }
      if (name === "board_ai_job_fail") {
        job!.status = "failed";
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }),
  };
  const client = vi.fn((_url: string, key: string) =>
    key === "service" ? db : user,
  );
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          text: "Intervento trascritto",
          choices: [
            {
              finish_reason: "stop",
              message: {
                content:
                  "Bozza completa da verificare con i dati ufficiali della seduta e la firma dei responsabili.",
              },
            },
          ],
        }),
        { status: 200 },
      ),
  );
  const env = (key: string) =>
    ({
      SUPABASE_URL: "https://project.invalid",
      SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      BOARD_AI_API_KEY: "private-key",
      LIVEKIT_URL: "wss://room.invalid",
      LIVEKIT_API_KEY: "board-key",
      LIVEKIT_API_SECRET: "a".repeat(40),
    })[key];
  const request = (kind: "draft" | "transcribe", overrides = {}) =>
    new Request("https://edge.invalid", {
      method: "POST",
      headers: { Authorization: "Bearer session" },
      body: JSON.stringify({
        request_id: requestId,
        ...(kind === "draft" ? { meeting_id: meeting } : { track_id: track }),
        ...overrides,
      }),
    });
  return {
    user,
    db,
    client,
    env,
    fetcher,
    request,
    run: (kind: "draft" | "transcribe", overrides = {}) =>
      handleBoardAi(request(kind, overrides), kind, {
        env,
        client: client as unknown as Parameters<
          typeof handleBoardAi
        >[2]["client"],
        fetch: fetcher as typeof fetch,
      }),
  };
}
describe("AI trust boundaries and idempotency", () => {
  it.each(["draft", "transcribe"] as const)(
    "rejects missing or unreadable current authority for %s",
    async (kind) => {
      for (const options of [
        { chair: false, taker: false },
        { permissionError: true },
      ]) {
        const h = harness(options);
        expect((await h.run(kind)).status).toBe(403);
        expect(h.fetcher).not.toHaveBeenCalled();
      }
    },
  );
  it("reads complete context before requesting a paid draft", async () => {
    const h = harness({ contextError: true });
    expect((await h.run("draft")).status).toBe(409);
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(h.db.rpc).not.toHaveBeenCalled();
  });
  it("measures actual bytes rather than trusting the supplied duration, and does not pay twice", async () => {
    const h = harness();
    expect((await h.run("transcribe", { duration: 200000 })).status).toBe(200);
    expect(h.db.rpc).toHaveBeenCalledWith(
      "board_ai_reserve",
      expect.objectContaining({ _units: 1, _kind: "transcribe" }),
    );
    expect((await h.run("transcribe")).status).toBe(200);
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not call the provider on a missing or invalid audio file", async () => {
    for (const options of [
      { storageError: true },
      { audio: new Uint8Array(100) },
    ]) {
      const h = harness(options);
      expect((await h.run("transcribe")).status).toBe(409);
      expect(h.fetcher).not.toHaveBeenCalled();
    }
  });
  it("retains the failed job for the same request after a provider timeout", async () => {
    const h = harness();
    h.fetcher.mockRejectedValue(new Error("Timeout"));
    expect((await h.run("draft")).status).toBe(409);
    expect((await h.run("draft")).status).toBe(409);
    expect(h.fetcher).toHaveBeenCalledTimes(1);
    expect(h.db.rpc).toHaveBeenCalledWith(
      "board_ai_job_fail",
      expect.objectContaining({ _error: "Timeout" }),
    );
  });
});
describe("private audio/video token", () => {
  it("signs a short-lived room-scoped token with microphone and camera only", async () => {
    const h = harness();
    const response = await boardRoom(
      new Request("https://edge.invalid", {
        method: "POST",
        body: JSON.stringify({ meeting_id: meeting }),
      }),
      h.env,
      h.client as unknown as Parameters<typeof boardRoom>[2],
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    const token = await new TokenVerifier("board-key", "a".repeat(40)).verify(
      data.token,
    );
    expect(token.sub).toBe(actor);
    expect(token.video?.room).toBe(`board-${meeting}`);
    expect(token.video?.canPublishSources).toEqual(["microphone", "camera"]);
    expect(token.video?.canPublishData).toBe(false);
    expect(token.exp! - token.nbf!).toBeLessThanOrEqual(30);
    expect(JSON.stringify(data)).not.toContain("a".repeat(40));
  });
  it("does not issue a token after an authority read fails", async () => {
    const h = harness({ permissionError: true });
    expect(
      (
        await boardRoom(
          new Request("https://edge.invalid", {
            method: "POST",
            body: JSON.stringify({ meeting_id: meeting }),
          }),
          h.env,
          h.client as unknown as Parameters<typeof boardRoom>[2],
        )
      ).status,
    ).toBe(403);
  });
});
