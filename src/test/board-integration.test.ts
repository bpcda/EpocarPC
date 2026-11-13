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
describe.skipIf(!available)(
  "Board remaining phases on native PostgreSQL",
  () => {
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
        `-k ${dir} -p 55460 -h ''`,
        "-w",
        "start",
      ]);
      started = true;
      db = postgres({
        host: dir,
        port: 55460,
        username: root ? "nobody" : userInfo().username,
        database: "postgres",
        max: 1,
        onnotice: () => {},
      });
      await db.unsafe(
        readFileSync("src/test/fixtures/board-schema.sql", "utf8"),
      );
      for (const v of [
        15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 23, 24, 25, 26,
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

    it("signs and archives a no-quorum report without inventing approval, then corrects it in a new meeting", async () => {
      const a = await meeting([1, 2]);
      await as(
        uid(1),
        `SELECT board_session_action('${a}','close','Quorum non raggiunto')`,
      );
      const original = String(
        await scalar(
          uid(1),
          `SELECT board_minutes_save('${a}','Resoconto senza quorum','manuale')`,
        ),
      );
      const previousPath=await sign(a,original);
    const path = await sign(a, original);
    await as(uid(1),`DELETE FROM storage.objects WHERE name='${previousPath}'`);
    expect(await scalar(uid(1),`SELECT count(*) FROM storage.objects WHERE name='${previousPath}'`)).toBe("1");
      expect(
        await scalar(
          uid(1),
          `SELECT status FROM board_minutes WHERE id='${original}'`,
        ),
      ).toBe("BOZZA");
      await expect(
        as(
          uid(1),
          `SELECT board_minutes_save('${a}','Modifica silenziosa','manuale')`,
        ),
      ).rejects.toThrow(/sottoscritto|chiuso/);
      const prepared = (await scalar(
        uid(1),
        `SELECT board_dossier_prepare('${a}')`,
      )) as { revision: string; snapshot: string };
      const zip = `${a}/fascicolo-${crypto.randomUUID()}.zip`;
      await db.unsafe(
        `INSERT INTO storage.objects(bucket_id,name) VALUES ('board-documents','${zip}')`,
      );
      const dossier = String(
        await scalar(
          uid(1),
          `SELECT board_dossier_register('${a}','${prepared.revision}','${zip}','${"a".repeat(64)}')`,
        ),
      );
      await as(uid(1), `SELECT board_dossier_begin_archive('${dossier}')`);
      await db.begin(async (tx) => {
        await tx.unsafe(
          "SET LOCAL ROLE service_role; SET LOCAL app.role='service_role'",
        );
        await tx.unsafe(`SELECT board_dossier_finish_archive('${dossier}')`);
      });
      const proposal = String(
        await scalar(
          uid(3),
          `SELECT board_correction_propose('${original}','Resoconto rettificato','Correzione di un intervento')`,
        ),
      );
      const b = await meeting([1, 2, 3]);
      const corrected = String(
        await scalar(
          uid(2),
          `SELECT board_correction_adopt('${proposal}','${b}')`,
        ),
      );
      expect(
        await scalar(
          uid(1),
          `SELECT board_correction_adopt('${proposal}','${b}')`,
        ),
      ).toBe(corrected);
      await expect(
        as(uid(1), `SELECT board_minutes_submit_vote('${corrected}')`),
      ).rejects.toThrow(/quorum/);
      await as(
        uid(2),
        `SELECT board_attendance_set('${b}',id,true,'presenza',true,'Identità verificata') FROM board_meeting_participants WHERE meeting_id='${b}' AND user_id='${uid(6)}'`,
      );
      const ballot = String(
        await scalar(
          uid(1),
          `SELECT board_minutes_submit_vote('${corrected}')`,
        ),
      );
      for (const n of [1, 2, 3])
        await as(uid(n), `SELECT board_ballot_vote('${ballot}','favorevole')`);
      await as(uid(1), `SELECT board_ballot_close('${ballot}')`);
      const signature = await sign(b, corrected);
      expect(signature).not.toBe(path);
      expect(
        await scalar(
          uid(1),
          `SELECT status FROM board_minutes WHERE id='${corrected}'`,
        ),
      ).toBe("APPROVATO");
      expect(
        await scalar(
          uid(1),
          `SELECT signed_path FROM board_minutes WHERE id='${original}'`,
        ),
      ).toBe(path);
      expect(
        await scalar(
          uid(1),
          `SELECT snapshot FROM board_dossiers WHERE id='${dossier}'`,
        ),
      ).toBe(prepared.snapshot);
      expect(
        await scalar(
          uid(1),
          `SELECT count(*) FROM board_minute_versions WHERE minutes_id='${original}'`,
        ),
      ).toBe("1");
      await expect(
        as(
          uid(5),
          `SELECT board_correction_propose('${original}','Testo','Motivo')`,
        ),
      ).rejects.toThrow(/not authorized/);
    });
    const service = async (q: string) =>
      db.begin(async (tx) => {
        await tx.unsafe(
          "SET LOCAL ROLE service_role; SET LOCAL app.role='service_role'",
        );
        return Object.values((await tx.unsafe(q))[0] ?? {})[0];
      });
    const consent = async (m: string, n: number, value = true) =>
      as(uid(n), `SELECT board_recording_consent_set('${m}',${value},'v1')`);
    const track = async (m: string, n: number) =>
      String(
        await scalar(
          uid(n),
          `SELECT board_audio_track_start('${m}','individual')`,
        ),
      );
    const upload = async (m: string, t: string, n: number) => {
      await db.unsafe(
        `INSERT INTO storage.objects(bucket_id,name) VALUES ('board-audio','${m}/${t}.webm')`,
      );
      await as(
        uid(n),
        `SELECT board_audio_track_finish('${t}','${m}/${t}.webm',1)`,
      );
    };
    it("requires explicit shared scope and current consent, and invalidates a recording lease permanently on revocation or suspension", async () => {
      const m = await meeting();
      await consent(m, 1);
      await consent(m, 2);
      await expect(
        as(uid(1), `SELECT board_audio_track_start('${m}','shared')`),
      ).rejects.toThrow(/attestazione|indicare/);
      const t = await track(m, 1);
      expect(await scalar(uid(1), `SELECT board_recording_lease('${t}')`)).toBe(
        true,
      );
      await consent(m, 1, false);
      await consent(m, 1);
      expect(await scalar(uid(1), `SELECT board_recording_lease('${t}')`)).toBe(
        false,
      );
      const next = await track(m, 1);
      await as(uid(1), `SELECT board_session_action('${m}','suspend','Pausa')`);
      await as(uid(1), `SELECT board_session_action('${m}','resume')`);
      expect(
        await scalar(uid(1), `SELECT board_recording_lease('${next}')`),
      ).toBe(false);
      const p = String(
        await scalar(
          uid(1),
          `SELECT id FROM board_meeting_participants WHERE meeting_id='${m}' AND user_id='${uid(2)}'`,
        ),
      );
      await expect(
        as(
          uid(3),
          `SELECT board_guest_consent_set('${m}','${p}',true,'Consenso esplicito')`,
        ),
      ).rejects.toThrow();
      await expect(
        as(
          uid(1),
          `UPDATE board_recording_consents SET consented=false WHERE meeting_id='${m}'`,
        ),
      ).rejects.toThrow(/permission/);
      await as(
        uid(1),
        `SELECT board_audio_track_abort('${t}','Avvio annullato')`,
      );
      expect(
        await scalar(
          uid(1),
          `SELECT count(*) FROM board_audio_tracks WHERE id='${t}'`,
        ),
      ).toBe("0");
      await upload(m, next, 1);
      await as(
        uid(1),
        `SELECT board_audio_track_finish('${next}','${m}/${next}.webm',1)`,
      );
    });
    it("records an identified guest's explicit consent and requires every included person for a shared track",async()=>{
    const m=await meeting([1,2],[{name:"Ospite"}]);await consent(m,1);
    await as(uid(2),`SELECT board_attendance_set('${m}',id,true,'presenza',true,'Documento verificato') FROM board_meeting_participants WHERE meeting_id='${m}' AND kind='guest'`);
    const guest=String(await scalar(uid(1),`SELECT id FROM board_meeting_participants WHERE meeting_id='${m}' AND kind='guest'`));
    const member=String(await scalar(uid(1),`SELECT id FROM board_meeting_participants WHERE meeting_id='${m}' AND user_id='${uid(1)}'`));
    const start=`SELECT board_audio_track_start_with_participants('${m}','shared',ARRAY['${guest}','${member}']::uuid[],'Consensi acquisiti prima della registrazione condivisa')`;
    await expect(as(uid(1),start)).rejects.toThrow(/consenso/);
    await as(uid(1),`SELECT board_guest_consent_set('${m}','${guest}',true,'Informativa v1 letta e consenso esplicito ricevuto')`);
    const t=String(await scalar(uid(1),start));expect(await scalar(uid(1),`SELECT jsonb_array_length(consent_snapshot) FROM board_audio_tracks WHERE id='${t}'`)).toBe(2);
    expect(await scalar(uid(1),`SELECT board_recording_lease('${t}')`)).toBe(true);
    await as(uid(2),`SELECT board_guest_consent_set('${m}','${guest}',false,'Ospite revoca esplicitamente il consenso')`);
    expect(await scalar(uid(1),`SELECT board_recording_lease('${t}')`)).toBe(false);
  });
  it("reserves a cumulative budget atomically, measures duration server side and keeps failed started estimates", async () => {
      const m = await meeting();
      for (const n of [1, 2]) await consent(m, n);
      const t1 = await track(m, 1),
        t2 = await track(m, 2);
      await upload(m, t1, 1);
      await upload(m, t2, 2);
      await db.unsafe(
        "UPDATE board_ai_settings SET enabled=true,cost_per_min_eur=0.06,max_cost_eur=0.06,draft_input_per_million_eur=1,draft_output_per_million_eur=1",
      );
      const request = crypto.randomUUID();
      const reserve = (t: string, id: string) =>
        `SELECT board_ai_reserve('${id}','transcribe','${t}','${uid(1)}',60,0,'${"a".repeat(64)}')`;
      const job = (await service(reserve(t1, request))) as {
        id: string;
        existing: boolean;
      };
      expect(job.existing).toBe(false);
      expect(
        ((await service(reserve(t1, request))) as { existing: boolean })
          .existing,
      ).toBe(true);
      await expect(service(reserve(t2, crypto.randomUUID()))).rejects.toThrow(
        /complessivo/,
      );
      expect(
        await scalar(
          uid(1),
          `SELECT duration_seconds FROM board_audio_tracks WHERE id='${t1}'`,
        ),
      ).toBe(60);
      await expect(
        as(uid(1), `SELECT board_ai_job_begin('${job.id}')`),
      ).rejects.toThrow(/permission/);
      expect(await service(`SELECT board_ai_job_begin('${job.id}')`)).toBe(
        true,
      );
      expect(await service(`SELECT board_ai_job_begin('${job.id}')`)).toBe(
        false,
      );
      await service(
        `SELECT board_ai_job_fail('${job.id}','Timeout dopo invio')`,
      );
      const usage = (await scalar(uid(1), `SELECT board_ai_usage('${m}')`)) as {
        reserved: string;
      };
      expect(Number(usage.reserved)).toBe(0.06);
      await expect(service(reserve(t2, crypto.randomUUID()))).rejects.toThrow(
        /complessivo/,
      );
    });
    it("serializes simultaneous budget reservations from two independent connections", async () => {
      const m = await meeting();
      await consent(m, 1);
      await consent(m, 2);
      const t1 = await track(m, 1),
        t2 = await track(m, 2);
      await upload(m, t1, 1);
      await upload(m, t2, 2);
      await db.unsafe(
        "UPDATE board_ai_settings SET enabled=true,cost_per_min_eur=0.06,max_cost_eur=0.06",
      );
      const sessions = [1, 2].map(() =>
        postgres({
          host: dir,
          port: 55460,
          username: root ? "nobody" : userInfo().username,
          database: "postgres",
          max: 1,
          onnotice: () => {},
        }),
      );
      try {
        const result = await Promise.allSettled(
          sessions.map((connection, i) =>
            connection.begin(async (tx) => {
              await tx.unsafe(
                "SET LOCAL ROLE service_role; SET LOCAL app.role='service_role'",
              );
              return tx.unsafe(
                `SELECT board_ai_reserve('${crypto.randomUUID()}','transcribe','${[t1, t2][i]}','${uid(1)}',60,0,'${"a".repeat(64)}')`,
              );
            }),
          ),
        );
        expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect(result.filter((r) => r.status === "rejected")).toHaveLength(1);
        expect(
          Number(
            (
              (await scalar(uid(1), `SELECT board_ai_usage('${m}')`)) as {
                reserved: string;
              }
            ).reserved,
          ),
        ).toBe(0.06);
      } finally {
        await Promise.all(sessions.map((c) => c.end()));
      }
    });
    it("does not overwrite text edited while the AI draft was being generated", async () => {
      const m = await meeting();
      const n = String(
        await scalar(
          uid(1),
          `SELECT board_minutes_save('${m}','Testo iniziale','manuale')`,
        ),
      );
      await db.unsafe(
        "UPDATE board_ai_settings SET enabled=true,max_cost_eur=5,draft_input_per_million_eur=1,draft_output_per_million_eur=1",
      );
      const ctx = (await scalar(
        uid(1),
        `SELECT board_ai_context('${m}','${n}')`,
      )) as { hash: string; revision: number; context: { quorum: unknown } };
      expect(ctx.context.quorum).toBeTruthy();
      const job = (await service(
        `SELECT board_ai_reserve('${crypto.randomUUID()}','draft','${n}','${uid(1)}',2000,${ctx.revision},'${ctx.hash}')`,
      )) as { id: string };
      await service(`SELECT board_ai_job_begin('${job.id}')`);
      await as(
        uid(2),
        `SELECT board_minutes_save_document('${n}','Testo aggiornato dal segretario','manuale')`,
      );
      const draft =
        "Bozza IA da conservare separatamente senza sostituire la modifica del segretario.";
      await service(
        `SELECT board_ai_job_complete('${job.id}',NULL,${quote(draft)})`,
      );
      expect(
        await scalar(
          uid(1),
          `SELECT body FROM board_minute_versions WHERE minutes_id='${n}' ORDER BY version DESC LIMIT 1`,
        ),
      ).toBe("Testo aggiornato dal segretario");
      expect(
        await scalar(
          uid(1),
          `SELECT result FROM board_ai_jobs WHERE id='${job.id}'`,
        ),
      ).toBe(draft);
      expect(
        await scalar(
          uid(1),
          `SELECT status FROM board_ai_jobs WHERE id='${job.id}'`,
        ),
      ).toBe("failed");
      const fresh=await scalar(uid(1),`SELECT board_ai_context('${m}','${n}')`) as {hash:string;revision:number};
      const next=await service(`SELECT board_ai_reserve('${crypto.randomUUID()}','draft','${n}','${uid(1)}',2000,${fresh.revision},'${fresh.hash}')`) as {id:string};
      await service(`SELECT board_ai_job_begin('${next.id}')`);
      await service(`SELECT board_ai_job_complete('${next.id}',NULL,${quote(draft)})`);
      expect(await scalar(uid(1),`SELECT body FROM board_minute_versions WHERE minutes_id='${n}' ORDER BY version DESC LIMIT 1`)).toBe(draft);
      expect(await scalar(uid(1),`SELECT status FROM board_ai_jobs WHERE id='${next.id}'`)).toBe('succeeded');

    });
    it("binds an uploaded attachment to the ballot and refuses edits during voting", async () => {
      const m = await meeting();
      const payload: {
        title: string;
        body: string;
        documents: { id?: string; name: string; kind: string }[];
      } = {
        title: "Spesa",
        body: "Acquisto materiali",
        documents: [{ name: "Preventivo", kind: "allegato" }],
      };
      const d = String(
        await scalar(
          uid(1),
          `SELECT board_deliberation_save('${m}',NULL,${quote(JSON.stringify(payload))}::jsonb)`,
        ),
      );
      const f = String(
        await scalar(
          uid(1),
          `SELECT id FROM board_deliberation_documents WHERE deliberation_id='${d}'`,
        ),
      );
      await expect(
        as(uid(3), `SELECT board_document_upload_prepare('${f}','pdf')`),
      ).rejects.toThrow();
      const path = String(
        await scalar(
          uid(1),
          `SELECT board_document_upload_prepare('${f}','pdf')`,
        ),
      );
      await expect(
        as(uid(1), `SELECT board_ballot_open('${d}')`),
      ).rejects.toThrow(/caricamento/);
      await as(
        uid(1),
        `INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ('board-documents','${path}','{"size":20}')`,
      );
      await expect(
        as(
          uid(1),
          `SELECT board_document_attach('${f}','${path}','${"a".repeat(64)}',10,'application/pdf')`,
        ),
      ).rejects.toThrow(/dimensione/);
      await as(
        uid(1),
        `SELECT board_document_attach('${f}','${path}','${"a".repeat(64)}',20,'application/pdf')`,
      );
      const ballot = String(
        await scalar(uid(1), `SELECT board_ballot_open('${d}')`),
      );
      expect(
        await scalar(
          uid(1),
          `SELECT documents->0->>'storage_path' FROM board_ballots WHERE id='${ballot}'`,
        ),
      ).toBe(path);
      expect(
        await scalar(uid(1), `SELECT board_document_writable('${path}')`),
      ).toBe(false);
      await expect(
        as(uid(1), `SELECT board_document_upload_prepare('${f}','pdf')`),
      ).rejects.toThrow(/bozza/);
      await as(uid(1), `DELETE FROM storage.objects WHERE name='${path}'`);
      expect(
        await scalar(
          uid(1),
          `SELECT count(*) FROM storage.objects WHERE name='${path}'`,
        ),
      ).toBe("1");
      await as(
        uid(1),
        `SELECT board_ballot_cancel('${ballot}','Revisione del testo')`,
      );
      payload.documents = [{ ...payload.documents[0], id: f }];
      await as(
        uid(1),
        `SELECT board_deliberation_save('${m}','${d}',${quote(JSON.stringify(payload))}::jsonb)`,
      );
      expect(
        await scalar(
          uid(1),
          `SELECT storage_path FROM board_deliberation_documents WHERE id='${f}'`,
        ),
      ).toBe(path);
    });
    it("room access requires the live server and current offices, never changes attendance", async () => {
      const m = await meeting([1, 2]);
      await expect(
        as(uid(3), `SELECT board_room_access('${m}')`),
      ).rejects.toThrow(/server/);
      await db.unsafe(
        "INSERT INTO board_room_health VALUES (true,now()) ON CONFLICT(id) DO UPDATE SET checked_at=now()",
      );
      expect(
        (
          (await scalar(uid(3), `SELECT board_room_access('${m}')`)) as {
            identity: string;
          }
        ).identity,
      ).toBe(uid(3));
      expect(
        await scalar(
          uid(1),
          `SELECT present FROM board_meeting_participants WHERE meeting_id='${m}' AND user_id='${uid(3)}'`,
        ),
      ).toBe(false);
      await expect(
        as(uid(5), `SELECT board_room_access('${m}')`),
      ).rejects.toThrow(/carica/);
      await db.unsafe(
        `DELETE FROM user_roles WHERE user_id='${uid(3)}' AND role='councillor'`,
      );
      await expect(
        as(uid(3), `SELECT board_room_access('${m}')`),
      ).rejects.toThrow(/carica/);
      expect(
        (
          (await service("SELECT board_room_state()")) as {
            identity: string;
            room: string;
          }[]
        ).some((p) => p.room === `board-${m}` && p.identity === uid(3)),
      ).toBe(false);
      await db.unsafe(
        `INSERT INTO user_roles VALUES ('${uid(3)}','councillor')`,
      );
    });
  },
);
