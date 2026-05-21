const { getDatabase } = require('../db/adapter');
const logger = require('../logger');

// 创建通知
async function createNotification({ userId, type, title, message, data }) {
  const db = getDatabase();
  const dataJson = data ? JSON.stringify(data) : null;

  const result = await db.run(
    `INSERT INTO notifications (user_id, type, title, message, data)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, type, title, message, dataJson]
  );

  logger.info('通知已创建', { id: result.lastID, userId, type });
  return { id: result.lastID };
}

// 获取用户通知列表
async function getUserNotifications(userId, limit = 50, offset = 0) {
  const db = getDatabase();

  const rows = await db.all(
    `SELECT * FROM notifications
     WHERE user_id = ? OR user_id IS NULL
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );

  return rows.map(row => ({
    ...row,
    data: row.data ? JSON.parse(row.data) : null,
    is_read: Boolean(row.is_read)
  }));
}

// 获取未读通知数量
async function getUnreadCount(userId) {
  const db = getDatabase();

  const row = await db.get(
    `SELECT COUNT(*) as count FROM notifications
     WHERE (user_id = ? OR user_id IS NULL) AND is_read = FALSE`,
    [userId]
  );

  return row.count;
}

// 标记为已读
async function markAsRead(notificationId, userId) {
  const db = getDatabase();

  const result = await db.run(
    `UPDATE notifications SET is_read = TRUE
     WHERE id = ? AND (user_id = ? OR user_id IS NULL)`,
    [notificationId, userId]
  );

  logger.info('通知已标记为已读', { id: notificationId });
  return { changes: result.changes };
}

// 标记所有为已读
async function markAllAsRead(userId) {
  const db = getDatabase();

  const result = await db.run(
    `UPDATE notifications SET is_read = TRUE
     WHERE (user_id = ? OR user_id IS NULL) AND is_read = FALSE`,
    [userId]
  );

  logger.info('所有通知已标记为已读', { userId, changes: result.changes });
  return { changes: result.changes };
}

// 删除通知
async function deleteNotification(notificationId, userId) {
  const db = getDatabase();

  const result = await db.run(
    `DELETE FROM notifications
     WHERE id = ? AND (user_id = ? OR user_id IS NULL)`,
    [notificationId, userId]
  );

  logger.info('通知已删除', { id: notificationId });
  return { changes: result.changes };
}

// 清理旧通知（保留最近30天）
async function cleanOldNotifications() {
  const db = getDatabase();

  const result = await db.run(
    `DELETE FROM notifications WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '30 days'`
  );

  logger.info('旧通知已清理', { deleted: result.changes });
  return { deleted: result.changes };
}

// 创建系统通知（发送给所有管理员）
async function createSystemNotification({ type, title, message, data }) {
  return createNotification({
    userId: null,
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
