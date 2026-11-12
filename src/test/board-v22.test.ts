import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join, resolve } from "node:path";
import postgres, { type Sql } from "postgres";

const available = !spawnSync("initdb", ["--version"]).error && !spawnSync("psql", ["--version"]).error;
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
const PRES = uid(1), SEC = uid(2), VICE = uid(6);

describe.skipIf(!available)("Board step 2 on native isolated PostgreSQL", () => {
  let dir: string, db: Sql, first: Sql, second: Sql, started = false;
  const root = process.getuid?.() === 0;
  const pg = (name: string, args: string[]) => root
    ? execFileSync("runuser", ["-u", "nobody", "--", name, ...args], { stdio: "pipe" })
    : execFileSync(name, args, { stdio: "pipe" });
  const as = (user: string, query: string, connection = db) => connection.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE authenticated; SET LOCAL app.uid=${quote(user)}`);
    return tx.unsafe(query);
  });
  const scalar = async (user: string, query: string) => Object.values((await as(user, query))[0])[0];
  const meeting = async (present = [1, 2, 3, 6, 7]) => {
    const payload = { scheduled_at: "2026-11-20T18:00:00+01:00", mode: "presenza", location: "Piacenza", minute_taker_id: SEC,
      agenda: [{ title: "Attività", kind: "deliberazione" }] };
    const id = String(await scalar(PRES, `SELECT board_save_meeting(NULL,${quote(JSON.stringify(payload))}::jsonb)`));
    await as(PRES, `SELECT board_set_status('${id}','CONVOCATO')`);
    for (const n of present) await as(SEC, `SELECT board_attendance_set('${id}',id,true,'presenza',true,'Identità verificata') FROM board_meeting_participants WHERE meeting_id='${id}' AND user_id='${uid(n)}'`);
    await as(PRES, `SELECT board_session_action('${id}','open')`);
    return id;
  };
  const draft = async (m: string) => String(await scalar(SEC, `SELECT board_deliberation_save('${m}',NULL,'{"title":"Attività","body":"Proposta da votare"}'::jsonb)`));
  const ballot = async (m: string, chair = PRES) => {
    const d = await draft(m);
    return { d, b: String(await scalar(chair, `SELECT board_ballot_open('${d}')`)) };
  };
  const vote = (b: string, n: number, v: string) => as(uid(n), `SELECT board_ballot_vote('${b}','${v}')`);
  const close = async (b: string, chair = PRES) => {
    await as(chair, `SELECT board_ballot_close('${b}')`);
    return (await as(chair, `SELECT result,tally,quorum,tie_break FROM board_ballots WHERE id='${b}'`))[0];
  };
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "epocar-board-v22-"));
    if (root) chmodSync(dir, 0o777);
    pg("initdb", ["-D", join(dir, "data"), "-A", "trust", "--no-locale", "-E", "UTF8"]);
    pg("pg_ctl", ["-D", join(dir, "data"), "-l", join(dir, "log"), "-o", `-k ${dir} -p 55459 -h ''`, "-w", "start"]);
    started = true;
    const options = { host: dir, port: 55459, database: "postgres", username: root ? "nobody" : userInfo().username, max: 1, onnotice: () => {} };
    db = postgres(options);
    first = postgres({ ...options, connection: { application_name: "board-v22-first" } });
    second = postgres({ ...options, connection: { application_name: "board-v22-second" } });
    execFileSync("psql", ["-h", dir, "-p", "55459", "-U", options.username, "-d", "postgres", "-v", "ON_ERROR_STOP=1",
      "-f", resolve("src/test/fixtures/board-schema.sql"),
      ...[15,16,17,18,19,20,21,22,22].flatMap((v) => ["-f", resolve(`setup/board-v${v}.sql`)])], { stdio: "pipe" });
    await db.unsafe(`INSERT INTO user_roles VALUES ('${VICE}','vice_president'),('${uid(7)}','councillor'),('${uid(8)}','councillor'),('${uid(9)}','councillor');
      INSERT INTO profiles VALUES ('${uid(3)}','Carlo','Segretario')`);
  }, 60000);
  afterAll(async () => {
    await Promise.all([db?.end(), first?.end(), second?.end()]);
    if (started) pg("pg_ctl", ["-D", join(dir, "data"), "-m", "immediate", "stop"]);
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("uses 4/7 quorum and the agreed rule, retaining identities, missing votes and historical tallies", async () => {
    const m = await meeting();
    expect(await scalar(PRES, `SELECT board_quorum('${m}')`)).toEqual({ total: 7, present: 5, required: 4, met: true });
    let { b } = await ballot(m);
    for (const [n,v] of [[1,'favorevole'],[2,'favorevole'],[3,'contrario'],[6,'astenuto'],[7,'astenuto']] as const) await vote(b,n,v);
    const rejected = await close(b);
    expect(rejected).toMatchObject({ result: "respinta", tie_break: false, tally: { favorevoli: 2, contrari: 1, astenuti: 2, mancanti: 0, rule: "present_majority_chair_tie_v1" } });
    expect(rejected.tally.nomi.filter((v: { name: string }) => v.name === "Carlo Segretario")).toHaveLength(2);
    expect(new Set(rejected.tally.nomi.map((v: { user_id: string }) => v.user_id)).size).toBe(5);
    const old = await scalar(PRES, `SELECT tally FROM board_ballots WHERE id='${b}'`);
    ({ b } = await ballot(m));
    for (const [n,v] of [[1,'favorevole'],[2,'favorevole'],[3,'contrario'],[6,'contrario'],[7,'astenuto']] as const) await vote(b,n,v);
    expect(await close(b)).toMatchObject({ result: "approvata", tie_break: true });
    ({ b } = await ballot(m));
    await vote(b,2,'favorevole'); await vote(b,3,'contrario'); await vote(b,1,'astenuto');
    expect(await close(b)).toMatchObject({ result: "respinta", tie_break: false, tally: { mancanti: 2 } });
    ({ b } = await ballot(m));
    expect(await close(b)).toMatchObject({ result: "respinta", tie_break: false, tally: { mancanti: 5 } });
    const history = await as(PRES, `SELECT tally FROM board_ballots WHERE meeting_id='${m}' ORDER BY opened_at LIMIT 1`);
    expect(history[0].tally).toEqual(old);
  });

  it("activates a substitute explicitly and excludes conflicts only from the affected point", async () => {
    const m = await meeting();
    const d = await draft(m);
    await expect(as(VICE, `SELECT board_ballot_open('${d}')`)).rejects.toThrow(/solo il Presidente/);
    await expect(as(VICE, `SELECT board_chair_assign('${m}','${VICE}','Sostituzione',NULL)`)).rejects.toThrow(/attivazione riservata/);
    await as(SEC, `SELECT board_attendance_set('${m}',id,false,NULL,false,'Presidente impedito') FROM board_meeting_participants WHERE meeting_id='${m}' AND user_id='${PRES}'`);
    await as(VICE, `SELECT board_chair_assign('${m}','${VICE}','Presidente impedito',NULL)`);
    const b = String(await scalar(VICE, `SELECT board_ballot_open('${d}')`));
    await expect(as(PRES, `SELECT board_ballot_close('${b}')`)).rejects.toThrow(/solo il Presidente/);
    await expect(as(VICE, `SELECT board_chair_assign('${m}','${VICE}','Cambio durante voto',NULL)`)).rejects.toThrow(/concludi o annulla/);
    await vote(b,6,'favorevole'); await vote(b,2,'favorevole'); await vote(b,3,'contrario'); await vote(b,7,'contrario');
    expect(await close(b,VICE)).toMatchObject({ result: "approvata", tie_break: true, tally: { chair_user_id: VICE } });
    const conflict = await draft(m);
    await as(uid(3), `SELECT board_conflict_set('${conflict}','declare','Interesse personale')`);
    await expect(as(uid(3), `SELECT board_deliberation_suggest('${conflict}','Modifica proposta')`)).rejects.toThrow(/conflitto/);
    expect(await scalar(VICE, `SELECT board_ballot_quorum('${m}','${conflict}')`)).toMatchObject({ total: 7, present: 3, required: 4, met: false });
    await expect(as(VICE, `SELECT board_ballot_open('${conflict}')`)).rejects.toThrow(/quorum/);
    await as(SEC, `SELECT board_attendance_set('${m}',id,true,'presenza',true,'Identità verificata') FROM board_meeting_participants WHERE meeting_id='${m}' AND user_id='${uid(8)}'`);
    const cb = String(await scalar(VICE, `SELECT board_ballot_open('${conflict}')`));
    await expect(vote(cb,3,'favorevole')).rejects.toThrow(/conflitto/);
    await expect(as(uid(3), `SELECT board_conflict_set('${conflict}','return',NULL)`)).rejects.toThrow(/conclusione del punto/);
    await as(VICE, `SELECT board_ballot_cancel('${cb}','Punto rinviato'); SELECT board_deliberation_withdraw('${conflict}','Punto ritirato')`);
    await as(uid(3), `SELECT board_conflict_set('${conflict}','return',NULL)`);
    const next = await ballot(m,VICE);
    await vote(next.b,3,'favorevole');
    await as(VICE, `SELECT board_ballot_cancel('${next.b}','Rinvio')`);
    expect(await scalar(VICE, `SELECT count(*) FROM board_meeting_events WHERE meeting_id='${m}' AND action IN ('conflict_declared','conflict_leave','conflict_return')`)).toBe("3");
    const stale = await ballot(m,VICE);
    await db.unsafe(`DELETE FROM user_roles WHERE user_id='${VICE}' AND role='vice_president'; INSERT INTO user_roles VALUES ('${VICE}','councillor')`);
    expect(await scalar(SEC, `SELECT board_chair_user('${m}')`)).toBeNull();
    await expect(as(VICE, `SELECT board_session_action('${m}','suspend','Pausa')`)).rejects.toThrow(/solo il Presidente/);
    await as(SEC, `SELECT board_ballot_cancel('${stale.b}','Presidenza decaduta: occorre una nuova votazione')`);
    await expect(vote(stale.b,6,'favorevole')).rejects.toThrow(/non aperta/);
    await as(SEC, `SELECT board_chair_assign('${m}','${SEC}','Presidente e Vicepresidente impediti','Designazione del Consiglio registrata nel verbale')`);
    expect(await scalar(SEC, `SELECT board_chair_user('${m}')`)).toBe(SEC);
    await db.unsafe(`DELETE FROM user_roles WHERE user_id='${VICE}' AND role='councillor'; INSERT INTO user_roles VALUES ('${VICE}','vice_president')`);
    await expect(as(uid(5), `SELECT board_chair_assign('${m}','${uid(5)}','Amministratore',NULL)`)).rejects.toThrow();
    await expect(as(uid(3), `UPDATE board_deliberation_conflicts SET returned_at=NULL`)).rejects.toThrow(/permission denied/);
    expect(await scalar(uid(5), `SELECT count(*) FROM board_deliberation_conflicts`)).toBe("1"); // Technical admin reads only.
    expect(await scalar(uid(4), `SELECT count(*) FROM board_deliberation_conflicts`)).toBe("0");
  });

  it("serializes vote/close and vote/cancel in both orders, and preserves quorum and session state", async () => {
    const m = await meeting();
    async function race(firstUser: string, firstQuery: string, secondUser: string, secondQuery: string) {
      let release!: () => void, acquired!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      const ready = new Promise<void>((r) => { acquired = r; });
      const held = first.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL ROLE authenticated; SET LOCAL app.uid=${quote(firstUser)}; ${firstQuery}`);
        acquired(); await gate;
      });
      await Promise.race([ready, held]);
      const queued = as(secondUser,secondQuery,second).then(() => "ok", (e: Error) => e.message);
      try {
        let blocked = false;
        for (let attempt=0; attempt<100; attempt++) {
          const rows = await db`SELECT 1 FROM pg_stat_activity WHERE application_name='board-v22-second' AND wait_event_type='Lock'`;
          if (rows.length) { blocked=true; break; }
          await new Promise((r) => setTimeout(r,10));
        }
        expect(blocked).toBe(true);
      } finally { release(); }
      await held;
      return queued;
    }
    let { b } = await ballot(m);
    expect(await race(PRES,`SELECT board_ballot_close('${b}')`,SEC,`SELECT board_ballot_vote('${b}','favorevole')`)).toMatch(/non aperta/);
    expect(await scalar(PRES,`SELECT count(*) FROM board_votes WHERE ballot_id='${b}'`)).toBe("0");
    ({ b } = await ballot(m));
    expect(await race(SEC,`SELECT board_ballot_vote('${b}','favorevole')`,PRES,`SELECT board_ballot_close('${b}')`)).toBe("ok");
    expect(await scalar(PRES,`SELECT tally->>'favorevoli' FROM board_ballots WHERE id='${b}'`)).toBe("1");
    ({ b } = await ballot(m));
    expect(await race(PRES,`SELECT board_ballot_cancel('${b}','Errore')`,SEC,`SELECT board_ballot_vote('${b}','favorevole')`)).toMatch(/non aperta/);
    ({ b } = await ballot(m));
    expect(await race(SEC,`SELECT board_ballot_vote('${b}','favorevole')`,PRES,`SELECT board_ballot_cancel('${b}','Errore')`)).toBe("ok");
    ({ b } = await ballot(m));
    expect(await race(PRES,`SELECT board_session_action('${m}','suspend','Pausa')`,SEC,`SELECT board_ballot_vote('${b}','favorevole')`)).toMatch(/non consente di votare/);
    await as(PRES,`SELECT board_ballot_cancel('${b}','Pausa'); SELECT board_session_action('${m}','resume')`);
    ({ b } = await ballot(m));
    await expect(as(PRES,`SELECT board_session_action('${m}','close','Chiusura')`)).rejects.toThrow(/votazione aperta/);
    const d = await draft(m);
    await expect(as(PRES,`SELECT board_ballot_open('${d}')`)).rejects.toThrow(/già una votazione/);
    await vote(b,1,'favorevole');
    await as(SEC,`SELECT board_attendance_set('${m}',id,false,NULL,false,'Uscita verificata') FROM board_meeting_participants WHERE meeting_id='${m}' AND user_id IN ('${uid(3)}','${uid(7)}')`);
    expect(await close(b)).toMatchObject({ result: "senza_quorum", quorum: { present: 3, required: 4 } });
  },30000);
});
