# Architecture rules
- Association data access lives in a dedicated validated module using the existing client; managed generated types are not edited because the external schema is installed independently.
- Association membership requests are separate from event registrations, with private user-scoped storage, unique requests per user, and server-enforced admin/staff read permissions.
- External association setup is delivered as an executable SQL script through the application; do not apply it to the managed backend without an explicit request.- Treasury exports patch only empty input cells of the accountant's original workbook (zip/XML level) and abort unless every formula and untouched part is identical to the template; the template is never rebuilt or edited.
- Treasury data lives in an external-instance SQL script with admin/treasurer RLS, soft-deleted transactions, closed-year locks and an immutable audit log.
