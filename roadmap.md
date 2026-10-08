# Association
- [x] Public association and membership pages with honest pending-material states.
- [x] Admin management of founders/documents and member applications; staff read/download only.
- [x] External-instance SQL with permissions, private uploads and validation.
- [x] Verify public pages, role-control tests and file/contact validation tests.
- [ ] Activate and test live submissions on external instance — blocked by user installing SQL and supplying approved statute/membership form.
- [ ] Publish actual founder identities/photos — waiting for user materials.
# Tesoreria
- [x] Align exported category fees with dashboard settings without changing formulas or the original workbook (4 tests passed).
- [x] Dashboard, Movimenti, Quote soci, Budget, Rendiconto, Documenti with admin/treasurer roles.
- [x] Excel export into the official template with formula integrity check (tested).
- [x] Unlimited records, fees per fiscal year by CD resolution, treasurer-only access (v2).
- [x] PDF report for the Board.
- [x] Routed /tesoreria app: sidebar/bottom nav, dedicated pages, URL filters, unsaved-changes guard.
- [ ] Live use — blocked by user running /setup/treasury.sql then /setup/treasury-v2.sql on the external instance and assigning the treasurer role.
