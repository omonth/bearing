require('dotenv').config();
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const backupDir = process.env.BACKUP_DIR || './backups';
const dbPath = path.join(__dirname, process.env.DB_PATH || 'bearings.db');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `bearings_backup_${timestamp}.db`);

  try {
    fs.copyFileSync(dbPath, backupPath);
    logger.info('数据库备份成功', { backupPath });
    console.log(`数据库备份成功: ${backupPath}`);

    cleanOldBackups();
  } catch (error) {
    logger.error('数据库备份失败', { error: error.message });
    console.error('数据库备份失败:', error.message);
  }
}

function cleanOldBackups() {
  const maxBackups = 10;

  try {
    const files = fs.readdirSync(backupDir)
      .filter(file => file.startsWith('bearings_backup_') && file.endsWith('.db'))
      .map(file => ({
        name: file,
        path: path.join(backupDir, file),
        time: fs.statSync(path.join(backupDir, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length > maxBackups) {
      const filesToDelete = files.slice(maxBackups);
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
  backupDatabase();
}

module.exports = { backupDatabase };
