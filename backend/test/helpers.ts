const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

export async function createTestDb() {
  const sqliteDb = new sqlite3.Database(':memory:');
  sqliteDb.run('PRAGMA foreign_keys = ON');

  const db = {
    type: 'sqlite',

    get: (sql: string, params: any[] = []) =>
      new Promise((resolve, reject) => {
        sqliteDb.get(sql, params, (err: any, row: any) => {
          if (err) reject(err);
          else resolve(row || null);
        });
      }),

    all: (sql: string, params: any[] = []) =>
      new Promise((resolve, reject) => {
        sqliteDb.all(sql, params, (err: any, rows: any) => {
          if (err) reject(err);
          else resolve(rows);
        });
      }),

    run: (sql: string, params: any[] = []) =>
      new Promise((resolve, reject) => {
        sqliteDb.run(sql, params, function (this: any, err: any) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      }),

    transaction: async (callback: (tx: any) => Promise<any>) =>
      new Promise((resolve, reject) => {
        sqliteDb.serialize(async () => {
          sqliteDb.run('BEGIN TRANSACTION');
          try {
            const tx = {
              get: (s: string, p: any[] = []) => db.get(s, p),
              run: (s: string, p: any[] = []) => db.run(s, p),
              all: (s: string, p: any[] = []) => db.all(s, p),
            };
            const result = await callback(tx);
            sqliteDb.run('COMMIT', (err: any) => {
              if (err) reject(err);
              else resolve(result);
            });
          } catch (error) {
            sqliteDb.run('ROLLBACK', () => reject(error));
          }
        });
      }),

    close: () => new Promise<void>((resolve, reject) => {
      sqliteDb.close((err: any) => (err ? reject(err) : resolve()));
    }),
  };

  await db.run(`
    CREATE TABLE admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    )
  `);

  await db.run(`
    CREATE TABLE bearings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      model TEXT NOT NULL,
      price REAL NOT NULL,
      image TEXT,
      category TEXT NOT NULL,
      inner_diameter REAL,
      outer_diameter REAL,
      width REAL,
      stock INTEGER DEFAULT 0,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.run(`
    CREATE VIRTUAL TABLE bearings_fts USING fts5(name, model, description, content=bearings, content_rowid=id)
  `);

  await db.run(`
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      province TEXT NOT NULL,
      city TEXT NOT NULL,
      district TEXT,
      address_detail TEXT NOT NULL,
      total_price REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      tracking_number TEXT,
      shipped_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.run(`
    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      bearing_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  await db.run(`
    CREATE TABLE order_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      old_status TEXT,
      new_status TEXT NOT NULL,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return db;
}

export async function seedTestData(db: any) {
  const hashedPassword = await bcrypt.hash('admin123', 10);
  await db.run(
    'INSERT INTO admins (username, password, email, role) VALUES (?, ?, ?, ?)',
    ['admin', hashedPassword, 'admin@test.com', 'admin']
  );

  const j = (zh: string, en = '') => JSON.stringify({ zh, en });

  await db.run(
    'INSERT INTO bearings (name, model, price, category, inner_diameter, outer_diameter, width, stock, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [j('深沟球轴承 6200', 'Deep Groove Ball Bearing 6200'), '6200', 15.00, '深沟球轴承', 10, 30, 9, 100, j('通用深沟球轴承', 'General purpose deep groove ball bearing')]
  );

  await db.run(
    'INSERT INTO bearings (name, model, price, category, inner_diameter, outer_diameter, width, stock, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [j('圆柱滚子轴承 NU205', 'Cylindrical Roller Bearing NU205'), 'NU205', 45.00, '圆柱滚子轴承', 25, 52, 15, 50, j('圆柱滚子轴承，高承载', 'Cylindrical roller bearing, high load')]
  );

  await db.run(
    'INSERT INTO bearings (name, model, price, category, inner_diameter, outer_diameter, width, stock, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [j('推力球轴承 51100', 'Thrust Ball Bearing 51100'), '51100', 22.00, '推力球轴承', 10, 24, 9, 0, j('推力球轴承，单向', 'Thrust ball bearing, single direction')]
  );
}
