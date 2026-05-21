const { Server } = require('socket.io');
const logger = require('../logger');

let io = null;

// 初始化WebSocket服务
function initWebSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      methods: ['GET', 'POST']
    }
  });

  // 连接事件
  io.on('connection', (socket) => {
    logger.info('WebSocket客户端已连接', { socketId: socket.id });

    // 加入管理员房间
    socket.on('join-admin', () => {
      socket.join('admin');
      logger.info('管理员加入房间', { socketId: socket.id });
    });

    // 加入客户房间
    socket.on('join-customer', (customerId) => {
      socket.join(`customer-${customerId}`);
      logger.info('客户加入房间', { socketId: socket.id, customerId });
    });

    // 断开连接
    socket.on('disconnect', () => {
      logger.info('WebSocket客户端已断开', { socketId: socket.id });
    });
  });

  logger.info('WebSocket服务已启动');
  return io;
}

// 获取WebSocket实例
function getWebSocket() {
  return io;
}

// 发送新订单通知给管理员
function notifyNewOrder(order) {
  if (io) {
    io.to('admin').emit('new-order', {
      type: 'new-order',
      title: '新订单',
      message: `收到新订单 #${order.id}，客户：${order.customer_name}`,
      data: order,
      timestamp: new Date()
    });
    logger.info('发送新订单通知', { orderId: order.id });
  }
}

// 发送订单状态更新通知
function notifyOrderStatusUpdate(order, customerId) {
  if (io) {
    // 通知管理员
    io.to('admin').emit('order-status-update', {
      type: 'order-status-update',
      title: '订单状态更新',
      message: `订单 #${order.id} 状态已更新为：${order.status}`,
      data: order,
      timestamp: new Date()
    });

    // 通知客户
    if (customerId) {
      io.to(`customer-${customerId}`).emit('order-status-update', {
        type: 'order-status-update',
        title: '订单状态更新',
        message: `您的订单 #${order.id} 状态已更新`,
        data: order,
        timestamp: new Date()
      });
    }

    logger.info('发送订单状态更新通知', { orderId: order.id, status: order.status });
  }
}

// 发送库存预警通知
function notifyLowStock(products) {
  if (io) {
    io.to('admin').emit('low-stock-alert', {
      type: 'low-stock-alert',
      title: '库存预警',
      message: `${products.length} 个产品库存不足`,
      data: products,
      timestamp: new Date()
    });
    logger.info('发送库存预警通知', { count: products.length });
  }
}

// 发送系统通知
function notifySystem(message, type = 'info') {
  if (io) {
    io.to('admin').emit('system-notification', {
      type: 'system',
      level: type,
      message,
      timestamp: new Date()
    });
    logger.info('发送系统通知', { message, type });
  }
}

// 广播消息给所有连接的客户端
function broadcast(event, data) {
  if (io) {
    io.emit(event, data);
    logger.info('广播消息', { event });
  }
}

module.exports = {
  initWebSocket,
  getWebSocket,
  notifyNewOrder,
  notifyOrderStatusUpdate,
  notifyLowStock,
  notifySystem,
  broadcast
};
