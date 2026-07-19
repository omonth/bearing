const VERSION = '202607180001';

function schemaTypes(dialect) {
  return {
    id: dialect === 'postgres' ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT',
    amount: 'DECIMAL(10, 2)',
    timestamp: dialect === 'postgres' ? 'TIMESTAMP' : 'DATETIME',
    boolean: dialect === 'postgres' ? 'BOOLEAN' : 'INTEGER',
  };
}

async function columnNames(db, dialect, tableName) {
  if (dialect === 'postgres') {
    const rows = await db.all(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = ?`,
      [tableName]
    );
    return new Set(rows.map((row) => row.column_name));
  }
  const rows = await db.all(`PRAGMA table_info(${tableName})`);
  return new Set(rows.map((row) => row.name));
}

async function addColumnIfMissing(db, dialect, tableName, columnName, definition) {
  const columns = await columnNames(db, dialect, tableName);
  if (!columns.has(columnName)) {
    await db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function assertColumns(db, dialect, tableName, requiredColumns) {
  const columns = await columnNames(db, dialect, tableName);
  const missing = requiredColumns.filter((column) => !columns.has(column));
  if (missing.length > 0) {
    throw new Error(
      `Existing table ${tableName} is incompatible; missing columns: ${missing.join(', ')}`
    );
  }
}

async function createTables(db, dialect) {
  const type = schemaTypes(dialect);
  const statements = [
    `CREATE TABLE IF NOT EXISTS bearings (
      id ${type.id}, name TEXT NOT NULL, model VARCHAR(100) NOT NULL,
      price ${type.amount} NOT NULL CHECK (price >= 0), image TEXT, category TEXT NOT NULL,
      inner_diameter TEXT, outer_diameter TEXT, width TEXT,
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0), description TEXT,
      created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP,
      updated_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id ${type.id}, customer_name TEXT, customer_phone VARCHAR(20), province TEXT,
      city TEXT, district TEXT, address_detail TEXT, total_price ${type.amount} NOT NULL,
      status VARCHAR(50) DEFAULT 'pending', tracking_number TEXT,
      shipped_at ${type.timestamp}, completed_at ${type.timestamp},
      created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS admins (
      id ${type.id}, username VARCHAR(100) UNIQUE NOT NULL, password TEXT NOT NULL,
      email TEXT, role VARCHAR(50) DEFAULT 'admin',
      created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP, last_login ${type.timestamp}
    )`,
    `CREATE TABLE IF NOT EXISTS customers (
      id ${type.id}, name TEXT NOT NULL, phone VARCHAR(20) UNIQUE NOT NULL,
      password TEXT, email TEXT, company TEXT, address TEXT,
      level VARCHAR(50) DEFAULT 'bronze', points INTEGER DEFAULT 0,
      total_spent ${type.amount} DEFAULT 0, total_orders INTEGER DEFAULT 0,
      tags TEXT, notes TEXT, status VARCHAR(50) DEFAULT 'active',
      created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP,
      updated_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS customer_addresses (
      id ${type.id}, customer_id INTEGER NOT NULL,
      recipient_name TEXT NOT NULL, recipient_phone VARCHAR(20) NOT NULL,
      province TEXT NOT NULL, city TEXT NOT NULL, district TEXT NOT NULL,
      address_detail TEXT NOT NULL, postal_code TEXT,
      is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
      created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP,
      updated_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS order_items (
      id ${type.id}, order_id INTEGER NOT NULL, bearing_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      price ${type.amount} NOT NULL CHECK (price >= 0),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (bearing_id) REFERENCES bearings(id) ON DELETE RESTRICT
    )`,
    `CREATE TABLE IF NOT EXISTS order_status_history (
      id ${type.id}, order_id INTEGER NOT NULL, old_status VARCHAR(50),
      new_status VARCHAR(50) NOT NULL, note TEXT,
      created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS payment_orders (
      id ${type.id}, order_id INTEGER NOT NULL, payment_method VARCHAR(20) NOT NULL,
      amount ${type.amount} NOT NULL CHECK (amount >= 0), status VARCHAR(20) DEFAULT 'pending',
      transaction_id VARCHAR(100), trade_no VARCHAR(100), payer_info TEXT,
      paid_at ${type.timestamp}, created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
    )`,
    `CREATE TABLE IF NOT EXISTS refund_records (
      id ${type.id}, payment_order_id INTEGER NOT NULL,
      refund_amount ${type.amount} NOT NULL CHECK (refund_amount >= 0),
      refund_reason TEXT, status VARCHAR(20) NOT NULL DEFAULT 'pending',
      refund_no VARCHAR(100), refunded_at ${type.timestamp},
      created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (payment_order_id) REFERENCES payment_orders(id) ON DELETE RESTRICT
    )`,
    `CREATE TABLE IF NOT EXISTS customer_levels (
      id ${type.id}, level VARCHAR(20) UNIQUE NOT NULL, name TEXT NOT NULL,
      min_points INTEGER NOT NULL, discount_rate DECIMAL(5, 2) DEFAULT 0,
      benefits TEXT, color VARCHAR(20)
    )`,
    `CREATE TABLE IF NOT EXISTS points_records (
      id ${type.id}, customer_id INTEGER NOT NULL, points INTEGER NOT NULL,
      type VARCHAR(20) NOT NULL, reason TEXT, order_id INTEGER,
      created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS coupons (
      id ${type.id}, code VARCHAR(50) UNIQUE NOT NULL, name TEXT NOT NULL,
      type VARCHAR(20) NOT NULL, discount_value ${type.amount} NOT NULL,
      min_order_amount ${type.amount} DEFAULT 0, max_discount ${type.amount},
      total_quantity INTEGER, used_quantity INTEGER DEFAULT 0,
      valid_from ${type.timestamp}, valid_until ${type.timestamp},
      status VARCHAR(20) DEFAULT 'active', created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS customer_coupons (
      id ${type.id}, customer_id INTEGER NOT NULL, coupon_id INTEGER NOT NULL,
      status VARCHAR(20) DEFAULT 'unused', used_at ${type.timestamp}, used_order_id INTEGER,
      created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS customer_tags (
      id ${type.id}, name VARCHAR(50) UNIQUE NOT NULL, color VARCHAR(20),
      description TEXT, created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS customer_interactions (
      id ${type.id}, customer_id INTEGER NOT NULL, type VARCHAR(20) NOT NULL,
      content TEXT, operator TEXT, created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS customer_feedback (
      id ${type.id}, customer_id INTEGER NOT NULL, order_id INTEGER, rating INTEGER,
      content TEXT, reply TEXT, status VARCHAR(20) DEFAULT 'pending',
      created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP, replied_at ${type.timestamp},
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id ${type.id}, user_id INTEGER, type VARCHAR(50) NOT NULL DEFAULT 'system',
      title TEXT NOT NULL, message TEXT NOT NULL, data TEXT,
      is_read ${type.boolean} NOT NULL DEFAULT FALSE,
      created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS ai_users (
      id ${type.id}, username VARCHAR(100) NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor', 'admin')),
      created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP, last_login ${type.timestamp}
    )`,
    `CREATE TABLE IF NOT EXISTS ai_operation_logs (
      id ${type.id}, admin_id INTEGER NOT NULL, admin_username TEXT NOT NULL,
      action VARCHAR(20) NOT NULL CHECK (action IN ('create', 'update', 'delete', 'query')),
      target_table TEXT, target_id INTEGER, before_value TEXT, after_value TEXT,
      reason TEXT, status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'executed', 'cancelled', 'rolled_back')),
      created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP, executed_at ${type.timestamp}
    )`,
    `CREATE TABLE IF NOT EXISTS suppliers (
      id ${type.id}, name TEXT NOT NULL, contact_person TEXT, phone VARCHAR(20), email TEXT,
      address TEXT, bank_account TEXT, tax_id TEXT, rating INTEGER DEFAULT 5,
      status VARCHAR(20) DEFAULT 'active', notes TEXT,
      created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP,
      updated_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS purchase_orders (
      id ${type.id}, order_number VARCHAR(50) UNIQUE NOT NULL, supplier_id INTEGER NOT NULL,
      total_amount ${type.amount} NOT NULL, status VARCHAR(20) DEFAULT 'pending',
      order_date ${type.timestamp} DEFAULT CURRENT_TIMESTAMP,
      expected_date ${type.timestamp}, received_date ${type.timestamp}, notes TEXT,
      created_by INTEGER, created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT
    )`,
    `CREATE TABLE IF NOT EXISTS purchase_order_items (
      id ${type.id}, purchase_order_id INTEGER NOT NULL, bearing_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL, unit_price ${type.amount} NOT NULL,
      received_quantity INTEGER DEFAULT 0,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (bearing_id) REFERENCES bearings(id) ON DELETE RESTRICT
    )`,
    `CREATE TABLE IF NOT EXISTS stock_in_records (
      id ${type.id}, purchase_order_id INTEGER, bearing_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL, unit_cost ${type.amount} NOT NULL, batch_number TEXT,
      warehouse_location TEXT, operator TEXT, notes TEXT,
      created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT,
      FOREIGN KEY (bearing_id) REFERENCES bearings(id) ON DELETE RESTRICT
    )`,
    `CREATE TABLE IF NOT EXISTS stock_out_records (
      id ${type.id}, order_id INTEGER, bearing_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL, unit_cost ${type.amount}, batch_number TEXT,
      operator TEXT, notes TEXT, created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
      FOREIGN KEY (bearing_id) REFERENCES bearings(id) ON DELETE RESTRICT
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_costs (
      id ${type.id}, bearing_id INTEGER NOT NULL, batch_number TEXT,
      quantity INTEGER NOT NULL, unit_cost ${type.amount} NOT NULL,
      remaining_quantity INTEGER NOT NULL, purchase_date ${type.timestamp},
      created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bearing_id) REFERENCES bearings(id) ON DELETE RESTRICT
    )`,
    `CREATE TABLE IF NOT EXISTS supplier_products (
      id ${type.id}, supplier_id INTEGER NOT NULL, bearing_id INTEGER NOT NULL,
      supplier_price ${type.amount}, lead_time_days INTEGER, min_order_quantity INTEGER,
      is_preferred ${type.boolean} DEFAULT FALSE,
      created_at ${type.timestamp} DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
      FOREIGN KEY (bearing_id) REFERENCES bearings(id) ON DELETE CASCADE,
      UNIQUE(supplier_id, bearing_id)
    )`,
  ];

  for (const statement of statements) await db.run(statement);
}

async function adoptLegacySchema(db, dialect) {
  await addColumnIfMissing(db, dialect, 'notifications', 'data', 'TEXT');

  const requiredColumns = {
    bearings: ['id', 'name', 'model', 'price', 'category', 'stock', 'created_at', 'updated_at'],
    orders: ['id', 'total_price', 'status', 'created_at'],
    admins: ['id', 'username', 'password'],
    customers: ['id', 'name', 'phone', 'password', 'created_at'],
    customer_addresses: ['id', 'customer_id', 'recipient_name', 'recipient_phone', 'is_default'],
    payment_orders: ['id', 'order_id', 'payment_method', 'amount', 'status', 'transaction_id'],
    refund_records: ['id', 'payment_order_id', 'refund_amount', 'status', 'refund_no'],
    notifications: ['id', 'type', 'title', 'message', 'data', 'is_read'],
    ai_users: ['id', 'username', 'password_hash', 'role'],
  };
  for (const [tableName, columns] of Object.entries(requiredColumns)) {
    await assertColumns(db, dialect, tableName, columns);
  }
}

async function createIndexes(db) {
  const statements = [
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_bearings_model_unique ON bearings(model)',
    'CREATE INDEX IF NOT EXISTS idx_bearings_category ON bearings(category)',
    'CREATE INDEX IF NOT EXISTS idx_bearings_price ON bearings(price)',
    'CREATE INDEX IF NOT EXISTS idx_bearings_stock ON bearings(stock)',
    'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)',
    'CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone)',
    'CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)',
    'CREATE INDEX IF NOT EXISTS idx_order_items_bearing_id ON order_items(bearing_id)',
    'CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id)',
    'CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)',
    'CREATE INDEX IF NOT EXISTS idx_customers_level ON customers(level)',
    'CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status)',
    'CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id, is_default)',
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_addresses_one_default
      ON customer_addresses(customer_id) WHERE is_default = 1`,
    'CREATE INDEX IF NOT EXISTS idx_payment_orders_order ON payment_orders(order_id)',
    'CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status)',
    'CREATE INDEX IF NOT EXISTS idx_payment_orders_trade_no ON payment_orders(trade_no)',
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_active_order
      ON payment_orders(order_id) WHERE status IN ('pending', 'processing')`,
    'CREATE INDEX IF NOT EXISTS idx_points_customer ON points_records(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_points_date ON points_records(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_coupons_status ON coupons(status)',
    'CREATE INDEX IF NOT EXISTS idx_customer_coupons_customer ON customer_coupons(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_customer_coupons_status ON customer_coupons(status)',
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_coupons_one_used_per_order
      ON customer_coupons(used_order_id) WHERE used_order_id IS NOT NULL AND status = 'used'`,
    'CREATE INDEX IF NOT EXISTS idx_interactions_customer ON customer_interactions(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_feedback_customer ON customer_feedback(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_feedback_status ON customer_feedback(status)',
    'CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read)',
    'CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status)',
    'CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id)',
    'CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status)',
    'CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po ON purchase_order_items(purchase_order_id)',
    'CREATE INDEX IF NOT EXISTS idx_stock_in_bearing ON stock_in_records(bearing_id)',
    'CREATE INDEX IF NOT EXISTS idx_stock_out_bearing ON stock_out_records(bearing_id)',
    'CREATE INDEX IF NOT EXISTS idx_inventory_costs_bearing ON inventory_costs(bearing_id)',
    'CREATE INDEX IF NOT EXISTS idx_supplier_products_supplier ON supplier_products(supplier_id)',
    'CREATE INDEX IF NOT EXISTS idx_supplier_products_bearing ON supplier_products(bearing_id)',
  ];
  for (const statement of statements) await db.run(statement);
}

module.exports = {
  version: VERSION,
  name: 'baseline_application_schema',
  irreversible: true,
  metadata: {
    compatibility: {
      sqlite: 'SQLite 3.24+; portable types, foreign keys, and partial indexes',
      postgresql: 'PostgreSQL 12+; SERIAL identities, transactional DDL, and partial indexes',
    },
    deployment: {
      previousReleaseCompatible: true,
      rationale: 'Creates missing tables and indexes and only adds the nullable notifications.data column to an adopted schema. It does not drop or rename columns used by the immediately previous release.',
    },
    dataImpact: 'Adopts existing tables with CREATE IF NOT EXISTS, adds only the nullable notifications.data column when absent, and creates missing indexes. No customer, order, product, or credential rows are inserted or deleted.',
    recoveryPlan: 'Restore the verified pre-migration backup if adoption validation fails unexpectedly. Existing tables are never dropped; after release, correct drift with a new forward migration.',
  },
  async up({ db, dialect }) {
    await createTables(db, dialect);
    await adoptLegacySchema(db, dialect);
    await createIndexes(db);
  },
};
