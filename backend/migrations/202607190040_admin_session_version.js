const VERSION = '202607190040';

module.exports = {
  version: VERSION,
  name: 'admin_session_version',
  metadata: {
    compatibility: {
      sqlite: 'SQLite 3.35+; adds and can drop a constrained integer column',
      postgresql: 'PostgreSQL 12+; adds and can drop a constrained integer column',
    },
    deployment: {
      previousReleaseCompatible: true,
      rationale: 'Adds a NOT NULL column with a database default, so administrator inserts from the immediately previous release need no new value and its existing reads ignore the extra column.',
    },
    dataImpact: 'Adds session_version=1 to every administrator. Existing administrator JWTs intentionally fail closed because they do not carry this version.',
    recoveryPlan: 'Keep the encrypted pre-release backup. Roll back application code first, then drop session_version, or restore the backup if the deployment cannot be recovered forward.',
  },
  async up({ db }) {
    await db.run(`
      ALTER TABLE admins
      ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1
        CHECK (session_version >= 1)
    `);
  },
  async down({ db }) {
    await db.run('ALTER TABLE admins DROP COLUMN session_version');
  },
};
