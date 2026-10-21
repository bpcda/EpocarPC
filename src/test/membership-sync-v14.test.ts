// Real PostgreSQL, isolated temporary cluster with ONLY synthetic fixtures.
// Verifies the member_update v2 contract (setup/membership-sync-v14.sql).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, chmodSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

describe('member_update v2 on isolated synthetic PostgreSQL', () => {
  it('handles historic members, revisions, fees per year, clear_fields, conflicts and isolation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'epocar-v14-'));
    chmodSync(dir, 0o777);
    const asNobody = (args: string[]) => execFileSync('runuser', ['-u', 'nobody', '--', realpathSync(`/usr/bin/${args[0]}`), ...args.slice(1)], { encoding: 'utf8', stdio: 'pipe' });
    const sql = (query: string) => execFileSync('psql', ['-h', dir, '-p', '55441', '-U', 'nobody', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atc', query], { encoding: 'utf8', stdio: 'pipe' }).trim();
    const install = (file: string) => execFileSync('psql', ['-h', dir, '-p', '55441', '-U', 'nobody', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', resolve(file)], { stdio: 'pipe' });
    let started = false;
    const legacy = '00000000-0000-4000-8000-0000000000a1'; // historic member, no online application
    const other = '00000000-0000-4000-8000-0000000000b2';
    const tm = '20000000-0000-4000-8000-0000000000a1';
    const tmOther = '20000000-0000-4000-8000-0000000000b2';
    const appId = '30000000-0000-4000-8000-0000000000c3';
    const ev = (n: number, extra: object) => JSON.stringify({
      event_id: `evt-synthetic-${n}`, revision: n, updated_at: '2026-10-20T10:00:00Z',
      external_member_id: legacy, treasury_member_id: tm, ...extra,
    });
    const update = (key: string, body: string, bootstrap = true) =>
      sql(`SELECT ${bootstrap ? 'treasury_sync_bootstrap_member_update' : 'treasury_sync_apply'}('${key}','test','${body}'::jsonb);`);
    try {
      asNobody(['initdb', '-D', join(dir, 'data'), '-A', 'trust', '--no-locale']);
      asNobody(['pg_ctl', '-D', join(dir, 'data'), '-l', join(dir, 'server.log'), '-o', `-k ${dir} -p 55441 -h ''`, '-w', 'start']);
      started = true;
      install('src/test/fixtures/account-sync.sql');
      install('setup/treasury-bootstrap-v11.sql');
      install('setup/treasury-bootstrap-v13.sql');
      install('setup/membership-sync-v14.sql');
      install('setup/membership-sync-v14.sql'); // re-run safety

      // Historic member without an online application: role + bootstrap ack, then a v2 event.
      sql(`INSERT INTO auth.users(id,email) VALUES ('${legacy}','legacy@example.invalid'),('${other}','other@example.invalid');
           INSERT INTO user_roles VALUES ('${legacy}','founder'),('${other}','ordinary');
           INSERT INTO membership_applications(id,user_id,status,approved_at,treasury_member_id) VALUES ('${appId}','${other}','approved','2026-01-10','${tmOther}');`);
      sql(`SELECT treasury_sync_bootstrap_ack('ack-1','test','{"external_member_id":"${legacy}","treasury_member_id":"${tm}"}');`);

      const r1 = JSON.parse(update('mu-1', ev(1, { category: 'Fondatore', membership_status: 'active', card_number: '7', admission_date: '2019-05-12',
        admission: { status: 'confirmed', source: 'board_resolution', reference: 'CD 2019-04', decision_date: '2019-04-20' },
        annual_fee: { membership_year: '2026', fee_status: 'partial', fee_amount: '100.00', fee_paid_amount: '40.00', fee_balance: '60.00',
          last_payment: { date: '2026-03-01', amount: '40.00', receipt_number: 'R-1' } },
        payment_coordinates: { iban: 'it60 x054 2811 1010 0000 0123 456', account_holder: 'EPOCAR APS' },
        public_message: 'Benvenuto!' })));
      expect(r1).toMatchObject({ ok: true, result: 'applied', member_projection: 'applied', revision: 1 });
      expect(sql(`SELECT admission_status || '|' || admission_source || '|' || payment_iban FROM member_public_status WHERE treasury_member_id='${tm}';`))
        .toBe('confirmed|board_resolution|IT60X0542811101000000123456');
      expect(sql(`SELECT fee_amount::text || '|' || fee_balance::text || '|' || last_payment_receipt_number FROM member_annual_fees WHERE treasury_member_id='${tm}' AND membership_year=2026;`))
        .toBe('100.00|60.00|R-1');

      // A different year is stored separately: 2027 never overwrites 2026.
      JSON.parse(update('mu-2', ev(2, { annual_fee: { membership_year: '2027', fee_status: 'due', fee_amount: '100.00', fee_paid_amount: '0.00', fee_balance: '100.00' } })));
      expect(sql(`SELECT count(*) FROM member_annual_fees WHERE treasury_member_id='${tm}';`)).toBe('2');
      expect(sql(`SELECT fee_status FROM member_annual_fees WHERE treasury_member_id='${tm}' AND membership_year=2026;`)).toBe('partial');

      // Modified payment (new receipt) on the same year; then explicit removal of the previous payment.
      JSON.parse(update('mu-3', ev(3, { annual_fee: { membership_year: '2026', fee_status: 'paid', fee_paid_amount: '100.00', fee_balance: '0.00',
        last_payment: { date: '2026-06-01', amount: '60.00', receipt_number: 'R-2' } } })));
      expect(sql(`SELECT fee_status || '|' || last_payment_receipt_number FROM member_annual_fees WHERE treasury_member_id='${tm}' AND membership_year=2026;`)).toBe('paid|R-2');
      JSON.parse(update('mu-4', ev(4, { annual_fee: { membership_year: '2026' }, clear_fields: ['annual_fee.last_payment'] })));
      expect(sql(`SELECT coalesce(last_payment_receipt_number,'NULL') FROM member_annual_fees WHERE treasury_member_id='${tm}' AND membership_year=2026;`)).toBe('NULL');

      // Exemption and explicit clear of a previous value.
      JSON.parse(update('mu-5', ev(5, { annual_fee: { membership_year: '2028', fee_status: 'exempt' }, clear_fields: ['card_number'] })));
      expect(sql(`SELECT coalesce(card_number::text,'NULL') FROM member_public_status WHERE treasury_member_id='${tm}';`)).toBe('NULL');
      expect(sql(`SELECT fee_status FROM member_annual_fees WHERE treasury_member_id='${tm}' AND membership_year=2028;`)).toBe('exempt');

      // Duplicate event: no additional effects. Same event_id with different content: explicit conflict.
      const dup = JSON.parse(update('mu-1b', ev(5, { annual_fee: { membership_year: '2028', fee_status: 'exempt' }, clear_fields: ['card_number'] })));
      expect(dup.member_projection).toBe('duplicate');
      expect(() => update('mu-1c', ev(5, { category: 'Ordinario' }))).toThrow();
      // Out-of-order (older revision): stale, no overwrite. Same revision, different content: conflict.
      const stale = JSON.parse(update('mu-6', ev(3, { category: 'Ordinario' }).replace('evt-synthetic-3', 'evt-synthetic-3b')));
      expect(stale.member_projection).toBe('stale');
      expect(sql(`SELECT category FROM member_public_status WHERE treasury_member_id='${tm}';`)).toBe('Fondatore');
      expect(() => update('mu-7', JSON.stringify({ event_id: 'evt-synthetic-6', revision: 5, updated_at: '2026-10-20T11:00:00Z', treasury_member_id: tm, category: 'Ordinario' }))).toThrow();

      // Incoherent identifiers: external_member_id of one person with the application of another.
      expect(() => sql(`SELECT treasury_sync_apply('mu-8','test','{"event_id":"evt-synthetic-8","revision":1,"updated_at":"2026-10-20T12:00:00Z","external_member_id":"${legacy}","application_id":"${appId}","treasury_member_id":"${tm}","category":"Fondatore"}'::jsonb);`)).toThrow();
      // Unverified admission never becomes confirmed without an explicit Treasury source.
      expect(() => update('mu-9', ev(6, { admission: { status: 'confirmed' } }))).toThrow();
      JSON.parse(update('mu-10', ev(6, { admission: { status: 'unverified' } })));
      expect(sql(`SELECT admission_status FROM member_public_status WHERE treasury_member_id='${tm}';`)).toBe('unverified');
      // Explicit null is rejected (use clear_fields); undocumented clear paths are rejected.
      expect(() => update('mu-11', ev(7, { card_number: null }))).toThrow();
      expect(() => update('mu-12', ev(7, { clear_fields: ['membership_status'] }))).toThrow();
      // Cessation with documented reason.
      JSON.parse(update('mu-13', ev(7, { membership_status: 'ceased', cessation: { date: '2026-09-30', reason: 'resignation' } })));
      expect(sql(`SELECT membership_status || '|' || cessation_reason FROM member_public_status WHERE treasury_member_id='${tm}';`)).toBe('ceased|resignation');

      // Isolation: an authenticated user reads only own fees; events log is service-only.
      const asAuthenticated = (q: string) => sql(`SET ROLE authenticated; ${q}`).split('\n').pop();
      expect(asAuthenticated(`SELECT count(*) FROM member_annual_fees;`)).toBe('0');
      expect(() => asAuthenticated(`SELECT count(*) FROM treasury_member_events;`)).toThrow(); // service-only table
      expect(sql(`SELECT has_function_privilege('authenticated','public.member_update_v2(uuid,uuid,uuid,jsonb)','EXECUTE');`)).toBe('f');
      // Legacy v1 payload (no event_id) still works through the bootstrap path.
      const v1 = JSON.parse(update('mu-v1', JSON.stringify({ treasury_member_id: tm, member: { category: 'Fondatore', membership_status: 'active', updated_at: '2026-10-20T13:00:00Z' } })));
      expect(v1).toMatchObject({ ok: true, result: 'applied' });
    } finally {
      if (started) asNobody(['pg_ctl', '-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop']);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
