const VERSION = '202607190050';
const REFUND_STATUSES = ['requested', 'processing', 'success', 'failed', 'manual_required'];

module.exports = {
  version: VERSION,
  name: 'refund_reconciliation_leases',
  irreversible: true,
  metadata: {
    compatibility: {
      sqlite: 'SQLite 3.24+; adds nullable/defaulted lease/provider fields, an append-only history table, and a reconciliation index',
      postgresql: 'PostgreSQL 12+; adds nullable/defaulted lease/provider fields, an append-only history table, and a reconciliation index',
    },
    deployment: {
      previousReleaseCompatible: true,
      rationale: 'Adds only nullable/defaulted columns, a new history table, and a non-unique reconciliation index. The immediately previous release ignores these additions and its existing refund indexes and writes remain valid during a rolling deployment.',
    },
    dataImpact: 'Existing refund rows keep their status and refund_no. No refund, payment, or order data is rewritten; the new application serializes requests on the payment row and reuses the latest persisted refund_no.',
    recoveryPlan: 'Restore the verified encrypted pre-migration backup if the transaction cannot be retried. After deployment, retain the added columns/history and issue a new forward migration for corrections; do not edit this applied migration.',
  },
  async up({ db, dialect }) {
    const timestampColumn = dialect === 'postgres' ? 'TIMESTAMP' : 'DATETIME';
    const epochColumn = dialect === 'postgres' ? 'BIGINT' : 'INTEGER';
    const idColumn = dialect === 'postgres'
      ? 'BIGSERIAL PRIMARY KEY'
      : 'INTEGER PRIMARY KEY AUTOINCREMENT';

    await db.run('ALTER TABLE refund_records ADD COLUMN provider_refund_id VARCHAR(160)');
    await db.run('ALTER TABLE refund_records ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0)');
    await db.run('ALTER TABLE refund_records ADD COLUMN lease_token VARCHAR(64)');
    await db.run(`ALTER TABLE refund_records ADD COLUMN lease_expires_at ${epochColumn}`);
    await db.run(`ALTER TABLE refund_records ADD COLUMN next_reconcile_at ${epochColumn}`);
    await db.run(`ALTER TABLE refund_records ADD COLUMN last_attempt_at ${timestampColumn}`);
    await db.run('ALTER TABLE refund_records ADD COLUMN last_error TEXT');
    await db.run('ALTER TABLE refund_records ADD COLUMN manual_evidence TEXT');
    await db.run('ALTER TABLE refund_records ADD COLUMN external_reference VARCHAR(160)');
    await db.run('ALTER TABLE refund_records ADD COLUMN manual_completed_by INTEGER');
    await db.run(`ALTER TABLE refund_records ADD COLUMN manual_completed_at ${timestampColumn}`);

    await db.run(`
      CREATE TABLE refund_status_history (
        id ${idColumn},
        refund_id INTEGER NOT NULL,
        from_status VARCHAR(20),
        to_status VARCHAR(20) NOT NULL
          CHECK (to_status IN ('requested', 'processing', 'success', 'failed', 'manual_required')),
        event_type VARCHAR(40) NOT NULL,
        source VARCHAR(20) NOT NULL
          CHECK (source IN ('system', 'provider', 'admin')),
        actor_id INTEGER,
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        provider_refund_id VARCHAR(160),
        external_reference VARCHAR(160),
        evidence TEXT,
        error_message TEXT,
        created_at ${timestampColumn} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (refund_id) REFERENCES refund_records(id) ON DELETE CASCADE
      )
    `);
    await db.run(`
      CREATE INDEX idx_refund_status_history_refund
      ON refund_status_history(refund_id, id)
    `);

    await db.run(`
      CREATE INDEX idx_refund_records_reconcile
      ON refund_records(status, next_reconcile_at, lease_expires_at)
    `);

    const placeholders = REFUND_STATUSES.map(() => '?').join(', ');
    const invalid = await db.get(
      `SELECT COUNT(*) AS count FROM refund_records WHERE status NOT IN (${placeholders})`,
      REFUND_STATUSES
    );
    if (Number(invalid.count) > 0) {
      throw new Error('refund_records contains an unsupported status');
    }
  },
};
