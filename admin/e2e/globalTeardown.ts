import path from 'path';
import fs from 'fs';

const backendDir = path.resolve(__dirname, '../../backend');
const testDbPath = path.join(backendDir, 'test-bearings.db');

export default function globalTeardown() {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
    console.log('[globalTeardown] 测试数据库已清理:', testDbPath);
  }
}
