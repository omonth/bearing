const VERSION = '202607190001';
const REFUND_STATUSES = ['requested', 'processing', 'success', 'failed', 'manual_required'];

async function tableExists(db, dialect, tableName) {
  if (dialect === 'postgres') {
    const row = await db.get(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = ?`,
      [tableName]
    );
    return Boolean(row);
  }

  const row = await db.get(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  );
  return Boolean(row);
}

async function assertKnownRefundStatuses(db) {
  const placeholders = REFUND_STATUSES.concat(['pending', 'refunded']).map(() => '?').join(', ');
  const invalid = await db.get(
    `SELECT COUNT(*) AS count
     FROM refund_records
     WHERE status IS NOT NULL AND status NOT IN (${placeholders})`,
    REFUND_STATUSES.concat(['pending', 'refunded'])
  );
  if (Number(invalid.count) > 0) {
    throw new Error('refund_records contains unknown statuses; reconcile them before migration');
  }
}

async function createCallbackTable(db, dialect) {
  const idColumn = dialect === 'postgres'
    ? 'BIGSERIAL PRIMARY KEY'
    : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const timestampColumn = dialect === 'postgres' ? 'TIMESTAMP' : 'DATETIME';
  const eventTimestampColumn = dialect === 'postgres' ? 'BIGINT' : 'INTEGER';

  await db.run(`
    CREATE TABLE IF NOT EXISTS payment_callback_events (
      id ${idColumn},
      provider VARCHAR(20) NOT NULL,
      event_id VARCHAR(128) NOT NULL,
      event_key CHAR(64) NOT NULL,
      signature_nonce VARCHAR(128) NOT NULL,
      event_timestamp ${eventTimestampColumn} NOT NULL,
      transaction_id VARCHAR(100) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'processing',
      processing_started_at ${eventTimestampColumn} NOT NULL,
      processed_at ${timestampColumn},
      created_at ${timestampColumn} DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, event_id),
      UNIQUE(provider, event_key),
      UNIQUE(provider, signature_nonce, event_timestamp)
    )
  `);
  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_payment_callback_transaction
    ON payment_callback_events(provider, transaction_id)
  `);
}

async function createRefundTable(db, dialect) {
  const idColumn = dialect === 'postgres'
    ? 'BIGSERIAL PRIMARY KEY'
    : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const amountColumn = dialect === 'postgres' ? 'DECIMAL(10, 2)' : 'REAL';
  const timestampColumn = dialect === 'postgres' ? 'TIMESTAMP' : 'DATETIME';

  await db.run(`
    CREATE TABLE refund_records (
      id ${idColumn},
      payment_order_id INTEGER NOT NULL,
      refund_amount ${amountColumn} NOT NULL CHECK (refund_amount >= 0),
      refund_reason TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested', 'processing', 'success', 'failed', 'manual_required')),
      refund_no VARCHAR(100) UNIQUE,
      refunded_at ${timestampColumn},
      created_at ${timestampColumn} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (payment_order_id) REFERENCES payment_orders(id) ON DELETE RESTRICT
    )
  `);
}

async function rebuildSqliteRefundTable(db) {
  await assertKnownRefundStatuses(db);
  const temporaryTable = `refund_records_migration_${VERSION}`;
  if (await tableExists(db, 'sqlite', temporaryTable)) {
    throw new Error(`${temporaryTable} already exists; inspect it before retrying`);
  }

  await db.run(`
    CREATE TABLE ${temporaryTable} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_order_id INTEGER NOT NULL,
      refund_amount REAL NOT NULL CHECK (refund_amount >= 0),
      refund_reason TEXT,
      status TEXT NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested', 'processing', 'success', 'failed', 'manual_required')),
      refund_no TEXT UNIQUE,
      refunded_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (payment_order_id) REFERENCES payment_orders(id) ON DELETE RESTRICT
    )
  `);
  await db.run(`
    INSERT INTO ${temporaryTable}
      (id, payment_order_id, refund_amount, refund_reason, status, refund_no, refunded_at, created_at)
    SELECT
      id,
      payment_order_id,
      refund_amount,
      refund_reason,
      CASE
        WHEN status IS NULL OR status = 'pending' THEN 'requested'
        WHEN status = 'refunded' THEN 'success'
        ELSE status
      END,
      refund_no,
      refunded_at,
      created_at
    FROM refund_records
  `);
  await db.run('DROP TABLE refund_records');
  await db.run(`ALTER TABLE ${temporaryTable} RENAME TO refund_records`);
}

async function upgradePostgresRefundTable(db) {
  await assertKnownRefundStatuses(db);
  await db.run(`
    UPDATE refund_records
    SET status = CASE
      WHEN status IS NULL OR status = 'pending' THEN 'requested'
      WHEN status = 'refunded' THEN 'success'
      ELSE status
    END
  `);
  await db.run("ALTER TABLE refund_records ALTER COLUMN status SET DEFAULT 'requested'");
  await db.run('ALTER TABLE refund_records ALTER COLUMN status SET NOT NULL');
  await db.run('ALTER TABLE refund_records DROP CONSTRAINT IF EXISTS refund_records_status_check');
  await db.run(`
    ALTER TABLE refund_records
    ADD CONSTRAINT refund_records_status_check
    CHECK (status IN ('requested', 'processing', 'success', 'failed', 'manual_required'))
  `);
}

async function ensurePaymentIndexes(db, paymentOrdersExist) {
  if (!paymentOrdersExist) return;
  await db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_transaction_id
    ON payment_orders(transaction_id)
  `);
}

async function ensureRefundIndexes(db, refundRecordsExist) {
  if (!refundRecordsExist) return;
  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_refund_payment_order
    ON refund_records(payment_order_id)
  `);
  await db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_records_refund_no
    ON refund_records(refund_no)
  `);
  await db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_records_active_payment
    ON refund_records(payment_order_id)
    WHERE status IN ('requested', 'processing', 'success', 'manual_required')
  `);
}

module.exports = {
  version: VERSION,
  name: 'payment_callback_and_refund_state_model',
  irreversible: true,
  metadata: {
    compatibility: {
      sqlite: 'SQLite 3.24+; uses transactional DDL, table rebuild, and partial indexes',
      postgresql: 'PostgreSQL 12+; uses transactional DDL and partial indexes',
    },
    deployment: {
      previousReleaseCompatible: true,
      rationale: 'Keeps every refund column used by the immediately previous release, whose refund path explicitly writes status success. Legacy pending/refunded values are normalized, while the callback table and indexes are additive.',
    },
    dataImpact: 'Maps legacy pending refunds to requested and legacy refunded rows to success. Unknown statuses and duplicate active refunds fail the migration for manual reconciliation.',
    recoveryPlan: 'Restore the pre-migration encrypted database backup if the transaction cannot be safely retried. After release, prefer a new forward migration; do not edit this applied file.',
  },
  async up({ db, dialect }) {
    await createCallbackTable(db, dialect);

    const paymentOrdersExist = await tableExists(db, dialect, 'payment_orders');
    let refundRecordsExist = await tableExists(db, dialect, 'refund_records');
    await ensurePaymentIndexes(db, paymentOrdersExist);

    if (refundRecordsExist) {
      if (dialect === 'postgres') await upgradePostgresRefundTable(db);
      else await rebuildSqliteRefundTable(db);
    } else if (paymentOrdersExist) {
      await createRefundTable(db, dialect);
      refundRecordsExist = true;
    }

    await ensureRefundIndexes(db, refundRecordsExist);
  },
};
