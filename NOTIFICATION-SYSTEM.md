# 消息通知系统文档

## 概述

轴承销售系统集成了完整的消息通知系统，支持多种通知方式：

- ✅ **邮件通知** - 订单确认、发货通知、库存预警
- ✅ **WebSocket 实时通知** - 实时推送给管理员和客户
- ✅ **站内消息** - 系统消息、通知历史记录

---

## 1. 邮件通知

### 配置

在 `backend/.env` 中配置邮件服务：

```bash
# Gmail 示例
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
ADMIN_EMAIL=admin@bearing-sales.com
```

**注意**：
- Gmail 需要使用应用专用密码，不是账号密码
- 其他邮箱服务商请查阅相应的SMTP配置

### 支持的邮件类型

#### 1. 订单确认邮件
创建订单时自动发送给客户

```javascript
await sendOrderConfirmation(order, items);
```

#### 2. 发货通知邮件
订单状态更新为"已发货"时自动发送

```javascript
await sendShippingNotification(order);
```

#### 3. 库存预警邮件
库存低于阈值时发送给管理员

```javascript
await sendLowStockAlert(products);
```

### 自定义邮件模板

邮件模板位于 `backend/services/emailService.js`，可以自定义HTML模板。

---

## 2. WebSocket 实时通知

### 客户端连接

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3001');

// 管理员加入房间
socket.emit('join-admin');

// 客户加入房间
socket.emit('join-customer', customerId);
```

### 监听事件

```javascript
// 新订单通知
socket.on('new-order', (notification) => {
  console.log('新订单:', notification);
  // 显示通知UI
});

// 订单状态更新
socket.on('order-status-update', (notification) => {
  console.log('订单状态更新:', notification);
});

// 库存预警
socket.on('low-stock-alert', (notification) => {
  console.log('库存预警:', notification);
});

// 系统通知
socket.on('system-notification', (notification) => {
  console.log('系统通知:', notification);
});
```

### 通知数据格式

```javascript
{
  type: 'new-order',
  title: '新订单',
  message: '收到新订单 #123',
  data: { /* 订单数据 */ },
  timestamp: '2026-05-02T12:00:00.000Z'
}
```

---

## 3. 站内消息

### 数据库表结构

```sql
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,           -- NULL表示系统通知
    type VARCHAR(50),          -- 通知类型
    title VARCHAR(255),        -- 标题
    message TEXT,              -- 消息内容
    data TEXT,                 -- JSON数据
    is_read BOOLEAN,           -- 是否已读
    created_at DATETIME        -- 创建时间
);
```

### API 端点

#### 获取通知列表
```http
GET /api/notifications?limit=50&offset=0
Authorization: Bearer <token>
```

#### 获取未读数量
```http
GET /api/notifications/unread-count
Authorization: Bearer <token>
```

#### 标记为已读
```http
PUT /api/notifications/:id/read
Authorization: Bearer <token>
```

#### 标记全部已读
```http
PUT /api/notifications/read-all
Authorization: Bearer <token>
```

#### 删除通知
```http
DELETE /api/notifications/:id
Authorization: Bearer <token>
```

### 使用示例

```javascript
// 创建通知
await createNotification({
  userId: 1,
  type: 'order',
  title: '订单已发货',
  message: '您的订单 #123 已发货',
  data: { orderId: 123, trackingNumber: 'SF1234567890' }
});

// 创建系统通知（所有人可见）
await createSystemNotification({
  type: 'system',
  title: '系统维护通知',
  message: '系统将于今晚22:00进行维护',
  data: { maintenanceTime: '2026-05-02 22:00' }
});
```

---

## 4. 集成到业务流程

### 订单创建时

```javascript
// 创建订单后
const order = await createOrder(orderData);

// 1. 发送邮件通知
await sendOrderConfirmation(order, items);

// 2. WebSocket实时通知管理员
notifyNewOrder(order);

// 3. 创建站内消息
await createNotification({
  userId: null, // 管理员通知
  type: 'new-order',
  title: '新订单',
  message: `收到新订单 #${order.id}`,
  data: order
});
```

### 订单状态更新时

```javascript
// 更新订单状态
await updateOrderStatus(orderId, 'shipped', trackingNumber);

// 1. 发送发货邮件
await sendShippingNotification(order);

// 2. WebSocket实时通知
notifyOrderStatusUpdate(order, customerId);

// 3. 创建站内消息
await createNotification({
  userId: customerId,
  type: 'order-status',
  title: '订单已发货',
  message: `您的订单 #${order.id} 已发货`,
  data: { orderId: order.id, trackingNumber }
});
```

### 库存预警时

```javascript
// 检查低库存
const lowStockProducts = await getLowStockProducts();

if (lowStockProducts.length > 0) {
  // 1. 发送邮件
  await sendLowStockAlert(lowStockProducts);

  // 2. WebSocket通知
  notifyLowStock(lowStockProducts);

  // 3. 创建站内消息
  await createSystemNotification({
    type: 'low-stock',
    title: '库存预警',
    message: `${lowStockProducts.length} 个产品库存不足`,
    data: lowStockProducts
  });
}
```

---

## 5. 定时任务

### 库存预警定时检查

创建 `backend/jobs/stockAlert.js`：

```javascript
const cron = require('node-cron');
const { getLowStockProducts } = require('../utils/inventoryAlert');
const { sendLowStockAlert } = require('../services/emailService');
const { notifyLowStock } = require('../services/websocketService');

// 每天早上9点检查库存
cron.schedule('0 9 * * *', async () => {
  const lowStockProducts = await getLowStockProducts();

  if (lowStockProducts.length > 0) {
    await sendLowStockAlert(lowStockProducts);
    notifyLowStock(lowStockProducts);
  }
});
```

### 清理旧通知

```javascript
const cron = require('node-cron');
const { cleanOldNotifications } = require('../services/notificationService');

// 每周日凌晨2点清理旧通知
cron.schedule('0 2 * * 0', async () => {
  await cleanOldNotifications();
});
```

---

## 6. 前端集成示例

### React 组件示例

```jsx
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // 连接WebSocket
    const newSocket = io('http://localhost:3001');
    newSocket.emit('join-admin');
    setSocket(newSocket);

    // 监听新通知
    newSocket.on('new-order', (notification) => {
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
      // 显示浏览器通知
      if (Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message
        });
      }
    });

    // 获取未读数量
    fetchUnreadCount();

    return () => newSocket.close();
  }, []);

  const fetchUnreadCount = async () => {
    const response = await fetch('/api/notifications/unread-count', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    setUnreadCount(data.count);
  };

  return (
    <div className="notification-bell">
      <button onClick={() => setShowNotifications(!showNotifications)}>
        🔔
        {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
      </button>
      {/* 通知列表UI */}
    </div>
  );
}
```

---

## 7. 测试

### 测试邮件发送

```bash
cd backend
node -e "
const { initEmailService, sendEmail } = require('./services/emailService');
initEmailService();
sendEmail({
  to: 'test@example.com',
  subject: '测试邮件',
  html: '<h1>这是一封测试邮件</h1>'
});
"
```

### 测试WebSocket

使用浏览器控制台：

```javascript
const socket = io('http://localhost:3001');
socket.emit('join-admin');
socket.on('new-order', (data) => console.log('收到通知:', data));
```

---

## 8. 故障排查

### 邮件发送失败

1. 检查SMTP配置是否正确
2. 确认邮箱密码是应用专用密码
3. 查看日志：`tail -f backend/logs/error.log`

### WebSocket连接失败

1. 检查CORS配置
2. 确认端口未被占用
3. 检查防火墙设置

### 通知未收到

1. 检查数据库表是否创建
2. 确认通知服务已初始化
3. 查看应用日志

---

## 9. 最佳实践

1. **邮件发送**
   - 使用队列处理，避免阻塞主线程
   - 设置重试机制
   - 记录发送日志

2. **WebSocket**
   - 实现断线重连
   - 心跳检测
   - 消息确认机制

3. **站内消息**
   - 定期清理旧消息
   - 限制消息数量
   - 分页加载

4. **性能优化**
   - 批量发送邮件
   - 使用消息队列（RabbitMQ/Redis）
   - 缓存未读数量

---

## 10. 扩展功能

### 短信通知

集成短信服务商（阿里云、腾讯云）：

```javascript
const sendSMS = async (phone, message) => {
  // 调用短信API
};
```

### 推送通知

集成推送服务（极光推送、个推）：

```javascript
const sendPushNotification = async (userId, notification) => {
  // 调用推送API
};
```

### 微信通知

集成微信公众号模板消息：

```javascript
const sendWeChatNotification = async (openId, template, data) => {
  // 调用微信API
};
```

---

## 总结

消息通知系统已完整集成到轴承销售系统中，支持：

- ✅ 邮件通知（订单、发货、预警）
- ✅ WebSocket 实时通知
- ✅ 站内消息系统
- ✅ 多种通知场景
- ✅ 完整的API接口

可根据实际需求扩展短信、推送等功能。
