import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { processJob, validateDraft, notifyPayload, KAPSO_PROJECT, PHONE_ID } from './board-worker.mjs';

const id = '00000000-0000-4000-8000-000000000001';
const draft = { body: 'Bozza del verbale della seduta: nessuna approvazione è dedotta dalle trascrizioni o da dati mancanti.', notes: ['Verificare gli interventi non attribuiti'] };
test('validates output and scopes the WhatsApp template to a private site link', () => {
  assert.throws(() => validateDraft({ body: 'Testo', notes: [] }));
  assert.throws(() => validateDraft({ ...draft, notes: [{}] }));
  assert.deepEqual(validateDraft(draft), draft);
  assert.equal(KAPSO_PROJECT, 'bc79a4e0-d0dd-4f58-8a69-6c5576b1919c');
  assert.equal(PHONE_ID, '1429452350257851');
  assert.throws(() => notifyPayload('invalid', id));
  const p = notifyPayload('+393331234567', id);
  assert.equal(p.type, 'template');
  assert.equal(p.template.components[0].parameters[0].text, id);
  assert.ok(!JSON.stringify(p).includes(draft.body));
});
test('transcribes before drafting and resumes cached output without a second model invocation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'epocar-worker-test-'));
  const calls = [], commands = [];
  const job = { id, lease_id: id, tracks: [{ id, status: 'caricata' }], coverage_note: 'Fonti sintetiche confermate' };
  const api = async body => {
    calls.push(body);
    if (body.action === 'audio') return Buffer.from('synthetic-audio');
    if (body.action === 'drafting') return { status: 'drafting', context: { meeting: { id }, transcripts: ['trascrizione sintetica'] } };
    return { status: body.action === 'complete' ? 'ready' : 'transcribing' };
  };
  const run = async (program, args) => {
    commands.push({ program, args });
    if (program === 'codex') { await writeFile(args[args.indexOf('--output-last-message') + 1], JSON.stringify(draft)); return ''; }
    return JSON.stringify([{ start: 0, end: 1, text: 'Fonte sintetica', speaker: null, attribution: 'non_attribuita' }]);
  };
  try {
    assert.deepEqual(await processJob(job, { api, run, directory, python: 'local-stt' }), draft);
    assert.deepEqual(calls.map(c => c.action), ['audio', 'transcript', 'drafting', 'complete']);
    assert.ok(commands[1].args.includes('--ignore-user-config'));
    assert.ok(commands[1].args.includes('shell_tool'));
    assert.ok(!commands[1].args.includes('--dangerously-bypass-approvals-and-sandbox'));
    await processJob(job, { api, run, directory, python: 'local-stt' });
    assert.equal(commands.length, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('does not call Codex or complete on missing transcripts or stale official context', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'epocar-worker-fail-'));
  const calls = [];
  try {
    await assert.rejects(processJob({ id, lease_id: id, tracks: [], coverage_note: 'Appunti' }, {
      directory, api: async body => { calls.push(body.action); return { status: body.action === 'drafting' ? 'stale' : 'failed' }; },
      run: () => { throw new Error('Codex must not run'); },
    }), /Fonti cambiate/);
    assert.deepEqual(calls, ['drafting', 'failed']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
