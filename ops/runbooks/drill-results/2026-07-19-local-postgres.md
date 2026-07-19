# Local PostgreSQL encrypted restore drill - 2026-07-19

## Scope

- Source: the running local PostgreSQL 15 database after all eight release migrations.
- Tooling: `pg_dump` and `pg_restore` 15.18 from the final backend image.
- Backup format: PostgreSQL custom archive streamed directly through AES-256-GCM.
- Restore target: an isolated `bearing_restore_verify_<timestamp>` database on the local PostgreSQL instance.
- Offsite upload and alert delivery were disabled for this local drill.

## Result

| Check | Result |
|---|---|
| Encrypted backup and manifest | Passed (`159,172` encrypted bytes) |
| GCM authentication, manifest size and SHA-256 before restore | Passed |
| PostgreSQL restore | Passed in `1,420 ms` tool time (`2,203 ms` container wall time) |
| Restore plus successful integrity validation | Approximately `4,303 ms` after target creation |
| Public tables / total rows compared | `39 / 29` |
| Exact per-table row counts and content hashes | Matched |
| Columns / constraints / indexes / foreign keys / sequences | Matched (`393 / 128 / 133 / 36 / 38`) |
| Isolated restore database cleanup | Passed |

The final release-candidate backend image was exercised after all application and dependency
changes. Its restore command required the companion manifest and verified the encrypted archive
size, SHA-256 and AES-GCM authentication before passing data to `pg_restore`. Integrity validation
compared every public table by row count and a deterministic content hash, then compared columns,
foreign keys, sequences and index/constraint semantics. PostgreSQL rewrites equivalent array casts
and OID-derived `NOT NULL` names when restoring into a new database, so only those representation
details were normalized; columns, operators, constants and ordering remained part of the check.
The exact isolated target database was removed and its absence was confirmed through `pg_database`.

The latest retained encrypted drill archive and its manifest are outside the Git working tree under
`%LOCALAPPDATA%\BearingSales\backups\final-20260719140106`. Its key is stored separately under
`%LOCALAPPDATA%\BearingSales\keys\drill-20260719120014.key` and is not present in this repository,
image, manifest, or log.

## Issue found and corrected

The first real restore attempt exposed a PostgreSQL client/server compatibility problem: an
unversioned Alpine package installed PostgreSQL 18 client tools while the database server is
PostgreSQL 15. The PostgreSQL 18 dump contained `transaction_timeout`, which PostgreSQL 15 does
not support. The backend image now pins PostgreSQL 15 client tools and compiles native Node
dependencies against the runtime glibc. Image-level `sqlite3` loading and both PostgreSQL tool
versions were verified before the successful drill.

## Remaining production evidence

This is not a production disaster-recovery certification. A release gate still requires a drill
against the production-sized PostgreSQL topology and the real offsite S3-compatible bucket,
including TLS, immutable retention/Object Lock, credential rotation, success/failure alerting,
download throughput, foreign-key checks, business amount reconciliation, and documented RPO/RTO.
