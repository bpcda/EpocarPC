# Architecture rules
- Association data access lives in a dedicated validated module using the existing client; managed generated types are not edited because the external schema is installed independently.
- Association membership requests are separate from event registrations, with private user-scoped storage, unique requests per user, and server-enforced admin/staff read permissions.
- External association setup is delivered as an executable SQL script through the application; do not apply it to the managed backend without an explicit request.