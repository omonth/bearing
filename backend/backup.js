require('dotenv').config();
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { getDatabase } = require('./db/adapter');

const backupDir = process.env.BACKUP_DIR || './backups';
const MAX_BACKUPS = 10;

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

/**
 * Safe SQLite backup using the `.backup()` API (consistent snapshot).
 * Falls back to file-copy for PostgreSQL (pg_dump) or if the adapter is not SQLite.
 */
async function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const db = getDatabase();

  try {
    if (db.type === 'sqlite' && db.sqlite) {
      // Use SQLite backup API for a consistent, live-safe snapshot
      const backupPath = path.join(backupDir, `bearings_backup_${timestamp}.db`);
      await new Promise((resolve, reject) => {
        db.sqlite.backup(backupPath, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      logger.info('数据库备份成功 (SQLite backup API)', { backupPath });
      console.log(`数据库备份成功: ${backupPath}`);
    } else if (db.type === 'postgres') {
      // For PostgreSQL, log a warning — use pg_dump externally
      logger.warn('PostgreSQL 备份请使用 pg_dump，内置备份仅支持 SQLite');
      console.log('PostgreSQL 备份请使用 pg_dump 命令');
      return;
    } else {
      // Fallback: file copy (not safe for live DB, but better than nothing)
      const dbPath = path.join(__dirname, process.env.DB_PATH || 'bearings.db');
      const backupPath = path.join(backupDir, `bearings_backup_${timestamp}.db`);
      fs.copyFileSync(dbPath, backupPath);
      logger.warn('数据库备份成功 (文件复制, 非原子)', { backupPath });
      console.log(`数据库备份成功: ${backupPath}`);
    }

    cleanOldBackups();
  } catch (error) {
    logger.error('数据库备份失败', { error: error.message });
    console.error('数据库备份失败:', error.message);
  }
}

function cleanOldBackups() {
  try {
    const files = fs.readdirSync(backupDir)
      .filter(file => file.startsWith('bearings_backup_') && file.endsWith('.db'))
      .map(file => ({
        name: file,
        path: path.join(backupDir, file),
        time: fs.statSync(path.join(backupDir, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length > MAX_BACKUPS) {
      const filesToDelete = files.slice(MAX_BACKUPS);
      filesToDelete.forEach(file => {
        fs.unlinkSync(file.path);
        logger.info('删除旧备份', { file: file.name });
      });
    }
  } catch (error) {
    logger.error('清理旧备份失败', { error: error.message });
  }
}

if (require.main === module) {
  backupDatabase().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { backupDatabase };
