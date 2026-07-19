# Database migrations

Migration files use immutable 12-digit UTC-style versions:
`YYYYMMDDNNNN_description.js`. Every migration exports `version`, `name`,
`up`, either `down` or `irreversible: true`, and metadata documenting SQLite /
PostgreSQL compatibility, data impact, recovery, and deployment compatibility.
`metadata.deployment.previousReleaseCompatible` must be a boolean stating
whether the immediately previous application release can continue to read and
write after the migration. Its non-empty `rationale` must be based on the
actual DDL, data transformations, constraints, and previous release write
paths; irreversible does not automatically mean incompatible.

The runner records the SHA-256 of the exact migration source in
`schema_migrations`. Changing or deleting an applied file makes `check` and
future `apply` commands fail. Each forward migration and its ledger insert run
in the same database transaction.

`202607180001` is the adoption-safe application baseline. It creates the core,
CRM, payment, notification, AI audit, and supply-chain tables on an empty
database, while existing installations are retained with `CREATE IF NOT
EXISTS` and validated for required columns. `202607180002` contains only
idempotent CRM reference data. Payment callback and refund-state changes remain
the later `202607190001` incremental migration. `202607190050` supports one
stable refund request number per payment and adds provider reconciliation
leases, bounded attempts, operator evidence, and append-only refund history.

The legacy `initDatabase.js` and `db/*.sql` files are no longer part of service
startup. They remain historical/developer utilities while deployments use the
versioned runner as the schema authority.

Operational commands (run from `backend/`):

- `npm run migrate`: apply pending forward migrations.
- `npm run migrate:check`: fail when a migration is pending, missing, or has a
  changed checksum.
- `npm run migrate:rollback-compat`: statically inspect every migration and
  fail when deployment compatibility metadata is missing or any migration is
  not compatible with the immediately previous application release. This
  command does not connect to a database.
- `npm run migrate:status`: show applied and pending versions without applying.
- `npm run migrate:rollback -- <version> --confirm`: roll back only the latest
  reversible migration in a non-production environment.

Production migrations are forward-only. Back up the database before applying
them. For an irreversible migration, follow the recovery plan stored in its
metadata: restore the verified pre-migration backup if the transaction cannot
be retried, or issue a new forward migration after release.
