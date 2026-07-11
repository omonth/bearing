const logger = require('../logger');

/**
 * Notification service — creates, queries, and manages in-app notifications.
 *
 * Uses constructor-injected db (like all other services in the project).
 * The `cleanOldNotifications` method is SQLite/Postgres dual-compatible.
 */
class NotificationService {
  constructor(db) {
    this.db = db;
  }

  /** Create a notification for a specific user (or system-wide if userId is null). */
  async createNotification({ userId, type, title, message, data }) {
    const dataJson = data ? JSON.stringify(data) : null;

    const result = await this.db.run(
      `INSERT INTO notifications (user_id, type, title, message, data)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, type, title, message, dataJson]
    );

    logger.info('通知已创建', { id: result.lastID, userId, type });
    return { id: result.lastID };
  }

  /** Get paginated notification list for a user. */
  async getUserNotifications(userId, limit = 50, offset = 0) {
    const rows = await this.db.all(
      `SELECT * FROM notifications
       WHERE user_id = ? OR user_id IS NULL
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    return rows.map(row => ({
      ...row,
      data: row.data ? JSON.parse(row.data) : null,
      is_read: Boolean(row.is_read),
    }));
  }

  /** Get unread notification count for a user. */
  async getUnreadCount(userId) {
    const row = await this.db.get(
      `SELECT COUNT(*) as count FROM notifications
       WHERE (user_id = ? OR user_id IS NULL) AND is_read = FALSE`,
      [userId]
    );

    return row.count;
  }

  /** Mark a single notification as read. */
  async markAsRead(notificationId, userId) {
    const result = await this.db.run(
      `UPDATE notifications SET is_read = TRUE
       WHERE id = ? AND (user_id = ? OR user_id IS NULL)`,
      [notificationId, userId]
    );

    logger.info('通知已标记为已读', { id: notificationId });
    return { changes: result.changes };
  }

  /** Mark all notifications for a user as read. */
  async markAllAsRead(userId) {
    const result = await this.db.run(
      `UPDATE notifications SET is_read = TRUE
       WHERE (user_id = ? OR user_id IS NULL) AND is_read = FALSE`,
      [userId]
    );

    logger.info('所有通知已标记为已读', { userId, changes: result.changes });
    return { changes: result.changes };
  }

  /** Delete a notification. */
  async deleteNotification(notificationId, userId) {
    const result = await this.db.run(
      `DELETE FROM notifications
       WHERE id = ? AND (user_id = ? OR user_id IS NULL)`,
      [notificationId, userId]
    );

    logger.info('通知已删除', { id: notificationId });
    return { changes: result.changes };
  }

  /**
   * Clean notifications older than 30 days.
   * Uses dual-dialect SQL compatible with both SQLite and PostgreSQL.
   */
  async cleanOldNotifications() {
    // SQLite-compatible: datetime('now', '-30 days')
    // PostgreSQL-compatible: NOW() - INTERVAL '30 days'
    // The db adapter normalizes ? placeholders; date functions differ.
    // We check db.type to select the correct expression.
    const dateExpr = this.db.type === 'postgres'
      ? "NOW() - INTERVAL '30 days'"
      : "datetime('now', '-30 days')";

    const result = await this.db.run(
      `DELETE FROM notifications WHERE created_at < ${dateExpr}`
    );

    logger.info('旧通知已清理', { deleted: result.changes });
    return { deleted: result.changes };
  }

  /** Create a system-level notification (visible to all admins). */
  async createSystemNotification({ type, title, message, data }) {
    return this.createNotification({
      userId: null,
      type,
      title,
      message,
      data,
    });
  }
}

module.exports = NotificationService;
