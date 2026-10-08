# Architecture rules
- Association data access lives in a dedicated validated module using the existing client; managed generated types are not edited because the external schema is installed independently.
- Association membership requests are separate from event registrations, with private user-scoped storage, unique requests per user, and server-enforced admin/staff read permissions.
- External association setup is delivered as an executable SQL script through the application; do not apply it to the managed backend without an explicit request.- Treasury exports patch only empty input cells of the accountant's original workbook (zip/XML level) and abort unless every formula and untouched part is identical to the template; the template is never rebuilt or edited.
- Treasury data lives in external-instance SQL scripts (treasury.sql + treasury-v2.sql) with treasurer-only RLS (admin/staff/board roles never imply access), soft-deleted transactions, closed-year locks and an immutable audit log.
- Membership fees are versioned per fiscal year and category, written only through a security-definer function; dues are always computed from the year's own fees.
- Template row capacity is enforced only at Excel export; the database and dashboard read all rows via pagination and never truncate.

- Founders and board members are derived from user roles assigned in user management; the association tab only stores display order, and the public list exposes only founders/board members via a security-definer function.
- Treasury is a standalone routed app under /tesoreria (guarded layout + one page per entity, filters/year in the URL); modals only for confirmations, so state survives refresh and deep links.
