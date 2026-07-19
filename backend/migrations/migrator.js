const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_MIGRATION_DIRECTORY = __dirname;
const MIGRATION_FILE_PATTERN = /^(\d{12})_([a-z0-9_]+)\.js$/;

class MigrationError extends Error {
  constructor(message, code = 'MIGRATION_ERROR') {
    super(message);
    this.name = 'MigrationError';
    this.code = code;
  }
}

function calculateChecksum(filePath) {
  const normalizedSource = fs.readFileSync(filePath, 'utf8').replaceAll('\r\n', '\n');
  return crypto.createHash('sha256').update(normalizedSource, 'utf8').digest('hex');
}

function validateDefinition(definition, fileVersion, fileName) {
  if (!definition || definition.version !== fileVersion) {
    throw new MigrationError(
      `Migration ${fileName} must export the same version as its filename`,
      'INVALID_MIGRATION'
    );
  }
  if (!definition.name || typeof definition.up !== 'function') {
    throw new MigrationError(
      `Migration ${fileName} must export name and up`,
      'INVALID_MIGRATION'
    );
  }
  if (!definition.irreversible && typeof definition.down !== 'function') {
    throw new MigrationError(
      `Migration ${fileName} must export down or be marked irreversible`,
      'INVALID_MIGRATION'
    );
  }

  const metadata = definition.metadata;
  if (
    !metadata?.compatibility?.sqlite
    || !metadata.compatibility.postgresql
    || !metadata.dataImpact
    || !metadata.recoveryPlan
  ) {
    throw new MigrationError(
      `Migration ${fileName} must document engine compatibility, data impact, and recovery plan`,
      'INVALID_MIGRATION'
    );
  }

  const deployment = metadata.deployment;
  if (
    typeof deployment?.previousReleaseCompatible !== 'boolean'
    || typeof deployment.rationale !== 'string'
    || deployment.rationale.trim().length === 0
  ) {
    throw new MigrationError(
      `Migration ${fileName} must document deployment.previousReleaseCompatible as a boolean and provide a rationale`,
      'INVALID_MIGRATION'
    );
  }
}

function loadMigrations(migrationDirectory = DEFAULT_MIGRATION_DIRECTORY) {
  const migrations = fs.readdirSync(migrationDirectory)
    .filter((fileName) => MIGRATION_FILE_PATTERN.test(fileName))
    .sort()
    .map((fileName) => {
      const match = fileName.match(MIGRATION_FILE_PATTERN);
      const filePath = path.join(migrationDirectory, fileName);
      const version = match[1];
      delete require.cache[require.resolve(filePath)];
      const definition = require(filePath);
      validateDefinition(definition, version, fileName);
      return {
        version,
        fileName,
        filePath,
        checksum: calculateChecksum(filePath),
        definition,
      };
    });

  const seen = new Set();
  for (const migration of migrations) {
    if (seen.has(migration.version)) {
      throw new MigrationError(
        `Duplicate migration version ${migration.version}`,
        'DUPLICATE_MIGRATION'
      );
    }
    seen.add(migration.version);
  }

  return migrations;
}

function checkRollbackCompatibility(options = {}) {
  const migrationDirectory = options.migrationDirectory || DEFAULT_MIGRATION_DIRECTORY;
  const catalog = loadMigrations(migrationDirectory);
  const incompatible = catalog.filter(
    (migration) => !migration.definition.metadata.deployment.previousReleaseCompatible
  );

  if (incompatible.length > 0) {
    const details = incompatible
      .map((migration) => (
        `${migration.version} (${migration.definition.name}): `
        + migration.definition.metadata.deployment.rationale
      ))
      .join('; ');
    throw new MigrationError(
      `Automatic application rollback is unsafe after migration(s): ${details}`,
      'ROLLBACK_INCOMPATIBLE_MIGRATION'
    );
  }

  return {
    compatible: true,
    checked: catalog.map((migration) => ({
      version: migration.version,
      name: migration.definition.name,
      rationale: migration.definition.metadata.deployment.rationale,
    })),
  };
}

async function ensureMigrationTable(db) {
  const idColumn = db.type === 'postgres'
    ? 'BIGSERIAL PRIMARY KEY'
    : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const timestampColumn = db.type === 'postgres'
    ? 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
    : 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP';

  await db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id ${idColumn},
      version VARCHAR(12) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      checksum CHAR(64) NOT NULL,
      execution_ms INTEGER NOT NULL,
      metadata TEXT NOT NULL,
      applied_at ${timestampColumn}
    )
  `);
  await db.run(`
    CREATE TABLE IF NOT EXISTS schema_migration_lock (
      id INTEGER PRIMARY KEY,
      lock_key VARCHAR(32) NOT NULL UNIQUE
    )
  `);
}

async function acquireMigrationLock(db, dialect) {
  await db.run(`
    INSERT INTO schema_migration_lock (id, lock_key)
    VALUES (1, 'global')
    ON CONFLICT(id) DO NOTHING
  `);
  const lockClause = dialect === 'postgres' ? ' FOR UPDATE' : '';
  await db.get(`SELECT id FROM schema_migration_lock WHERE id = ?${lockClause}`, [1]);
}

async function readAppliedMigrations(db) {
  return db.all(`
    SELECT version, name, checksum, execution_ms, metadata, applied_at
    FROM schema_migrations
    ORDER BY version
  `);
}

function verifyAppliedMigrations(catalog, applied) {
  const catalogByVersion = new Map(catalog.map((migration) => [migration.version, migration]));

  for (const record of applied) {
    const migration = catalogByVersion.get(record.version);
    if (!migration) {
      throw new MigrationError(
        `Applied migration ${record.version} is missing from source control`,
        'MIGRATION_MISSING'
      );
    }
    if (migration.checksum !== record.checksum) {
      throw new MigrationError(
        `Migration ${record.version} checksum mismatch; applied migrations are immutable`,
        'CHECKSUM_MISMATCH'
      );
    }
  }
}

async function getMigrationStatus(db, options = {}) {
  const migrationDirectory = options.migrationDirectory || DEFAULT_MIGRATION_DIRECTORY;
  const catalog = loadMigrations(migrationDirectory);
  await ensureMigrationTable(db);
  const appliedRecords = await readAppliedMigrations(db);
  verifyAppliedMigrations(catalog, appliedRecords);

  const appliedVersions = new Set(appliedRecords.map((record) => record.version));
  return {
    applied: appliedRecords.map((record) => record.version),
    pending: catalog
      .filter((migration) => !appliedVersions.has(migration.version))
      .map((migration) => migration.version),
    records: appliedRecords,
  };
}

async function applyMigrations(db, options = {}) {
  const migrationDirectory = options.migrationDirectory || DEFAULT_MIGRATION_DIRECTORY;
  const catalog = loadMigrations(migrationDirectory);
  await ensureMigrationTable(db);

  try {
    return await db.transaction(async (transaction) => {
      await acquireMigrationLock(transaction, db.type);
      const existing = await readAppliedMigrations(transaction);
      verifyAppliedMigrations(catalog, existing);

      const appliedVersions = new Set(existing.map((record) => record.version));
      const pending = catalog.filter((migration) => !appliedVersions.has(migration.version));
      const applied = [];

      for (const migration of pending) {
        const startedAt = Date.now();
        await migration.definition.up({
          db: transaction,
          dialect: db.type,
        });
        await transaction.run(
          `INSERT INTO schema_migrations
             (version, name, checksum, execution_ms, metadata)
           VALUES (?, ?, ?, ?, ?)`,
          [
            migration.version,
            migration.definition.name,
            migration.checksum,
            Date.now() - startedAt,
            JSON.stringify(migration.definition.metadata),
          ]
        );
        applied.push(migration.version);
      }

      return { applied, pending: [] };
    });
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    throw new MigrationError(
      `Migration apply failed and was rolled back: ${error.message}`,
      'MIGRATION_FAILED'
    );
  }
}

async function checkMigrations(db, options = {}) {
  const status = await getMigrationStatus(db, options);
  if (status.pending.length > 0) {
    throw new MigrationError(
      `Pending migration(s): ${status.pending.join(', ')}`,
      'PENDING_MIGRATIONS'
    );
  }
  return status;
}

async function rollbackLastMigration(db, options = {}) {
  const migrationDirectory = options.migrationDirectory || DEFAULT_MIGRATION_DIRECTORY;
  const catalog = loadMigrations(migrationDirectory);
  await ensureMigrationTable(db);

  try {
    return await db.transaction(async (transaction) => {
      await acquireMigrationLock(transaction, db.type);
      const applied = await readAppliedMigrations(transaction);
      verifyAppliedMigrations(catalog, applied);

      const lastApplied = applied.at(-1);
      if (!lastApplied) {
        throw new MigrationError('No applied migration is available to roll back', 'NOTHING_TO_ROLLBACK');
      }
      if (options.confirmedVersion !== lastApplied.version) {
        throw new MigrationError(
          `Rollback requires explicit confirmation of version ${lastApplied.version}`,
          'ROLLBACK_CONFIRMATION_REQUIRED'
        );
      }

      const migration = catalog.find((candidate) => candidate.version === lastApplied.version);
      if (migration.definition.irreversible || typeof migration.definition.down !== 'function') {
        throw new MigrationError(
          `Migration ${lastApplied.version} is irreversible. Recovery plan: ${migration.definition.metadata.recoveryPlan}`,
          'IRREVERSIBLE_MIGRATION'
        );
      }

      await migration.definition.down({ db: transaction, dialect: db.type });
      await transaction.run('DELETE FROM schema_migrations WHERE version = ?', [lastApplied.version]);
      return { rolledBack: lastApplied.version };
    });
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    throw new MigrationError(
      `Rollback failed and was reverted: ${error.message}`,
      'ROLLBACK_FAILED'
    );
  }
}

module.exports = {
  DEFAULT_MIGRATION_DIRECTORY,
  MigrationError,
  applyMigrations,
  checkRollbackCompatibility,
  checkMigrations,
  getMigrationStatus,
  loadMigrations,
  rollbackLastMigration,
};
