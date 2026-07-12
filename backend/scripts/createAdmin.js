require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const username = process.env.INITIAL_ADMIN_USERNAME;
const password = process.env.INITIAL_ADMIN_PASSWORD;
const email = process.env.INITIAL_ADMIN_EMAIL || null;

if (!username || !password) {
  console.error('Set INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD before creating an administrator.');
  process.exitCode = 1;
  return;
}
if (!/^[A-Za-z0-9_.-]{3,100}$/.test(username) || password.length < 12) {
  console.error('Administrator usernames must be 3-100 URL-safe characters and passwords at least 12 characters.');
  process.exitCode = 1;
  return;
}

const dbPath = path.isAbsolute(process.env.DB_PATH || '')
  ? process.env.DB_PATH
  : path.join(__dirname, '..', process.env.DB_PATH || 'bearings.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    )
  `);
  db.get('SELECT COUNT(*) AS count FROM admins', async (error, row) => {
    if (error) {
      console.error('Unable to inspect administrators:', error.message);
      db.close();
      process.exitCode = 1;
      return;
    }
    if (Number(row.count) > 0) {
      console.log('An administrator already exists; refusing to create another bootstrap account.');
      db.close();
      return;
    }

    try {
      const passwordHash = await bcrypt.hash(password, 10);
      db.run(
        'INSERT INTO admins (username, password, email, role) VALUES (?, ?, ?, ?)',
        [username, passwordHash, email, 'admin'],
        (insertError) => {
          if (insertError) {
            console.error('Unable to create administrator:', insertError.message);
            process.exitCode = 1;
          } else {
            console.log(`Administrator ${username} created.`);
          }
          db.close();
        }
      );
    } catch (hashError) {
      console.error('Unable to hash administrator password:', hashError.message);
      db.close();
      process.exitCode = 1;
    }
  });
});
