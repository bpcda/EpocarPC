// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { boardWorker } from "../../setup/functions/board-worker/handler";
const id = "00000000-0000-4000-8000-000000000001";
function harness(authorized = true) {
  const rpc = vi.fn(async (name: string) => ({ data: name === "board_document_worker_auth" ? authorized ? id : null : name === "board_documents_claim" ? { id, tracks: [{ id, storage_path: "allowed.webm" }] } : { status: "ready" }, error: null }));
  const download = vi.fn(async () => ({ data: new Blob(["audio"]), error: null }));
  const client = (() => ({ rpc, storage: { from: () => ({ download }) } })) as unknown as Parameters<typeof boardWorker>[2];
  const run = (body: unknown, token = "a".repeat(64)) => boardWorker(new Request("https://edge.invalid", { method: "POST", headers: { "x-board-worker-token": token }, body: JSON.stringify(body) }), () => "private", client);
  return { run, rpc, download };
}
describe("scoped board worker endpoint", () => {
  it("rejects absent, expired or malformed credentials before exposing a job", async () => {
    const h = harness(); expect((await h.run({ action: "claim" }, "invalid")).status).toBe(401); expect(h.rpc).not.toHaveBeenCalled();
    const revoked = harness(false); expect((await revoked.run({ action: "claim" })).status).toBe(401);
    expect(revoked.rpc).toHaveBeenCalledTimes(1);
  });
  it("downloads only an audio source included in a valid job lease", async () => {
    const h = harness();
    expect((await h.run({ action: "audio", job_id: id, lease_id: id, track_id: id })).status).toBe(200);
    expect(h.download).toHaveBeenCalledWith("allowed.webm");
    expect((await h.run({ action: "audio", job_id: id, lease_id: id, track_id: "00000000-0000-4000-8000-000000000002" })).status).toBe(403);
    expect(h.download).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed result notes and identifiers", async () => {
    const h = harness();
    expect((await h.run({ action: "complete", job_id: id, lease_id: id, body: "draft", notes: [{}] })).status).toBe(422);
    expect((await h.run({ action: "complete", job_id: "foreign", lease_id: id })).status).toBe(422);
    expect(h.rpc.mock.calls.filter(([name]) => name === "board_documents_progress")).toHaveLength(0);
  });
});
