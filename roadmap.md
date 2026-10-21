# Association
- [x] Prepare read-only external SQL diagnostics for duplicate accounts A/B and a conditional Codex handoff for safe relinking; tested on isolated synthetic PostgreSQL, no external access or account changes.
- [x] Extend bootstrap response compatibly, document contract, correct admission display without changing access, and run synthetic tests.
- [x] member_update v2 site side: setup/membership-sync-v14.sql (revisioned events, per-year fees, clear_fields, admission evidence), treasury-sync routing, Area Socio display, contract + synthetic tests.
- [ ] Deploy v14 + treasury-sync + frontend on external project; switch Django importer to v2 events — blocked: external project not connected to this workspace. Order in docs/treasury-sync-contract.md.
- [ ] Deploy compatible bootstrap extension and public admission display on external project; adapt private importer — blocked: external project/importer are not connected to this workspace. No new SQL migration for this extension.
- [x] Diagnose account deletion and founder synchronization; supply safe external SQL repair, synthetic tests and Codex handoff (docs/account-sync-diagnosis.md).
- [ ] Verify external production RPCs/roles/partial-deletion evidence, install v12/v13 and deploy delete-account — blocked: external production instance is not connected to this workspace; run setup/account-sync-diagnostics.sql there first.
- [x] Public association and membership pages with honest pending-material states.
- [x] Admin management of founders/documents and member applications; staff read/download only.
- [x] External-instance SQL with permissions, private uploads and validation.
- [x] Verify public pages, role-control tests and file/contact validation tests.
- [ ] Activate and test live submissions on external instance — blocked by user installing SQL and supplying approved statute/membership form.
- [ ] Publish actual founder identities/photos — waiting for user materials.
# Tesoreria
- [x] Make dashboard fee totals immediately visible in exported Excel viewers while preserving every workbook formula.
- [x] Align exported category fees with dashboard settings without changing formulas or the original workbook (4 tests passed).
- [x] Dashboard, Movimenti, Quote soci, Budget, Rendiconto, Documenti with admin/treasurer roles.
- [x] Excel export into the official template with formula integrity check (tested).
- [x] Unlimited records, fees per fiscal year by CD resolution, treasurer-only access (v2).
- [x] PDF report for the Board.
- [x] Routed /tesoreria app: sidebar/bottom nav, dedicated pages, URL filters, unsaved-changes guard.
- [ ] Live use — blocked by user running /setup/treasury.sql then /setup/treasury-v2.sql on the external instance and assigning the treasurer role.
- [ ] User: run setup/membership-sync-v6.sql on the instance, set secret TREASURY_SYNC_SECRET, deploy treasury-sync, configure the private Treasury per docs/treasury-sync-contract.md
# CMS editoriale
- [x] Client CMS, homepage/footer collegati con fallback, pagine News/Pagine/FAQ, sponsor/partner, modelli Strapi, compose Coolify, doc, test.
- [ ] Deploy Strapi su Coolify e VITE_STRAPI_URL su Vercel — blocked: eseguito dall'utente (docs/strapi-cms-deployment.md).
- [ ] Import testi attuali nel CMS e rimozione fallback — dopo il deploy.
