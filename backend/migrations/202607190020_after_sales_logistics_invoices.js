const VERSION = '202607190020';

module.exports = {
  version: VERSION,
  name: 'after_sales_logistics_invoices',
  metadata: {
    compatibility: {
      sqlite: 'SQLite 3.24+; uses transactional DDL, CHECK constraints, foreign keys, and partial indexes',
      postgresql: 'PostgreSQL 12+; uses transactional DDL, CHECK constraints, foreign keys, and partial indexes',
    },
    deployment: {
      previousReleaseCompatible: true,
      rationale: 'Creates only new after-sales, invoice, and shipment tables and indexes. Existing order, customer, payment, and refund tables used by the immediately previous release remain unchanged.',
    },
    dataImpact: 'Creates empty after-sales, invoice, and shipment records with append-only histories. Existing customers, orders, payments, refunds, and order logistics fields are not rewritten.',
    recoveryPlan: 'Before application traffic uses these tables, run the down migration. After dependent data exists, export all after-sales, invoice, and shipment tables and restore the verified pre-migration backup or issue a new forward migration rather than editing this file.',
  },
  async up({ db, dialect }) {
    const idColumn = dialect === 'postgres'
      ? 'BIGSERIAL PRIMARY KEY'
      : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    const amountColumn = dialect === 'postgres' ? 'DECIMAL(10, 2)' : 'REAL';
    const timestampColumn = dialect === 'postgres' ? 'TIMESTAMP' : 'DATETIME';

    await db.run(`
      CREATE TABLE after_sales_cases (
        id ${idColumn},
        case_no VARCHAR(40) NOT NULL UNIQUE,
        client_request_id VARCHAR(64) NOT NULL,
        request_fingerprint CHAR(64) NOT NULL,
        customer_id INTEGER NOT NULL,
        order_id INTEGER,
        type VARCHAR(32) NOT NULL
          CHECK (type IN ('return_refund', 'refund_only', 'order_exception')),
        reason VARCHAR(120) NOT NULL,
        description TEXT NOT NULL,
        requested_amount ${amountColumn}
          CHECK (requested_amount IS NULL OR requested_amount > 0),
        status VARCHAR(32) NOT NULL DEFAULT 'submitted'
          CHECK (status IN (
            'submitted', 'under_review', 'approved', 'rejected',
            'awaiting_return', 'received', 'refund_processing',
            'completed', 'cancelled'
          )),
        version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
        payment_order_id INTEGER,
        refund_id INTEGER,
        refund_status VARCHAR(32)
          CHECK (refund_status IS NULL OR refund_status IN (
            'requested', 'processing', 'success', 'failed', 'manual_required'
          )),
        resolution_note TEXT,
        created_at ${timestampColumn} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at ${timestampColumn} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(customer_id, client_request_id),
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
        FOREIGN KEY (payment_order_id) REFERENCES payment_orders(id) ON DELETE RESTRICT,
        FOREIGN KEY (refund_id) REFERENCES refund_records(id) ON DELETE SET NULL
      )
    `);
    await db.run(`
      CREATE INDEX idx_after_sales_customer_created
      ON after_sales_cases(customer_id, created_at)
    `);
    await db.run(`
      CREATE INDEX idx_after_sales_order
      ON after_sales_cases(order_id)
    `);
    await db.run(`
      CREATE INDEX idx_after_sales_status_updated
      ON after_sales_cases(status, updated_at)
    `);

    await db.run(`
      CREATE TABLE after_sales_history (
        id ${idColumn},
        case_id INTEGER NOT NULL,
        from_status VARCHAR(32),
        to_status VARCHAR(32) NOT NULL,
        actor_type VARCHAR(20) NOT NULL
          CHECK (actor_type IN ('customer', 'admin', 'payment_system')),
        actor_id INTEGER,
        note TEXT,
        version INTEGER NOT NULL CHECK (version > 0),
        created_at ${timestampColumn} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(case_id, version),
        FOREIGN KEY (case_id) REFERENCES after_sales_cases(id) ON DELETE CASCADE
      )
    `);
    await db.run(`
      CREATE INDEX idx_after_sales_history_case
      ON after_sales_history(case_id, version)
    `);

    await db.run(`
      CREATE TABLE invoice_profiles (
        id ${idColumn},
        customer_id INTEGER NOT NULL,
        title_type VARCHAR(20) NOT NULL
          CHECK (title_type IN ('personal', 'company')),
        title VARCHAR(160) NOT NULL,
        tax_number VARCHAR(32),
        email VARCHAR(254) NOT NULL,
        recipient_phone VARCHAR(20),
        registered_address VARCHAR(300),
        bank_name VARCHAR(160),
        bank_account VARCHAR(64),
        is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
        version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
        created_at ${timestampColumn} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at ${timestampColumn} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      )
    `);
    await db.run(`
      CREATE INDEX idx_invoice_profiles_customer
      ON invoice_profiles(customer_id, created_at)
    `);
    await db.run(`
      CREATE UNIQUE INDEX idx_invoice_profiles_one_default
      ON invoice_profiles(customer_id)
      WHERE is_default = 1
    `);

    await db.run(`
      CREATE TABLE order_invoice_requests (
        id ${idColumn},
        customer_id INTEGER NOT NULL,
        order_id INTEGER NOT NULL UNIQUE,
        invoice_profile_id INTEGER,
        profile_snapshot TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'requested'
          CHECK (status IN ('requested', 'processing', 'issued', 'rejected', 'cancelled')),
        invoice_number VARCHAR(100),
        resolution_note TEXT,
        version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
        issued_at ${timestampColumn},
        created_at ${timestampColumn} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at ${timestampColumn} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
        FOREIGN KEY (invoice_profile_id) REFERENCES invoice_profiles(id) ON DELETE SET NULL
      )
    `);
    await db.run(`
      CREATE INDEX idx_order_invoices_customer
      ON order_invoice_requests(customer_id, created_at)
    `);

    await db.run(`
      CREATE TABLE order_invoice_history (
        id ${idColumn},
        invoice_request_id INTEGER NOT NULL,
        from_status VARCHAR(20),
        to_status VARCHAR(20) NOT NULL,
        actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('customer', 'admin')),
        actor_id INTEGER NOT NULL,
        note TEXT,
        version INTEGER NOT NULL CHECK (version > 0),
        created_at ${timestampColumn} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(invoice_request_id, version),
        FOREIGN KEY (invoice_request_id) REFERENCES order_invoice_requests(id) ON DELETE CASCADE
      )
    `);
    await db.run(`
      CREATE INDEX idx_order_invoice_history_request
      ON order_invoice_history(invoice_request_id, version)
    `);

    await db.run(`
      CREATE TABLE shipment_records (
        id ${idColumn},
        order_id INTEGER NOT NULL UNIQUE,
        carrier VARCHAR(80) NOT NULL,
        tracking_number VARCHAR(100) NOT NULL,
        status VARCHAR(32) NOT NULL
          CHECK (status IN (
            'label_created', 'in_transit', 'out_for_delivery',
            'delivered', 'exception', 'returned'
          )),
        last_location VARCHAR(200),
        note TEXT,
        version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
        occurred_at ${timestampColumn} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at ${timestampColumn} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at ${timestampColumn} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
      )
    `);
    await db.run(`
      CREATE INDEX idx_shipments_status_updated
      ON shipment_records(status, updated_at)
    `);

    await db.run(`
      CREATE TABLE shipment_history (
        id ${idColumn},
        shipment_id INTEGER NOT NULL,
        status VARCHAR(32) NOT NULL,
        carrier VARCHAR(80) NOT NULL,
        tracking_number VARCHAR(100) NOT NULL,
        location VARCHAR(200),
        note TEXT,
        actor_id INTEGER NOT NULL,
        version INTEGER NOT NULL CHECK (version > 0),
        occurred_at ${timestampColumn} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at ${timestampColumn} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(shipment_id, version),
        FOREIGN KEY (shipment_id) REFERENCES shipment_records(id) ON DELETE CASCADE
      )
    `);
    await db.run(`
      CREATE INDEX idx_shipment_history_shipment
      ON shipment_history(shipment_id, version)
    `);
  },
  async down({ db }) {
    await db.run('DROP TABLE shipment_history');
    await db.run('DROP TABLE shipment_records');
    await db.run('DROP TABLE order_invoice_history');
    await db.run('DROP TABLE order_invoice_requests');
    await db.run('DROP TABLE invoice_profiles');
    await db.run('DROP TABLE after_sales_history');
    await db.run('DROP TABLE after_sales_cases');
  },
};
