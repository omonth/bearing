const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../logger');

const dbPath = path.join(__dirname, '../bearings.db');
const db = new sqlite3.Database(dbPath);

// 创建通知
async function createNotification({ userId, type, title, message, data }) {
  return new Promise((resolve, reject) => {
    const dataJson = data ? JSON.stringify(data) : null;

    db.run(
      `INSERT INTO notifications (user_id, type, title, message, data)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, type, title, message, dataJson],
      function(err) {
        if (err) {
          logger.error('创建通知失败', { error: err.message });
          reject(err);
        } else {
          logger.info('通知已创建', { id: this.lastID, userId, type });
          resolve({ id: this.lastID });
        }
      }
    );
  });
}

// 获取用户通知列表
async function getUserNotifications(userId, limit = 50, offset = 0) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM notifications
       WHERE user_id = ? OR user_id IS NULL
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset],
      (err, rows) => {
        if (err) {
          logger.error('获取通知列表失败', { error: err.message });
          reject(err);
        } else {
          const notifications = rows.map(row => ({
            ...row,
            data: row.data ? JSON.parse(row.data) : null,
            is_read: Boolean(row.is_read)
          }));
          resolve(notifications);
        }
      }
    );
  });
}

// 获取未读通知数量
async function getUnreadCount(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COUNT(*) as count FROM notifications
       WHERE (user_id = ? OR user_id IS NULL) AND is_read = 0`,
      [userId],
      (err, row) => {
        if (err) {
          logger.error('获取未读数量失败', { error: err.message });
          reject(err);
        } else {
          resolve(row.count);
        }
      }
    );
  });
}

// 标记为已读
async function markAsRead(notificationId, userId) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE notifications SET is_read = 1
       WHERE id = ? AND (user_id = ? OR user_id IS NULL)`,
      [notificationId, userId],
      function(err) {
        if (err) {
          logger.error('标记已读失败', { error: err.message });
          reject(err);
        } else {
          logger.info('通知已标记为已读', { id: notificationId });
          resolve({ changes: this.changes });
        }
      }
    );
  });
}

// 标记所有为已读
async function markAllAsRead(userId) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE notifications SET is_read = 1
       WHERE (user_id = ? OR user_id IS NULL) AND is_read = 0`,
      [userId],
      function(err) {
        if (err) {
          logger.error('标记全部已读失败', { error: err.message });
          reject(err);
        } else {
          logger.info('所有通知已标记为已读', { userId, changes: this.changes });
          resolve({ changes: this.changes });
        }
      }
    );
  });
}

// 删除通知
async function deleteNotification(notificationId, userId) {
  return new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM notifications
       WHERE id = ? AND (user_id = ? OR user_id IS NULL)`,
      [notificationId, userId],
      function(err) {
        if (err) {
          logger.error('删除通知失败', { error: err.message });
          reject(err);
        } else {
          logger.info('通知已删除', { id: notificationId });
          resolve({ changes: this.changes });
        }
      }
    );
  });
}

// 清理旧通知（保留最近30天）
async function cleanOldNotifications() {
  return new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM notifications
       WHERE created_at < datetime('now', '-30 days')`,
      function(err) {
        if (err) {
          logger.error('清理旧通知失败', { error: err.message });
          reject(err);
        } else {
          logger.info('旧通知已清理', { deleted: this.changes });
          resolve({ deleted: this.changes });
        }
      }
    );
  });
}

// 创建系统通知（发送给所有管理员）
async function createSystemNotification({ type, title, message, data }) {
  return createNotification({
    userId: null, // null表示系统通知，所有人可见
    type,
    title,
    message,
    data
  });
}

module.exports = {
  createNotification,
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  cleanOldNotifications,
  createSystemNotification
};
