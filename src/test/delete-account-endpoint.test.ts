import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, it, expect, vi } from 'vitest';

const actor = '00000000-0000-4000-8000-000000000001';
const target = '00000000-0000-4000-8000-000000000002';

function endpoint(options: { missingStatus?: boolean; admin?: boolean; lastAdmin?: boolean; finalizeError?: boolean } = {}) {
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const deleteUser = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const rpc = vi.fn(async (name: string) => {
    if (name === 'has_role') return { data: options.admin === true, error: null };
    if (name === 'account_deletion_status') return options.missingStatus
      ? { data: null, error: { code: 'PGRST202', message: 'Missing RPC' } }
      : { data: { exists: true, last_admin: options.lastAdmin === true, is_member: false, application_status: 'rejected' }, error: null };
    if (name === 'account_deletion_prepare') return options.lastAdmin
      ? { data: null, error: { message: 'last_admin' } }
      : { data: { outcome: 'prepared', application_outcome: 'kept', is_member: false }, error: null };
    return { data: null, error: options.finalizeError ? { message: 'finalize failed' } : null };
  });
  const db = { rpc, auth: { admin: { deleteUser } }, storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove }) } };
  const asUser = { auth: { getClaims: async () => ({ data: { claims: { sub: actor } }, error: null }) } };
  const createClient = vi.fn((_url, _key, opts) => opts?.global ? asUser : db);
  const Deno = { env: { get: () => 'synthetic-only' }, serve: (fn: typeof handler) => { handler = fn; } };
  const source = readFileSync('supabase/functions/delete-account/index.ts', 'utf8').replace(/^import .*;\s*$/gm, '');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  new Function('Deno', 'createClient', 'corsHeaders', 'console', compiled)(Deno, createClient, {}, { error: vi.fn() });
  return {
    rpc, remove, deleteUser,
    async call(body: object) {
      if (!handler) throw new Error('Endpoint not registered');
      return handler(new Request('http://localhost/delete-account', { method: 'POST', headers: { Authorization: 'Bearer synthetic-only', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    },
  };
}

describe('delete-account endpoint with synthetic identities and service mocks', () => {
  it.each(['self', 'admin'])('missing status blocks %s deletion before any cleanup', async (mode) => {
    const fn = endpoint({ missingStatus: true, admin: true });
    const response = await fn.call(mode === 'admin' ? { target_user_id: target } : {});
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'schema_not_ready' });
    expect(fn.rpc.mock.calls.map(([name]) => name)).not.toContain('account_deletion_prepare');
    expect(fn.remove).not.toHaveBeenCalled();
    expect(fn.deleteUser).not.toHaveBeenCalled();
  });
  it('refuses administrative deletion without admin role', async () => {
    const fn = endpoint();
    expect((await fn.call({ target_user_id: target })).status).toBe(403);
    expect(fn.deleteUser).not.toHaveBeenCalled();
  });
  it('dry run reads status only, even for a rejected application', async () => {
    const fn = endpoint();
    expect((await fn.call({ dry_run: true })).status).toBe(200);
    expect(fn.rpc.mock.calls.map(([name]) => name)).toEqual(['account_deletion_status']);
    expect(fn.deleteUser).not.toHaveBeenCalled();
  });
  it('keeps the last administrator protected', async () => {
    const fn = endpoint({ lastAdmin: true });
    expect((await fn.call({})).status).toBe(409);
    expect(fn.deleteUser).not.toHaveBeenCalled();
  });
  it.each(['self', 'admin'])('rejected application permits %s portal deletion after validated preparation', async (mode) => {
    const fn = endpoint({ admin: true });
    const response = await fn.call(mode === 'admin' ? { target_user_id: target } : {});
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: 'deleted', application_outcome: 'kept' });
    expect(fn.deleteUser).toHaveBeenCalledWith(mode === 'admin' ? target : actor);
    expect(fn.rpc.mock.calls.map(([name]) => name)).toContain('account_deletion_finalize');
  });
  it('does not report success when finalization fails', async () => {
    const fn = endpoint({ finalizeError: true });
    expect((await fn.call({})).status).toBe(500);
  });
});