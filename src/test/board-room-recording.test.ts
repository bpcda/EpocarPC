import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomEvent, Track, type Room } from "livekit-client";
import { roomRecordingSource } from "@/lib/board-room-recording";

afterEach(() => vi.unstubAllGlobals());
describe("recording the published room audio", () => {
  it("mixes authorised local and remote microphones, follows mute and leaves call tracks alive", async () => {
    const nodes: { gain: { value: number }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
    const node = () => ({ gain: { value: 1 }, connect: vi.fn(function (target) { return target; }), disconnect: vi.fn() });
    const outputStop = vi.fn(), localStop = vi.fn(), remoteStop = vi.fn();
    class Context {
      createMediaStreamDestination() { return { stream: { getTracks: () => [{ stop: outputStop }] } }; }
      createMediaStreamSource() { return node(); }
      createGain() { const n = node(); nodes.push(n); return n; }
      resume = async () => {};
      close = async () => {};
    }
    vi.stubGlobal("AudioContext", Context);
    vi.stubGlobal("MediaStream", class { constructor(public tracks: unknown[]) {} });
    const publication = (stop: () => void) => ({ isMuted: false, source: Track.Source.Microphone, track: { mediaStreamTrack: { enabled: true, muted: false, readyState: "live", stop } } });
    const local = publication(localStop), remote = publication(remoteStop), denied = publication(vi.fn());
    const callbacks = new Map<string, Set<() => void>>();
    const room = { state: "connected", localParticipant: { identity: "local", audioTrackPublications: new Map([["l", local]]) },
      remoteParticipants: new Map([["r", { identity: "remote", audioTrackPublications: new Map([["r", remote]]) }], ["d", { identity: "no-consent", audioTrackPublications: new Map([["d", denied]]) }]]),
      on(event: string, fn: () => void) { if (!callbacks.has(event)) callbacks.set(event, new Set()); callbacks.get(event)!.add(fn); return this; },
      off(event: string, fn: () => void) { callbacks.get(event)?.delete(fn); return this; },
    };
    const interrupted = vi.fn();
    const source = await roomRecordingSource(room as unknown as Room, ["local", "remote"], interrupted);
    try {
      expect(nodes).toHaveLength(2);
      local.isMuted = true;
      callbacks.get(RoomEvent.TrackMuted)!.forEach(fn => fn());
      expect(nodes[0].gain.value).toBe(0); expect(nodes[1].gain.value).toBe(1);
      callbacks.get(RoomEvent.Reconnecting)!.forEach(fn => fn());
      expect(interrupted).toHaveBeenCalledOnce();
    } finally { source.close(); }
    expect(outputStop).toHaveBeenCalledOnce();
    expect(localStop).not.toHaveBeenCalled(); expect(remoteStop).not.toHaveBeenCalled();
    expect([...callbacks.values()].every(set => set.size === 0)).toBe(true);
  });
});
