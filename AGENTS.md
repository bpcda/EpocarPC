# Architecture rules
- Association data access lives in a dedicated validated module using the existing client; managed generated types are not edited because the external schema is installed independently.
- Association membership requests are separate from event registrations, with private user-scoped storage, unique requests per user, and server-enforced admin/staff read permissions.
- External association setup is delivered as executable SQL scripts in the repository setup/ folder (never served publicly); do not apply it to the managed backend without an explicit request.
- Treasury exports patch empty input cells, the four category fee lookup values, and formula caches in the exported copy (zip/XML level), using the dashboard's yearly settings; every formula and otherwise untouched part remains identical and the original template is never edited.
- Treasury data lives in external-instance SQL scripts (treasury.sql + treasury-v2.sql) with treasurer-only RLS (admin/staff/board roles never imply access), soft-deleted transactions, closed-year locks and an immutable audit log.
- Membership fees are versioned per fiscal year and category, written only through a security-definer function; dues are always computed from the year's own fees.
- Template row capacity is enforced only at Excel export; the database and dashboard read all rows via pagination and never truncate.

- Founders and board members are derived from user roles assigned in user management; the association tab only stores display order, and the public list exposes only founders/board members via a security-definer function.
- Treasury UI is not mounted in the public router (hosted privately); treasury pages/libs stay in the repo but no public route or link may reference them.
- Membership exists only through a recorded Board admission (treasury-v5.sql): card numbers come from a sequence solely at approval, are immutable except via a logged admin correction, and every associative event goes to an immutable history; names are not unique, so UIs show name plus card number or "Non assegnato".
- The treasury member register is the single source of members; site accounts link optionally by email (treasury-v4.sql), and the register drives the category role, never the reverse except for the one-off reconciliation.

- Portal account deletion runs only in the delete-account Edge Function (JWT-derived self target, server-checked admin, service-only SQL in setup/account-deletion-v8.sql); it never deletes Treasury data, only unlinks the member, and blocks email auto-relink.
- Membership decisions come only from the private Treasury via the treasury-sync Edge Function (shared-secret, idempotent, service-only SQL functions in setup/membership-sync-v6.sql); the public site only creates/submits its own application and reads its own member_public_status projection.
- Treasury-only assets (Excel template) are imported from src/assets/treasury so they are bundled only with the private treasury app, never placed in public/.
- The public admission application is an electronic multi-step frontend of membership_applications (setup/membership-application-v7.sql): applicant fields and per-declaration acceptance timestamps only, editable solely while draft, submitted_at and required-field checks enforced by a DB trigger; no decisions from the site. Electronic applications never depend on the uploaded statute/form documents (v9 makes their paths optional).
- Event timing (upcoming/current/past, countdown eligibility) is derived at read time in Europe/Rome via src/lib/event-time.ts, never stored; a DB trigger keeps at most one homepage countdown flag.
- Editorial content comes from a self-hosted Strapi (deploy/strapi) via the read-only client src/lib/cms.ts (VITE_STRAPI_URL, published only, no browser token, cached + hardcoded fallbacks); operational data (auth, members, applications, events, treasury) never moves to the CMS.
