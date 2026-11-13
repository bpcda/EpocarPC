// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import postgres, { type Sql } from "postgres";

const available =
  !spawnSync("initdb", ["--version"]).error &&
  !spawnSync("psql", ["--version"]).error;
const uid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
describe.skipIf(!available)("Board post-meeting review and scoped worker", () => {
    let db: Sql,
      dir: string,
      started = false;
    const root = process.getuid?.() === 0;
    const pg = (name: string, args: string[]) =>
      root
        ? execFileSync("runuser", ["-u", "nobody", "--", name, ...args], {
            stdio: "pipe",
          })
        : execFileSync(name, args, { stdio: "pipe" });
    const as = (user: string, q: string) =>
      db.begin(async (tx) => {
        await tx.unsafe(
          `SET LOCAL ROLE authenticated; SET LOCAL app.uid=${quote(user)}`,
        );
        return tx.unsafe(q);
      });
    const scalar = async (user: string, q: string) =>
      Object.values((await as(user, q))[0])[0];
    const meeting = async (present = [1, 2, 3, 6, 7], guests: {name:string}[] = []) => {
      const payload = {
        scheduled_at: "2026-11-20T17:00:00Z",
        mode: "presenza",
        location: "Piacenza",
        guests,
      minute_taker_id: uid(2),
        agenda: [{ title: "Attività", kind: "deliberazione" }],
      };
      const m = String(
        await scalar(
          uid(1),
          `SELECT board_save_meeting(NULL,${quote(JSON.stringify(payload))}::jsonb)`,
        ),
      );
      await as(
        uid(1),
        `SELECT board_set_status('${m}','CONVOCATO'); SELECT board_session_action('${m}','open')`,
      );
      for (const n of present)
        await as(
          uid(2),
          `SELECT board_attendance_set('${m}',id,true,'presenza',true,'Identità verificata') FROM board_meeting_participants WHERE meeting_id='${m}' AND user_id='${uid(n)}'`,
        );
      return m;
    };
    const sign = async (m: string, n: string) => {
      const path = `${m}/verbale_firmato-${crypto.randomUUID()}.pdf`;
      await db.unsafe(
        `INSERT INTO storage.objects(bucket_id,name) VALUES ('board-documents','${path}')`,
      );
      await as(uid(1), `SELECT board_minutes_signed('${n}','${path}')`);
      return path;
    };
    beforeAll(async () => {
      dir = mkdtempSync(join(tmpdir(), "epocar-board-phases-"));
      if (root) chmodSync(dir, 0o777);
      pg("initdb", [
        "-D",
        join(dir, "data"),
        "-A",
        "trust",
        "--no-locale",
        "-E",
        "UTF8",
      ]);
      pg("pg_ctl", [
        "-D",
        join(dir, "data"),
        "-l",
        join(dir, "log"),
        "-o",
        `-k ${dir} -p 55469 -h ''`,
        "-w",
        "start",
      ]);
      started = true;
      db = postgres({
        host: dir,
        port: 55469,
        username: root ? "nobody" : userInfo().username,
        database: "postgres",
        max: 1,
        onnotice: () => {},
      });
      await db.unsafe(
        readFileSync("src/test/fixtures/board-schema.sql", "utf8"),
      );
      for (const v of [
        15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 27, 28,
      ])
        await db.unsafe(readFileSync(`setup/board-v${v}.sql`, "utf8"));
      await db.unsafe('GRANT EXECUTE ON FUNCTION public.board_audio_track_update_service(uuid,text,jsonb,text) TO authenticated');
      await db.unsafe(readFileSync('setup/board-v25-permissions.sql','utf8'));
      expect(await db`SELECT has_function_privilege('authenticated','public.board_audio_track_update_service(uuid,text,jsonb,text)','EXECUTE') AS allowed`.then(rows=>rows[0].allowed)).toBe(false);
      await db.unsafe(
        `INSERT INTO user_roles VALUES ('${uid(6)}','vice_president'),('${uid(7)}','councillor'),('${uid(8)}','councillor'),('${uid(9)}','councillor')`,
      );
    }, 60000);
    afterAll(async () => {
      await db?.end();
      if (started)
        pg("pg_ctl", ["-D", join(dir, "data"), "-m", "immediate", "stop"]);
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    const service = async (sql: string) => db.begin(async tx => {
      await tx.unsafe("SET LOCAL ROLE service_role; SET LOCAL app.role='service_role'");
      return Object.values((await tx.unsafe(sql))[0])[0];
    });
    const queued = async () => {
      const m = await meeting();
      const token = String(await scalar(uid(1),`SELECT board_document_worker_register('${m}')`));
      const worker = String(await service(`SELECT board_document_worker_auth('${token}')`));
      await as(uid(1),`SELECT board_session_action('${m}','close')`);
      const id = String(await scalar(uid(1),`SELECT board_documents_request('${m}','Appunti manuali verificati: nessuna registrazione in questa seduta sintetica')`));
      return {m,token,worker,id};
    };
    it("closes normally before drafting, allows later review and suggestions, never opens a late ballot", async () => {
      const m = await meeting();
      await as(uid(1),`SELECT board_session_action('${m}','close')`);
      const n=String(await scalar(uid(2),`SELECT board_minutes_save('${m}','Testo redatto dopo la chiusura','manuale')`));
      await as(uid(3),`SELECT board_minutes_rectify('${n}','Suggerimento del consigliere dopo la chiusura')`);
      await as(uid(2),`SELECT board_minutes_save_document('${n}','Testo revisionato dopo la chiusura','manuale')`);
      await expect(as(uid(1),`SELECT board_minutes_submit_vote('${n}')`)).rejects.toThrow(/non è in corso/);
      expect(await scalar(uid(1),`SELECT status FROM board_minutes WHERE id='${n}'`)).toBe('BOZZA');
      await sign(m,n);
      await expect(as(uid(2),`SELECT board_minutes_save_document('${n}','Modifica successiva alla firma','manuale')`)).rejects.toThrow(/sottoscritto|chiuso/);
      await expect(as(uid(3),`SELECT board_minutes_rectify('${n}','Suggerimento dopo la firma')`)).rejects.toThrow(/definitivo/);
    });
    it("does not invalidate a draft on heartbeat, but rejects changed official text", async () => {
      const m=await meeting();
      const n=String(await scalar(uid(1),`SELECT board_minutes_save('${m}','Testo iniziale','manuale')`));
      const before=await scalar(uid(1),`SELECT board_ai_context('${m}','${n}')`) as {hash:string};
      await as(uid(1),`SELECT board_heartbeat('${m}')`);
      const after=await scalar(uid(1),`SELECT board_ai_context('${m}','${n}')`) as {hash:string};
      expect(after.hash).toBe(before.hash);
      await as(uid(2),`SELECT board_minutes_save_document('${n}','Testo ufficiale modificato','manuale')`);
      expect((await scalar(uid(1),`SELECT board_ai_context('${m}','${n}')`) as {hash:string}).hash).not.toBe(before.hash);
    });
    it("generates a meeting-specific internal link without manual input", async () => {
      const payload={scheduled_at:'2026-11-22T18:00:00Z',mode:'remoto',minute_taker_id:uid(2),agenda:[{title:'Punto',kind:'discussione'}]};
      const m=String(await scalar(uid(1),`SELECT board_save_meeting(NULL,${quote(JSON.stringify(payload))}::jsonb)`));
      expect(await scalar(uid(1),`SELECT video_link FROM board_meetings WHERE id='${m}'`)).toBe(`https://epocarpc.com/consiglio-direttivo?seduta=${m}`);
    });
    it("scopes credentials, deduplicates requests and leases, accepts only a draft", async () => {
      const {m,worker,id}=await queued();
      expect(await scalar(uid(1),`SELECT board_documents_request('${m}','Copertura confermata nuovamente')`)).toBe(id);
      await expect(as(uid(5),`SELECT board_document_worker_register('${m}')`)).rejects.toThrow(/solo/);
      await expect(as(uid(1),`SELECT board_documents_claim('${worker}')`)).rejects.toThrow(/permission/);
      await expect(service(`SELECT board_document_worker_auth('${'0'.repeat(64)}')`)).rejects.toThrow(/non autorizzata/);
      const job=await service(`SELECT board_documents_claim('${worker}')`) as {id:string;lease_id:string;minutes_id:string};
      expect(job.id).toBe(id);
      expect(await service(`SELECT board_documents_claim('${worker}')`)).toBeNull();
      await expect(service(`SELECT board_documents_progress('${worker}','${id}','${crypto.randomUUID()}','drafting')`)).rejects.toThrow(/non disponibile/);
      const next=await service(`SELECT board_documents_progress('${worker}','${id}','${job.lease_id}','drafting')`) as {status:string};
      expect(next.status).toBe('drafting');
      const body='Bozza del verbale da revisionare, redatta dai dati ufficiali senza inventare approvazioni o votazioni.';
      await service(`SELECT board_documents_progress('${worker}','${id}','${job.lease_id}','complete',NULL,NULL,${quote(body)},'[]')`);
      expect(await scalar(uid(1),`SELECT status FROM board_document_jobs WHERE id='${id}'`)).toBe('ready');
      expect(await scalar(uid(1),`SELECT status FROM board_minutes WHERE id='${job.minutes_id}'`)).toBe('BOZZA');
      expect(await scalar(uid(1),`SELECT count(*) FROM board_ballots WHERE meeting_id='${m}'`)).toBe('0');
      expect(await service(`SELECT board_documents_progress('${worker}','${id}','${job.lease_id}','complete',NULL,NULL,${quote(body)},'[]')`)).toEqual({status:'ready'});
    });
    it("waits for uploads and complete transcripts, then imports shared speech without invented speakers", async () => {
      const m=await meeting();
      await as(uid(1),`SELECT board_recording_consent_set('${m}',true,'v2-codex')`);
      const participant=String(await scalar(uid(1),`SELECT id FROM board_meeting_participants WHERE meeting_id='${m}' AND user_id='${uid(1)}'`));
      const token=String(await scalar(uid(1),`SELECT board_document_worker_register('${m}')`));
      const worker=String(await service(`SELECT board_document_worker_auth('${token}')`));
      const track=String(await scalar(uid(1),`SELECT board_audio_track_start_with_participants('${m}','shared',ARRAY['${participant}']::uuid[],'Consenso sintetico verificato')`));
      await expect(as(uid(1),`SELECT board_documents_request('${m}','Copertura verificata')`)).rejects.toThrow(/registrazioni/);
      await db.unsafe(`INSERT INTO storage.objects(bucket_id,name) VALUES ('board-audio','${m}/${track}.webm')`);
      await as(uid(1),`SELECT board_audio_track_finish('${track}','${m}/${track}.webm',60)`);
      await as(uid(1),`SELECT board_session_action('${m}','close')`);
      const id=String(await scalar(uid(1),`SELECT board_documents_request('${m}','Copertura verificata con traccia condivisa')`));
      const job=await service(`SELECT board_documents_claim('${worker}')`) as {lease_id:string};
      await expect(service(`SELECT board_documents_progress('${worker}','${id}','${job.lease_id}','drafting')`)).rejects.toThrow(/incomplete/);
      const segments=[{start:0,end:5,text:'Intervento trascritto senza attribuzione certa',speaker:null,attribution:'non_attribuita'}];
      const invalid=[{...segments[0],speaker:'Nome inventato',attribution:'verificata'}];
      await expect(service(`SELECT board_documents_progress('${worker}','${id}','${job.lease_id}','transcript','${track}',${quote(JSON.stringify(invalid))}::jsonb)`)).rejects.toThrow(/attribuzione/);
      await service(`SELECT board_documents_progress('${worker}','${id}','${job.lease_id}','transcript','${track}',${quote(JSON.stringify(segments))}::jsonb)`);
      const stage=await service(`SELECT board_documents_progress('${worker}','${id}','${job.lease_id}','drafting')`) as {status:string;context:{transcripts:unknown[]}};
      expect(stage.status).toBe('drafting');expect(stage.context.transcripts).toHaveLength(1);
      await service(`SELECT board_documents_progress('${worker}','${id}','${job.lease_id}','complete',NULL,NULL,'Bozza completa da revisionare: intervento riportato senza attribuzione certa e senza inventare votazioni.','[]')`);
      expect(await scalar(uid(1),`SELECT status FROM board_document_jobs WHERE id='${id}'`)).toBe('ready');
    });
    it("preserves stale output and rejects a revoked worker", async () => {
      const {m,worker,id,token}=await queued();
      const job=await service(`SELECT board_documents_claim('${worker}')`) as {lease_id:string;minutes_id:string};
      await service(`SELECT board_documents_progress('${worker}','${id}','${job.lease_id}','drafting')`);
      await as(uid(2),`SELECT board_minutes_save('${m}','Nuovo testo del verbalizzante','manuale')`);
      const body='Risultato obsoleto da conservare separatamente senza sovrascrivere il nuovo testo del verbalizzante.';
      expect(await service(`SELECT board_documents_progress('${worker}','${id}','${job.lease_id}','complete',NULL,NULL,${quote(body)},'[]')`)).toEqual({status:'stale'});
      expect(await scalar(uid(1),`SELECT result FROM board_document_jobs WHERE id='${id}'`)).toBe(body);
      await as(uid(1),'SELECT board_document_worker_revoke()');
      await expect(service(`SELECT board_document_worker_auth('${token}')`)).rejects.toThrow(/non autorizzata/);
    });
});
