# Account deletion and Treasury reconciliation — Codex handoff

## Observed versus unverified (16 October 2026)

The supplied production log at `2026-10-16T22:28:52.084Z` reports failure resolving
`public.account_deletion_status(_target)` through PostgREST. This fails at the status
stage, before `account_deletion_prepare`, storage cleanup or Auth deletion **for that
request**. It does not establish that earlier requests made no partial changes.

The external production instance is not connected to this workspace. The connected
Lovable Cloud instance is different: a read-only catalog check found no account-deletion
or bootstrap RPCs there and no matching function logs. Those results do not describe
the external production instance. No production migration or deployment was executed.

In repository v8, the SQL signature and call already match:
`public.account_deletion_status(_target uuid) RETURNS jsonb`, invoked with `{_target: UUID}`.
The log is consistent with a missing/unapplied installation, a different named parameter,
or a stale/unexposed schema cache; it alone cannot distinguish them. A missing EXECUTE
grant more commonly produces a permission error, but must also be checked.
A rejected application is not a deletion refusal condition: its decision is preserved.

## Repairs supplied

1. `setup/account-deletion-v12.sql`: complete, rerunnable replacement installation
   of v8, with service-only RPC grants, schema-cache reload notification,
   boolean `is_member` even without a projection/application, and preflight checks for
   prepare/finalize existence, EXECUTE privileges and exact argument names.
   Admin authorization is also checked in prepare; deletion operations serialize the
   last-admin check across targets. Prepared retries preserve the original audit evidence.
   Does not erase existing audit rows, applications or Treasury records during installation.
2. `delete-account` checks status before **every** deletion, validates the response,
   refuses to proceed on any RPC error, and reports `503 schema_not_ready` for a missing
   status RPC or incomplete installation. Logs include the stage, not credentials.
   Finalization errors never return success, including an already-deleted retry.
3. `setup/treasury-bootstrap-v13.sql`: same ack signature/body/response, but direct
   eligibility lookup instead of calling the list with `100000` (which silently capped
   at 100). Fresh v11 installs include the same correction.

No inclusion rule was widened. A founder with a rejected application remains excluded;
that is intentional, not grounds to fabricate an admission. Verify the real Board decision
in the private Treasury. `founder` is a role, `Fondatore` is the category label; neither
alone proves admission.

## External verification and installation

Run `setup/account-sync-diagnostics.sql` first, in the production project's SQL editor.
Optionally set `epocar.diagnostic_user_id` to the affected account UUID there; output
includes roles/status flags without email/name. Check:

| SQL RPC | Exact input names/types | Result | Access |
|---|---|---|---|
| account_deletion_status | `_target uuid` | jsonb | service_role only |
| account_deletion_prepare | `_actor uuid, _target uuid, _mode text` | jsonb | service_role only |
| account_deletion_finalize | `_actor uuid, _target uuid, _mode text, _outcome text` | void | service_role only |
| treasury_sync_bootstrap_members | `_limit integer, _after uuid` | rows | service_role only |
| treasury_sync_bootstrap_ack | `_idempotency_key text, _request_id text, _payload jsonb` | jsonb | service_role only |

Review definitions (`pg_get_functiondef`) locally alongside these scripts when checking
which version is installed. Filename existence in a repository is not migration evidence.
If an existing same-type function has different input names, `CREATE OR REPLACE` may
refuse renaming them. Do not DROP blindly or grant client access: inspect dependencies
and prepare a reviewed compatibility repair. No automatic destructive workaround is supplied.

When prerequisites v6/v7 exist, run v12. With v11 installed, run v13; otherwise install
corrected v11 after v6. Scripts issue `NOTIFY pgrst, 'reload schema'` on commit. Verify
exact signatures and privileges again, then test the dry-run RPC through the deployed
Edge Function using a synthetic authenticated account. A catalog check is not proof
that PostgREST cache has refreshed. If still unresolved, check exposed schema `public`,
function deployment target and production logs; do not bypass the RPC.

Deploy the updated `delete-account` source to the same external project. Redeploy the
frontend for its new actionable error message. `treasury-sync` has no source change in
this repair and needs no redeployment if its existing version matches the contract.
No deployment was performed from this workspace.

**Subsequent compatible extension (16 October 2026):** `treasury-sync` now adds
`category_source: "site_role"` and `admission: {status:"unknown",source:null}` to
each bootstrap HTTPS record. For this extension, redeploy `treasury-sync` on the
external project and the public frontend, and adapt the private importer; no SQL
migration or RPC signature change is needed. The earlier no-redeployment statement
above applies only to the deletion/ack repair, not this subsequent extension.
Missing fields from older servers mean unknown admission, never confirmed.

## Partial deletion review (read-only)

The diagnostic audit summary finds `prepared` entries without `deleted/already_deleted`,
and distinguishes whether Auth still exists. Also inspect target profile/roles, optional
projection, Auth foreign keys and storage inventory locally (never publish personal rows).
Preparation is transactional, but preparation → storage → Auth deletion → finalization
are separate operations. A failure after preparation can leave Auth present with profile
or roles removed; a failure after Auth deletion can leave finalization outstanding.
No automatic rollback/recovery of real users is performed. Historical rejected/approved
applications keep personal application fields subject to the association retention policy;
this is not a promise of complete anonymization. v12 does not silently drop foreign keys
or disable triggers to force deletion.

## API for Codex (contract unchanged except documented deletion error)

Use the existing production backend origin configured server-side; never the private
Treasury hostname in the browser. Paths:

- `POST /functions/v1/delete-account` — authenticated JWT, `{dry_run:true}` (self)
  or `{dry_run:true,target_user_id:UUID}` (admin), then `{}` / `{target_user_id:UUID}`
  only after explicit user confirmation. Self target always derives from the verified JWT.
  New safe error: HTTP 503 `{ "error": "schema_not_ready" }`; no cleanup attempted by
  that request. Other RPC errors remain failure, never fall back to direct Auth deletion.
- `GET /functions/v1/treasury-sync?action=bootstrap_members&limit=50`
  — category-role reconciliation candidates, not an admitted-member register.
- `GET /functions/v1/treasury-sync?action=pending&status=submitted,review&limit=50`
  — actionable applications only; no rejected/approved rows.
- `POST /functions/v1/treasury-sync?action=bootstrap_ack`
  — `{external_member_id,treasury_member_id}` records linkage only; does not admit.

Sync headers: shared-secret Bearer (server only), `X-Treasury-Timestamp` within ±300s,
`Content-Type: application/json`, and `Idempotency-Key` for POST (8–200 characters).
Full field definitions and decision endpoints: `docs/treasury-sync-contract.md`.

Bootstrap roles: `founder → Fondatore`, `ordinary → Ordinario`,
`supporter → Sostenitore`. Board roles separately: `president`, `vice_president`,
`secretary`, `treasurer`, `councillor`; technical `admin`, `staff`, `user` excluded.
Must have an Auth account and category role; profile optional. Application absent,
`draft`, `cancelled`: eligible; `submitted`, `review`, `approved`, `rejected`: excluded.

Paging: 1–100, default 50; UUID ascending, send returned `next_cursor` until null.
Start each complete reconciliation without a cursor: a newly assigned founder may have
an UUID below a previous cursor. A persisted cursor is not an incremental update token.
Pending uses a different base64 `(submitted_at,application_id)` cursor.

Anonymized/synthetic bootstrap response:

```json
{
  "ok": true,
  "request_id": "synthetic-request",
  "members": [{
    "external_member_id": "10000000-0000-4000-8000-000000000105",
    "user_id": "10000000-0000-4000-8000-000000000105",
    "first_name": "Persona", "last_name": "Esempio", "full_name": "Persona Esempio",
    "email": "persona@example.invalid", "category": "Fondatore",
    "category_source": "site_role", "admission": { "status": "unknown", "source": null },
    "board_roles": ["vice_president", "treasurer"],
    "admission_date": null, "card_number": null, "treasury_member_id": null,
    "acknowledged_at": null, "account_created_at": "2026-10-01T12:00:00Z"
  }],
  "next_cursor": null
}
```

Null admission/card values must stay null until a real private-Treasury decision.

## Synthetic tests

`src/test/account-sync-sql.test.ts` boots its own temporary PostgreSQL cluster with
synthetic fixtures (no production connection). It installs/reinstalls v12, v11 and v13,
tests rejected history retention, last-admin/non-admin refusal, missing finalize privilege
before writes, partial-preparation retries, and listing/ack beyond 100 candidates.
It checks a rejection excludes a role-holder and that ack creates no member projection.

`src/test/delete-account-endpoint.test.ts` runs the actual endpoint handler with mocked
Auth/storage/RPC and synthetic JWT claims: self/admin missing-RPC refusal, admin permission,
dry-run, last-admin, successful rejected self/admin deletion, finalization failure.
No real identities or tokens are used. This verifies logic, not external production
deployments, managed Auth cascades, or the external cache.

Result: **36 tests passed across 5 files** (SQL integration, endpoint, account client,
bootstrap and membership sync). Preview compilation reports `build OK`. No production
account was deleted, no real admission was created, and no security policy was disabled.