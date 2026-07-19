const VERSION = '202607190030';

module.exports = {
  version: VERSION,
  name: 'verified_phone_authorization_gate',
  metadata: {
    compatibility: {
      sqlite: 'SQLite 3.35+; uses ALTER TABLE ADD/DROP COLUMN and a correlated UPDATE',
      postgresql: 'PostgreSQL 12+; uses ALTER TABLE ADD/DROP COLUMN and a correlated UPDATE',
    },
    deployment: {
      previousReleaseCompatible: true,
      rationale: 'Adds one nullable customer column and backfills only that new column. The immediately previous release neither selects it explicitly nor must provide it on customer writes.',
    },
    dataImpact: 'Adds a nullable phone verification timestamp to customers and backfills customers with an existing successful verification record. Unverified accounts remain restricted.',
    recoveryPlan: 'Before deployment, retain the encrypted database backup. Roll back by dropping the nullable marker column, or restore that backup if dependent code has already been released.',
  },
  async up({ db }) {
    await db.run('ALTER TABLE customers ADD COLUMN phone_verified_at BIGINT');
    await db.run(`
      UPDATE customers
      SET phone_verified_at = (
        SELECT verification.verified_at
        FROM customer_phone_verifications AS verification
        WHERE verification.customer_id = customers.id
      )
      WHERE EXISTS (
        SELECT 1
        FROM customer_phone_verifications AS verification
        WHERE verification.customer_id = customers.id
      )
    `);
  },
  async down({ db }) {
    await db.run('ALTER TABLE customers DROP COLUMN phone_verified_at');
  },
};
