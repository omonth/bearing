const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const backendDir = path.resolve(__dirname, '..');
const dbPath = path.join(backendDir, 'test-bearings.db');
const env = {
  ...process.env,
  DB_PATH: 'test-bearings.db',
  NODE_ENV: 'test',
  INITIAL_ADMIN_USERNAME: 'e2e-admin',
  INITIAL_ADMIN_PASSWORD: 'e2e-admin-password-123',
};

fs.rmSync(dbPath, { force: true });
execFileSync(process.execPath, ['initDatabase.js'], { cwd: backendDir, env, stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/createAdmin.js'], { cwd: backendDir, env, stdio: 'inherit' });

Object.assign(process.env, env);
require('../server');
