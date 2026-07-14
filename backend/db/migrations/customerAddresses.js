async function ensureCustomerAddressSchema(db) {
  const idColumn = db.type === 'postgres'
    ? 'SERIAL PRIMARY KEY'
    : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const timestampColumn = db.type === 'postgres'
    ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    : 'DATETIME DEFAULT CURRENT_TIMESTAMP';

  await db.run(`
    CREATE TABLE IF NOT EXISTS customer_addresses (
      id ${idColumn},
      customer_id INTEGER NOT NULL,
      recipient_name TEXT NOT NULL,
      recipient_phone TEXT NOT NULL,
      province TEXT NOT NULL,
      city TEXT NOT NULL,
      district TEXT NOT NULL,
      address_detail TEXT NOT NULL,
      postal_code TEXT,
      is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
      created_at ${timestampColumn},
      updated_at ${timestampColumn},
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    )
  `);
  await db.run(
    'CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id, is_default)'
  );
  await db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_addresses_one_default
    ON customer_addresses(customer_id)
    WHERE is_default = 1
  `);
}

module.exports = { ensureCustomerAddressSchema };
