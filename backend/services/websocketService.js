const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const logger = require('../logger');
const { verifySessionClaims, verifySessionToken } = require('../middleware/auth');
const {
  ADMIN_SESSION_COOKIE,
  CUSTOMER_SESSION_COOKIE,
  configuredOrigins,
  parseCookies,
} = require('../middleware/sessionCookies');

let io = null;
let sessionDatabase = null;

// 初始化WebSocket服务
function handshakeToken(socket) {
  const suppliedToken = socket.handshake.auth?.token;
  if (typeof suppliedToken === 'string' && suppliedToken.trim()) return suppliedToken.trim();

  const cookies = parseCookies(socket.handshake.headers.cookie);
  const audience = socket.handshake.auth?.audience;
  if (audience === 'customer') return cookies[CUSTOMER_SESSION_COOKIE];
  if (audience === 'admin') return cookies[ADMIN_SESSION_COOKIE];
  return cookies[ADMIN_SESSION_COOKIE] || cookies[CUSTOMER_SESSION_COOKIE];
}

function acknowledge(callback, payload) {
  if (typeof callback === 'function') callback(payload);
}

async function closeRedisClient(client) {
  if (!client) return;
  try {
    if (typeof client.quit === 'function') await client.quit();
  } catch {
    client.disconnect?.();
  }
}

async function configureRedisAdapter(socketIo, {
  redisClient,
  adapterFactory = createAdapter,
  required = false,
  timeoutMs = 5_000,
} = {}) {
  if (!redisClient || typeof redisClient.duplicate !== 'function') {
    if (required) throw new Error('生产 WebSocket 集群需要 Redis Pub/Sub 客户端');
    return null;
  }

  const pubClient = redisClient.duplicate({ enableOfflineQueue: true });
  const subClient = redisClient.duplicate({ enableOfflineQueue: true });
  let redisErrorLogged = false;
  const handleRedisError = (error) => {
    if (redisErrorLogged) return;
    redisErrorLogged = true;
    logger.warn('WebSocket Redis adapter client error', {
      error: error?.message || 'unknown Redis error',
    });
  };
  pubClient.on?.('error', handleRedisError);
  subClient.on?.('error', handleRedisError);
  let timer;
  try {
    const readiness = Promise.all([pubClient.ping(), subClient.ping()]);
    const responses = await Promise.race([
      readiness,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Redis adapter connection timeout')), timeoutMs);
      }),
    ]);
    if (responses.some((response) => response !== 'PONG')) {
      throw new Error('Redis adapter PING failed');
    }
    socketIo.adapter(adapterFactory(pubClient, subClient));
    return {
      async close() {
        await Promise.all([
          closeRedisClient(pubClient),
          closeRedisClient(subClient),
        ]);
      },
    };
  } catch (error) {
    await Promise.all([
      closeRedisClient(pubClient),
      closeRedisClient(subClient),
    ]);
    if (required) {
      throw new Error(`WebSocket Redis adapter initialization failed: ${error.message}`);
    }
    logger.warn('WebSocket Redis adapter unavailable; using single-process delivery', {
      error: error.message,
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function sessionSnapshot(user) {
  return {
    userId: user.userId,
    username: user.username,
    role: user.role,
    sessionVersion: user.sessionVersion,
    sessionProof: user.sessionProof,
  };
}

async function currentSocketSession(socket, db) {
  try {
    return await verifySessionClaims(socket.data.session, db);
  } catch (error) {
    logger.warn('WebSocket已连接会话被吊销', {
      socketId: socket.id,
      reason: error.message,
    });
    return null;
  }
}

async function disconnectRevokedSocket(socket) {
  await socket.disconnect(true);
}

function roomAllowsUser(room, user) {
  if (!room) return true;
  if (room === 'admin') return user.role === 'admin';
  if (room.startsWith('customer-')) {
    return user.role === 'customer' && room === `customer-${user.userId}`;
  }
  return false;
}

async function emitToCurrentSessions(room, event, payload) {
  if (!io || !sessionDatabase) return;
  const target = room ? io.in(room) : io;
  const sockets = await target.fetchSockets();
  await Promise.all(sockets.map(async (socket) => {
    const user = await currentSocketSession(socket, sessionDatabase);
    if (!user || !roomAllowsUser(room, user)) {
      await disconnectRevokedSocket(socket);
      return;
    }
    socket.emit(event, payload);
  }));
}

async function initWebSocket(server, {
  db,
  path = '/api/socket.io',
  redisClient = null,
  requireRedis = process.env.NODE_ENV === 'production',
  redisAdapterFactory = createAdapter,
} = {}) {
  if (!db) throw new Error('WebSocket会话鉴权需要数据库');
  sessionDatabase = db;
  io = new Server(server, {
    path,
    cors: {
      origin: [...configuredOrigins()],
      credentials: true,
      methods: ['GET', 'POST']
    }
  });

  let redisAdapter;
  try {
    redisAdapter = await configureRedisAdapter(io, {
      redisClient,
      adapterFactory: redisAdapterFactory,
      required: requireRedis,
    });
  } catch (error) {
    io.close();
    io = null;
    sessionDatabase = null;
    throw error;
  }
  if (redisAdapter) {
    server.once('close', () => {
      redisAdapter.close().catch((error) => {
        logger.warn('WebSocket Redis adapter close failed', { error: error.message });
      });
    });
  }

  io.use(async (socket, next) => {
    try {
      const token = handshakeToken(socket);
      if (!token) return next(new Error('UNAUTHORIZED'));
      const user = await verifySessionToken(token, db);
      socket.data.session = sessionSnapshot(user);
      socket.data.user = user;
      return next();
    } catch (error) {
      logger.warn('WebSocket会话验证失败', {
        socketId: socket.id,
        reason: error.message,
      });
      return next(new Error('UNAUTHORIZED'));
    }
  });

  // 连接事件
  io.on('connection', (socket) => {
    logger.info('WebSocket客户端已连接', { socketId: socket.id });

    // 加入管理员房间
    socket.on('join-admin', async (callback) => {
      const user = await currentSocketSession(socket, db);
      if (!user) {
        acknowledge(callback, { ok: false, error: 'UNAUTHORIZED' });
        await disconnectRevokedSocket(socket);
        return;
      }
      if (user.role !== 'admin') {
        acknowledge(callback, { ok: false, error: 'FORBIDDEN' });
        return;
      }
      socket.join('admin');
      logger.info('管理员加入房间', { socketId: socket.id });
      acknowledge(callback, { ok: true });
    });

    // 加入客户房间
    socket.on('join-customer', async (customerId, callback) => {
      const user = await currentSocketSession(socket, db);
      if (!user) {
        acknowledge(callback, { ok: false, error: 'UNAUTHORIZED' });
        await disconnectRevokedSocket(socket);
        return;
      }
      const normalizedCustomerId = Number(customerId);
      if (user.role !== 'customer'
        || !Number.isSafeInteger(normalizedCustomerId)
        || normalizedCustomerId !== user.userId) {
        acknowledge(callback, { ok: false, error: 'FORBIDDEN' });
        return;
      }
      socket.join(`customer-${normalizedCustomerId}`);
      logger.info('客户加入房间', { socketId: socket.id, customerId: normalizedCustomerId });
      acknowledge(callback, { ok: true });
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
async function notifyNewOrder(order) {
  if (io) {
    await emitToCurrentSessions('admin', 'new-order', {
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
async function notifyOrderStatusUpdate(order, customerId) {
  if (io) {
    // 通知管理员
    const adminNotification = emitToCurrentSessions('admin', 'order-status-update', {
      type: 'order-status-update',
      title: '订单状态更新',
      message: `订单 #${order.id} 状态已更新为：${order.status}`,
      data: order,
      timestamp: new Date()
    });

    // 通知客户
    const customerNotification = customerId
      ? emitToCurrentSessions(`customer-${customerId}`, 'order-status-update', {
        type: 'order-status-update',
        title: '订单状态更新',
        message: `您的订单 #${order.id} 状态已更新`,
        data: order,
        timestamp: new Date()
      })
      : Promise.resolve();

    await Promise.all([adminNotification, customerNotification]);

    logger.info('发送订单状态更新通知', { orderId: order.id, status: order.status });
  }
}

// 发送库存预警通知
async function notifyLowStock(products) {
  if (io) {
    await emitToCurrentSessions('admin', 'low-stock-alert', {
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
async function notifySystem(message, type = 'info') {
  if (io) {
    await emitToCurrentSessions('admin', 'system-notification', {
      type: 'system',
      level: type,
      message,
      timestamp: new Date()
    });
    logger.info('发送系统通知', { message, type });
  }
}

// 广播消息给所有连接的客户端
async function broadcast(event, data) {
  if (io) {
    await emitToCurrentSessions(null, event, data);
    logger.info('广播消息', { event });
  }
}

module.exports = {
  configureRedisAdapter,
  initWebSocket,
  getWebSocket,
  notifyNewOrder,
  notifyOrderStatusUpdate,
  notifyLowStock,
  notifySystem,
  broadcast
};
