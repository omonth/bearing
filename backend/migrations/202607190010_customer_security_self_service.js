const VERSION = '202607190010';

module.exports = {
  version: VERSION,
  name: 'customer_security_self_service',
  metadata: {
    compatibility: {
      sqlite: 'SQLite 3.24+; uses transactional DDL, CHECK constraints, and partial indexes',
      postgresql: 'PostgreSQL 12+; uses transactional DDL, CHECK constraints, and partial indexes',
    },
    deployment: {
      previousReleaseCompatible: true,
      rationale: 'Creates new empty security tables without changing existing customer columns or constraints. The immediately previous release does not depend on or write these tables.',
    },
    dataImpact: 'Creates empty customer security challenge and phone verification tables. Existing customer passwords, profiles, orders, and verification state are not changed.',
    recoveryPlan: 'Run the down migration before dependent application code is deployed, or restore the verified pre-migration backup. After release, prefer a new forward migration.',
  },
  async up({ db, dialect }) {
    const idColumn = dialect === 'postgres'
      ? 'BIGSERIAL PRIMARY KEY'
      : 'INTEGER PRIMARY KEY AUTOINCREMENT';

    await db.run(`
      CREATE TABLE customer_security_challenges (
        id ${idColumn},
        customer_id INTEGER,
        purpose VARCHAR(32) NOT NULL
          CHECK (purpose IN ('password_reset', 'phone_verification')),
        subject_key CHAR(64) NOT NULL,
        secret_hash CHAR(64) NOT NULL UNIQUE,
        expires_at BIGINT NOT NULL,
        attempts_remaining INTEGER NOT NULL CHECK (attempts_remaining >= 0),
        consumed_at BIGINT,
        created_at_epoch BIGINT NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      )
    `);
    await db.run(`
      CREATE INDEX idx_customer_security_subject
      ON customer_security_challenges(purpose, subject_key, created_at_epoch)
    `);
    await db.run(`
      CREATE INDEX idx_customer_security_active
      ON customer_security_challenges(customer_id, purpose, expires_at)
      WHERE consumed_at IS NULL
    `);

    await db.run(`
      CREATE TABLE customer_phone_verifications (
        id ${idColumn},
        customer_id INTEGER NOT NULL UNIQUE,
        subject_key CHAR(64) NOT NULL,
        verified_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      )
    `);
  },
  async down({ db }) {
    await db.run('DROP TABLE customer_phone_verifications');
    await db.run('DROP TABLE customer_security_challenges');
  },
};
