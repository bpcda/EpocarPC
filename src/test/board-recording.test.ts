// @vitest-environment node
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BoardRecorder,
  localRecordings,
  localRecordingBlob,
  removeLocalRecording,
  saveLocalChunk,
  saveLocalRecording,
  type LocalRecording,
} from "@/lib/board-recording";
class Recorder {
  static last: Recorder;
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: (e: { data: Blob }) => void = () => {};
  onstop = () => {};
  onerror = () => {};
  constructor() {
    Recorder.last = this;
  }
  start() {
    this.state = "recording";
  }
  pause() {
    this.state = "paused";
  }
  resume() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable({ data: new Blob(["audio"]) });
    queueMicrotask(() => this.onstop());
  }
}
const record = (): LocalRecording => ({
  id: crypto.randomUUID(),
  userId: "alice",
  meetingId: "meeting",
  mime: "audio/webm",
  seconds: 1,
  bytes: 0,
  created: new Date().toISOString(),
});
afterEach(() => vi.unstubAllGlobals());
describe("recoverable board recording", () => {
  it("recovers ordered chunks after reload and keeps accounts and meetings separate", async () => {
    const r = record();
    await saveLocalRecording(r);
    await saveLocalChunk(r.id, 1, new Blob(["second"]));
    await saveLocalChunk(r.id, 0, new Blob(["first"]));
    expect(
      (await localRecordings("alice", "meeting")).map((v) => v.id),
    ).toContain(r.id);
    expect(await localRecordings("bob", "meeting")).toEqual([]);
    expect(await (await localRecordingBlob(r)).text()).toBe("firstsecond");
    await removeLocalRecording(r.id);
    expect(
      (await localRecordings("alice", "meeting")).map((v) => v.id),
    ).not.toContain(r.id);
  });
  it("releases the microphone and saves the final chunk on an ordinary or automatic stop", async () => {
    vi.stubGlobal("MediaRecorder", Recorder);
    const release = vi.fn();
    const r = record();
    const recorder = new BoardRecorder(
      { getTracks: () => [{ stop: release }] } as unknown as MediaStream,
      r,
      vi.fn(),
    );
    await recorder.start();
    recorder.pause();
    recorder.resume();
    await recorder.stop();
    expect(release).toHaveBeenCalled();
    expect(await (await localRecordingBlob(r)).text()).toBe("audio");
    await removeLocalRecording(r.id);
  });
});
