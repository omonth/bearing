import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const backendDir = path.resolve(__dirname, '../../backend');
const testDbPath = path.join(backendDir, 'test-bearings.db');

export default function globalSetup() {
  process.env.DB_PATH = 'test-bearings.db';

  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  execSync('node initDatabase.js', { cwd: backendDir, stdio: 'inherit', env: { ...process.env, DB_PATH: 'test-bearings.db' } });
  execSync('node scripts/createAdmin.js', { cwd: backendDir, stdio: 'inherit', env: { ...process.env, DB_PATH: 'test-bearings.db' } });

  console.log('[globalSetup] 测试数据库已初始化:', testDbPath);
}
