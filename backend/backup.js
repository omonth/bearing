require('dotenv').config();
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { getDatabase } = require('./db/adapter');
const { runPostgresBackup } = require('./scripts/backup/postgres-backup');

const backupDir = process.env.BACKUP_DIR || './backups';
const MAX_BACKUPS = 10;

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

/**
 * Safe SQLite backup using the `.backup()` API (consistent snapshot), or an
 * encrypted PostgreSQL custom-format dump uploaded to offsite object storage.
 */
async function backupDatabase(env = process.env) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  try {
    if (env.DB_TYPE === 'postgres') {
      const result = await runPostgresBackup(env);
      logger.info('PostgreSQL 数据库备份成功', {
        backupPath: result.backupPath,
        remoteKey: result.remoteKey,
        sha256: result.manifest.sha256,
      });
      console.log(`PostgreSQL 数据库备份成功: ${result.backupPath}`);
      return result;
    }

    const db = getDatabase();
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
    throw error;
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
  backupDatabase().catch(() => {
    process.exitCode = 1;
  });
}

module.exports = { backupDatabase };
