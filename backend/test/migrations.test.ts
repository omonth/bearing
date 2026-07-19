const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const sqlite3 = require('sqlite3').verbose();

const {
  applyMigrations,
  checkMigrations,
  getMigrationStatus,
  loadMigrations,
  rollbackLastMigration,
} = require('../migrations/migrator');

function createEmptyDb() {
  const sqlite = new sqlite3.Database(':memory:');
  sqlite.run('PRAGMA foreign_keys = ON');

  const db: any = {
    type: 'sqlite',
    get: (sql: string, params: any[] = []) => new Promise((resolve, reject) => {
      sqlite.get(sql, params, (error: Error | null, row: unknown) => {
        if (error) reject(error);
        else resolve(row || null);
      });
    }),
    all: (sql: string, params: any[] = []) => new Promise((resolve, reject) => {
      sqlite.all(sql, params, (error: Error | null, rows: unknown[]) => {
        if (error) reject(error);
        else resolve(rows);
      });
    }),
    run: (sql: string, params: any[] = []) => new Promise((resolve, reject) => {
      sqlite.run(sql, params, function (this: any, error: Error | null) {
        if (error) reject(error);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    }),
    transaction: (callback: (transaction: any) => Promise<unknown>) => new Promise((resolve, reject) => {
      sqlite.serialize(() => {
        sqlite.run('BEGIN TRANSACTION', async (beginError: Error | null) => {
          if (beginError) {
            reject(beginError);
            return;
          }

          try {
            const result = await callback({ get: db.get, all: db.all, run: db.run });
            sqlite.run('COMMIT', (commitError: Error | null) => {
              if (commitError) reject(commitError);
              else resolve(result);
            });
          } catch (error) {
            sqlite.run('ROLLBACK', () => reject(error));
          }
        });
      });
    }),
    close: () => new Promise<void>((resolve, reject) => {
      sqlite.close((error: Error | null) => (error ? reject(error) : resolve()));
    }),
  };

  return db;
}

function makeMigrationDir(source: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bearing-migrations-'));
  const file = path.join(directory, '202607190099_test_migration.js');
  fs.writeFileSync(file, source, 'utf8');
  return { directory, file };
}

describe('versioned database migrations', () => {
  let db: any;
  const temporaryDirectories: string[] = [];

  beforeEach(() => {
    db = createEmptyDb();
  });

  afterEach(async () => {
    await db.close();
    for (const directory of temporaryDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('applies all migrations to an empty database and reports a clean status', async () => {
    await expect(checkMigrations(db)).rejects.toThrow(/pending migration/i);

    const result = await applyMigrations(db);

    expect(result.applied).toEqual(loadMigrations().map((migration: any) => migration.version));
    expect(result.applied).toEqual(expect.arrayContaining([
      '202607180001',
      '202607180002',
      '202607190001',
      '202607190010',
      '202607190030',
      '202607190050',
    ]));
    const tables = await db.all(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name IN (
         'admins', 'ai_users', 'bearings', 'customer_addresses', 'customers',
         'customer_phone_verifications', 'customer_security_challenges',
         'orders', 'payment_callback_events', 'payment_orders', 'purchase_orders',
         'refund_status_history',
         'schema_migrations', 'suppliers'
       ) ORDER BY name`
    );
    expect(tables).toEqual([
      { name: 'admins' },
      { name: 'ai_users' },
      { name: 'bearings' },
      { name: 'customer_addresses' },
      { name: 'customer_phone_verifications' },
      { name: 'customer_security_challenges' },
      { name: 'customers' },
      { name: 'orders' },
      { name: 'payment_callback_events' },
      { name: 'payment_orders' },
      { name: 'purchase_orders' },
      { name: 'refund_status_history' },
      { name: 'schema_migrations' },
      { name: 'suppliers' },
    ]);
    const referenceCounts = await Promise.all([
      db.get('SELECT COUNT(*) AS count FROM customer_levels'),
      db.get('SELECT COUNT(*) AS count FROM customer_tags'),
    ]);
    const phoneVerificationColumn = (await db.all('PRAGMA table_info(customers)'))
      .find((column: any) => column.name === 'phone_verified_at');
    expect({ referenceCounts, phoneVerificationColumn }).toEqual({
      referenceCounts: [{ count: 5 }, { count: 5 }],
      phoneVerificationColumn: expect.objectContaining({ name: 'phone_verified_at', notnull: 0 }),
    });
    await expect(checkMigrations(db)).resolves.toMatchObject({ pending: [] });
  });

  it('backfills and can roll back the verified phone authorization marker', async () => {
    await db.run(`
      CREATE TABLE customers (
        id INTEGER PRIMARY KEY,
        phone TEXT NOT NULL
      )
    `);
    await db.run(`
      CREATE TABLE customer_phone_verifications (
        customer_id INTEGER PRIMARY KEY,
        subject_key TEXT NOT NULL,
        verified_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);
    await db.run('INSERT INTO customers (id, phone) VALUES (?, ?)', [1, '13800000001']);
    await db.run(
      `INSERT INTO customer_phone_verifications
        (customer_id, subject_key, verified_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      [1, 'subject-key', 2_000_000_000, 2_000_000_000]
    );
    const migration = require('../migrations/202607190030_verified_phone_authorization_gate');

    await migration.up({ db, dialect: 'sqlite' });
    const backfilled = await db.get(
      'SELECT phone_verified_at FROM customers WHERE id = ?',
      [1]
    );
    await migration.down({ db, dialect: 'sqlite' });
    const columnNames = (await db.all('PRAGMA table_info(customers)'))
      .map((column: any) => column.name);

    expect({ backfilled, columnNames }).toEqual({
      backfilled: { phone_verified_at: 2_000_000_000 },
      columnNames: ['id', 'phone'],
    });
  });

  it('upgrades existing refund data and remains idempotent', async () => {
    await db.run(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        customer_name TEXT,
        customer_phone TEXT,
        province TEXT,
        city TEXT,
        district TEXT,
        address_detail TEXT,
        total_price REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        tracking_number TEXT,
        shipped_at DATETIME,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.run(`
      CREATE TABLE payment_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        payment_method TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        transaction_id TEXT,
        trade_no TEXT,
        payer_info TEXT,
        paid_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.run(`
      CREATE TABLE refund_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_order_id INTEGER NOT NULL,
        refund_amount REAL NOT NULL,
        refund_reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        refund_no TEXT,
        refunded_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.run('INSERT INTO orders (id, total_price) VALUES (?, ?)', [1, 100]);
    await db.run(
      'INSERT INTO payment_orders (order_id, payment_method, amount, transaction_id) VALUES (?, ?, ?, ?)',
      [1, 'wechat', 100, 'PAY-1']
    );
    await db.run(
      'INSERT INTO refund_records (payment_order_id, refund_amount, status, refund_no) VALUES (?, ?, ?, ?)',
      [1, 50, 'pending', 'REF-1']
    );

    await applyMigrations(db);
    const secondRun = await applyMigrations(db);

    const refund = await db.get(
      `SELECT status, refund_no, attempt_count, lease_token, provider_refund_id
       FROM refund_records WHERE id = ?`,
      [1]
    );
    const statusColumn = (await db.all('PRAGMA table_info(refund_records)'))
      .find((column: any) => column.name === 'status');
    expect({ refund, defaultValue: statusColumn.dflt_value, secondRun }).toEqual({
      refund: {
        status: 'requested',
        refund_no: 'REF-1',
        attempt_count: 0,
        lease_token: null,
        provider_refund_id: null,
      },
      defaultValue: "'requested'",
      secondRun: { applied: [], pending: [] },
    });
  });

  it('detects a changed checksum for an applied migration', async () => {
    const sourceFile = path.join(__dirname, '..', 'migrations', '202607190001_payment_callback_refund_state.js');
    const source = fs.readFileSync(sourceFile, 'utf8');
    const { directory, file } = makeMigrationDir(source.replaceAll('202607190001', '202607190099'));
    temporaryDirectories.push(directory);

    await applyMigrations(db, { migrationDirectory: directory });
    fs.appendFileSync(file, '\n// unauthorized mutation\n', 'utf8');

    await expect(checkMigrations(db, { migrationDirectory: directory }))
      .rejects.toThrow(/checksum mismatch/i);
  });

  it('rolls back the schema and ledger record when an up migration fails', async () => {
    const { directory } = makeMigrationDir(`
      module.exports = {
        version: '202607190099',
        name: 'failing_migration',
        metadata: {
          compatibility: { sqlite: '3.24+', postgresql: '12+' },
          deployment: {
            previousReleaseCompatible: true,
            rationale: 'The probe table is additive and ignored by the previous release.'
          },
          dataImpact: 'No retained data impact because the transaction must roll back.',
          recoveryPlan: 'Fix the forward migration and rerun it.'
        },
        async up({ db }) {
          await db.run('CREATE TABLE must_not_survive (id INTEGER PRIMARY KEY)');
          throw new Error('deliberate migration failure');
        },
        async down() {}
      };
    `);
    temporaryDirectories.push(directory);

    await expect(applyMigrations(db, { migrationDirectory: directory }))
      .rejects.toThrow('deliberate migration failure');

    const table = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'must_not_survive'");
    const status = await getMigrationStatus(db, { migrationDirectory: directory });
    expect({ table, applied: status.applied }).toEqual({ table: null, applied: [] });
  });

  it('requires explicit confirmation and can roll back the latest reversible migration', async () => {
    const { directory } = makeMigrationDir(`
      module.exports = {
        version: '202607190099',
        name: 'reversible_migration',
        metadata: {
          compatibility: { sqlite: '3.24+', postgresql: '12+' },
          deployment: {
            previousReleaseCompatible: true,
            rationale: 'The probe table is additive and ignored by the previous release.'
          },
          dataImpact: 'Creates an empty probe table.',
          recoveryPlan: 'Run the down migration to drop the empty probe table.'
        },
        async up({ db }) { await db.run('CREATE TABLE rollback_probe (id INTEGER PRIMARY KEY)'); },
        async down({ db }) { await db.run('DROP TABLE rollback_probe'); }
      };
    `);
    temporaryDirectories.push(directory);
    await applyMigrations(db, { migrationDirectory: directory });

    await expect(rollbackLastMigration(db, { migrationDirectory: directory }))
      .rejects.toThrow(/explicit confirmation/i);
    await rollbackLastMigration(db, {
      migrationDirectory: directory,
      confirmedVersion: '202607190099',
    });

    const table = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rollback_probe'");
    const status = await getMigrationStatus(db, { migrationDirectory: directory });
    expect({ table, applied: status.applied }).toEqual({ table: null, applied: [] });
  });

  it('documents an explicit recovery plan for the irreversible payment migration', () => {
    const migration = loadMigrations()
      .find((candidate: any) => candidate.version === '202607190001');

    expect(migration.definition).toMatchObject({
      version: '202607190001',
      irreversible: true,
      metadata: {
        compatibility: {
          sqlite: expect.any(String),
          postgresql: expect.any(String),
        },
        dataImpact: expect.any(String),
        recoveryPlan: expect.stringMatching(/backup|forward/i),
      },
    });
  });

  it('documents recovery and compatibility for refund reconciliation leases', () => {
    const migration = loadMigrations()
      .find((candidate: any) => candidate.version === '202607190050');

    expect(migration.definition).toMatchObject({
      version: '202607190050',
      irreversible: true,
      metadata: {
        compatibility: {
          sqlite: expect.any(String),
          postgresql: expect.any(String),
        },
        dataImpact: expect.stringMatching(/refund_no/i),
        recoveryPlan: expect.stringMatching(/backup|forward/i),
      },
    });
  });

  it('returns a non-zero CLI exit code when a migration check is not satisfied', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bearing-migration-cli-'));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, 'migration-check.db');
    const environment = {
      ...process.env,
      DB_PATH: databasePath,
      DB_TYPE: 'sqlite',
      NODE_ENV: 'test',
    };
    const backendDirectory = path.join(__dirname, '..');

    const pendingCheck = spawnSync(
      process.execPath,
      ['scripts/migrate.js', 'check'],
      { cwd: backendDirectory, env: environment, encoding: 'utf8' }
    );
    const apply = spawnSync(
      process.execPath,
      ['scripts/migrate.js', 'apply'],
      { cwd: backendDirectory, env: environment, encoding: 'utf8' }
    );
    const cleanCheck = spawnSync(
      process.execPath,
      ['scripts/migrate.js', 'check'],
      { cwd: backendDirectory, env: environment, encoding: 'utf8' }
    );

    expect({
      pendingStatus: pendingCheck.status,
      pendingError: pendingCheck.stderr,
      applyStatus: apply.status,
      cleanStatus: cleanCheck.status,
    }).toMatchObject({
      pendingStatus: 1,
      pendingError: expect.stringMatching(/pending migration/i),
      applyStatus: 0,
      cleanStatus: 0,
    });
  });
});
