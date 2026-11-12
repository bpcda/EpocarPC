import { beforeAll, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDossierZip, sha256, verifyDossierZip } from "../../setup/functions/board-dossier/zip";
import { archiveDossier, createDossier } from "../../setup/functions/board-dossier/archive";

const MEETING = "00000000-0000-4000-8000-000000000001";
const DOSSIER = "00000000-0000-4000-8000-000000000002";
const signedPath = `${MEETING}/verbale_firmato-00000000-0000-4000-8000-000000000003.pdf`;
const signed = new TextEncoder().encode("%PDF-1.7\nSigned test document\n%%EOF");
const snapshot = JSON.stringify({
  schema_version: 1,
  meeting: { id: MEETING, meeting_number: 1, meeting_year: 2026, scheduled_at: "2026-11-01T17:00:00Z", mode: "presenza", location: "Piacenza", started_at: "2026-11-01T17:00:00Z", ended_at: "2026-11-01T18:00:00Z" },
  participants: [{ display_name: "Anna Bianchi", kind: "member", board_roles: ["president"], present: true, attendance_mode: "presenza" }],
  agenda: [{ position: 1, title: "Programma", description: "Attività", proposal: null }],
  minutes: { current_version: 2, signed_path: signedPath, versions: [{ version: 1, body: "Prima bozza" }, { version: 2, body: "Verbale approvato" }] },
  deliberations: [{ number: 1, title: "../titolo non usato come percorso", status: "APPROVATA", current_version: 1, versions: [{ version: 1, body: "Testo deliberato" }] }],
  ballots: [{ id: "voto", result: "approvata", votes: [{ display_name: "Anna Bianchi", vote: "favorevole" }] }],
  recording_consents: [{ consented: true, notice_version: "v1" }],
  events: Array.from({ length: 1250 }, (_, id) => ({ id, action: "evento" })),
});
beforeAll(() => vi.stubGlobal("crypto", webcrypto));

describe("Fascicolo ZIP", () => {
  it("includes the signed original, current minutes, named votes and the entire register", async () => {
    const bytes = await buildDossierZip(snapshot, signed);
    await expect(verifyDossierZip(bytes, snapshot, await sha256(bytes))).resolves.toBeUndefined();
    const zip = await JSZip.loadAsync(bytes);
    expect(Array.from(await zip.file("Verbale_firmato.pdf")!.async("uint8array"))).toEqual(Array.from(signed));
    expect(await zip.file("03_Verbale.txt")!.async("string")).toContain("Verbale approvato");
    expect(await zip.file("03_Verbale.txt")!.async("string")).not.toContain("Prima bozza");
    expect(JSON.parse(await zip.file("06_Registro.json")!.async("string"))).toHaveLength(1250);
    expect(await zip.file("05_Votazioni.json")!.async("string")).toContain("Anna Bianchi");
    expect(Object.keys(zip.files).some((name) => /audio|trascrizion|\.\.\//.test(name))).toBe(false);
  });
  it("rejects a different ZIP hash, snapshot and a changed entry even with a recalculated ZIP hash", async () => {
    const bytes = await buildDossierZip(snapshot, signed);
    await expect(verifyDossierZip(bytes, snapshot, "0".repeat(64))).rejects.toThrow("Impronta");
    await expect(verifyDossierZip(bytes, snapshot + " ", await sha256(bytes))).rejects.toThrow("dati della seduta");
    const zip = await JSZip.loadAsync(bytes);
    zip.file("03_Verbale.txt", "Modified minutes");
    const changed = await zip.generateAsync({ type: "uint8array" });
    await expect(verifyDossierZip(changed, snapshot, await sha256(changed))).rejects.toThrow("non integro");
    const incomplete = await JSZip.loadAsync(bytes);
    incomplete.remove("03_Verbale.txt");
    const manifest = JSON.parse(await incomplete.file("manifest.json")!.async("string"));
    manifest.files = manifest.files.filter((entry: { path: string }) => entry.path !== "03_Verbale.txt");
    incomplete.file("manifest.json", JSON.stringify(manifest));
    const partial = await incomplete.generateAsync({ type: "uint8array" });
    await expect(verifyDossierZip(partial, snapshot, await sha256(partial))).rejects.toThrow("tutti gli atti");
  });
  it("rejects invalid signed documents and missing approved versions", async () => {
    await expect(buildDossierZip(snapshot, new Uint8Array([1, 2, 3]))).rejects.toThrow("PDF, JPEG o PNG valido");
    const data = JSON.parse(snapshot); data.minutes.current_version = 99;
    await expect(buildDossierZip(JSON.stringify(data), signed)).rejects.toThrow("Versione corrente");
    data.minutes.current_version = 2; data.deliberations[0].current_version = 99;
    await expect(buildDossierZip(JSON.stringify(data), signed)).rejects.toThrow("delibera 1 mancante");
  });
});

async function clients() {
  const bytes = await buildDossierZip(snapshot, signed);
  const dossier = { id: DOSSIER, meeting_id: MEETING, storage_path: `${MEETING}/fascicolo-${DOSSIER}.zip`, snapshot, sha256: await sha256(bytes), archived_at: null };
  let uploaded = bytes;
  const documents = {
    download: vi.fn(async (path: string) => ({ data: { arrayBuffer: async () => new Uint8Array(path === signedPath ? signed : uploaded).buffer }, error: null })),
    upload: vi.fn(async (_path: string, data: Uint8Array) => { uploaded = data; return { error: null }; }),
  };
  const audio = {
    list: vi.fn().mockResolvedValue({ data: [], error: null }),
    remove: vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null })),
  };
  const db = { storage: { from: vi.fn((bucket: string) => bucket === "board-documents" ? documents : audio) }, rpc: vi.fn().mockResolvedValue({ error: null }) };
  const user = {
    rpc: vi.fn(async (name: string) => ({ data: name === "board_dossier_prepare" ? { snapshot, revision: "revision", signed_path: signedPath } : DOSSIER, error: null })),
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ single: async () => ({ data: dossier, error: null }) }) }) })),
  };
  return { db: db as unknown as SupabaseClient, user: user as unknown as SupabaseClient, documents, audio, dossier, dbRpc: db.rpc, userRpc: user.rpc };
}

describe("Archive orchestration", () => {
  it("reads back and verifies uploaded bytes before registering the dossier", async () => {
    const c = await clients();
    expect(await createDossier(c.db, c.user, MEETING)).toBe(DOSSIER);
    expect(c.documents.download).toHaveBeenCalledTimes(2);
    expect(c.userRpc).toHaveBeenLastCalledWith("board_dossier_register", expect.objectContaining({ _meeting: MEETING, _revision: "revision" }));
  });
  it("does not register a corrupt storage upload", async () => {
    const c = await clients();
    c.documents.download.mockResolvedValueOnce({ data: { arrayBuffer: async () => signed.buffer }, error: null })
      .mockResolvedValueOnce({ data: { arrayBuffer: async () => new Uint8Array([1]).buffer }, error: null });
    await expect(createDossier(c.db, c.user, MEETING)).rejects.toThrow("Impronta");
    expect(c.userRpc).not.toHaveBeenCalledWith("board_dossier_register", expect.anything());
  });
  it("refuses cleanup without explicit verification or with a corrupt dossier", async () => {
    const c = await clients();
    await expect(archiveDossier(c.db, c.user, DOSSIER, false)).rejects.toThrow("Confermare");
    expect(c.user.from).not.toHaveBeenCalled();
    c.dossier.sha256 = "0".repeat(64);
    await expect(archiveDossier(c.db, c.user, DOSSIER, true)).rejects.toThrow("Impronta");
    expect(c.audio.remove).not.toHaveBeenCalled(); expect(c.dbRpc).not.toHaveBeenCalled();
  });
  it("does not touch audio when the server refuses archiving", async () => {
    const c = await clients();
    c.userRpc.mockResolvedValueOnce({ data: null, error: { message: "fascicolo superato" } });
    await expect(archiveDossier(c.db, c.user, DOSSIER, true)).rejects.toThrow("fascicolo superato");
    expect(c.audio.list).not.toHaveBeenCalled(); expect(c.dbRpc).not.toHaveBeenCalled();
  });
  it("removes every page without skipping shifted offsets and completes only after storage is empty", async () => {
    const c = await clients();
    const files = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `file-${i}`, name: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}.webm` }));
    c.audio.list.mockResolvedValueOnce({ data: files(100), error: null }).mockResolvedValueOnce({ data: files(2), error: null }).mockResolvedValueOnce({ data: [], error: null });
    await archiveDossier(c.db, c.user, DOSSIER, true);
    expect(c.audio.remove.mock.calls.map(([paths]) => paths.length)).toEqual([100, 2]);
    expect(c.audio.list).toHaveBeenCalledTimes(3);
    expect(c.dbRpc).toHaveBeenCalledWith("board_dossier_finish_archive", { _dossier: DOSSIER });
  });
  it("keeps transcripts in the database if storage deletion fails or an unexpected object appears", async () => {
    const c = await clients();
    c.audio.list.mockResolvedValue({ data: [{ id: "track", name: `${DOSSIER}.webm` }], error: null });
    c.audio.remove.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(archiveDossier(c.db, c.user, DOSSIER, true)).rejects.toThrow("storage unavailable");
    expect(c.dbRpc).not.toHaveBeenCalled();
    c.audio.list.mockResolvedValue({ data: [{ id: null, name: "unexpected-folder" }], error: null });
    await expect(archiveDossier(c.db, c.user, DOSSIER, true)).rejects.toThrow("File audio inatteso");
    expect(c.dbRpc).not.toHaveBeenCalled();
  });
});
