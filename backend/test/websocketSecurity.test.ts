import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import http from 'http';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { io as createClient, type Socket } from 'socket.io-client';
import { createTestDb, seedTestData } from './helpers';

const createApp = require('../app');
const AuthService = require('../services/authService');
const {
  generateCustomerToken,
  JWT_SECRET,
} = require('../middleware/auth');
const {
  configureRedisAdapter,
  initWebSocket,
  notifyNewOrder,
} = require('../services/websocketService');

function connect(url: string, options: Record<string, unknown>) {
  return new Promise<Socket>((resolve, reject) => {
    const socket = createClient(url, {
      path: '/api/socket.io',
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      ...options,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function emitWithAck(socket: Socket, event: string, ...args: unknown[]) {
  return new Promise<Record<string, unknown>>((resolve) => {
    socket.timeout(2_000).emit(event, ...args, (_error: Error | null, response: Record<string, unknown>) => {
      resolve(response);
    });
  });
}

describe('WebSocket room authorization', () => {
  let db: any;
  let server: http.Server;
  let socketServer: any;
  let baseUrl: string;
  let adminToken: string;
  let customerToken: string;
  let customerPasswordHash: string;
  const clients: Socket[] = [];

  beforeEach(async () => {
    db = await createTestDb();
    await seedTestData(db);
    await db.run(`
      CREATE TABLE customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        status TEXT DEFAULT 'active'
      )
    `);
    customerPasswordHash = await bcrypt.hash('customer-password-123', 10);
    await db.run(
      'INSERT INTO customers (name, phone, password) VALUES (?, ?, ?)',
      ['Customer One', '13800000001', customerPasswordHash]
    );
    customerToken = generateCustomerToken(1, 'Customer One', customerPasswordHash);

    const authService = new AuthService(db);
    const app = createApp(db, { authService });
    adminToken = (await authService.login('admin', 'admin123')).token;
    server = http.createServer(app);
    socketServer = await initWebSocket(server, { db });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    clients.forEach((client) => client.disconnect());
    clients.splice(0);
    await new Promise<void>((resolve) => socketServer.close(resolve));
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await db.close();
  });

  it('allows only a current administrator session into the administrator room', async () => {
    const admin = await connect(baseUrl, { auth: { token: adminToken, audience: 'admin' } });
    clients.push(admin);
    await expect(emitWithAck(admin, 'join-admin')).resolves.toEqual({ ok: true });
    expect(socketServer.sockets.sockets.get(admin.id).rooms.has('admin')).toBe(true);

    const customer = await connect(baseUrl, { auth: { token: customerToken, audience: 'customer' } });
    clients.push(customer);
    await expect(emitWithAck(customer, 'join-admin')).resolves.toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(socketServer.sockets.sockets.get(customer.id).rooms.has('admin')).toBe(false);
  });

  it('disconnects a revoked administrator before delivering a new-order event', async () => {
    const admin = await connect(baseUrl, { auth: { token: adminToken, audience: 'admin' } });
    clients.push(admin);
    await expect(emitWithAck(admin, 'join-admin')).resolves.toEqual({ ok: true });

    const receivedOrders: unknown[] = [];
    admin.on('new-order', (event) => receivedOrders.push(event));
    await db.run('UPDATE admins SET session_version = session_version + 1 WHERE id = ?', [1]);

    await notifyNewOrder({ id: 99, customer_name: 'Revoked session customer' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(receivedOrders).toEqual([]);
    expect(admin.connected).toBe(false);
  });

  it('binds customer room membership to the authenticated customer id', async () => {
    const customer = await connect(baseUrl, { auth: { token: customerToken, audience: 'customer' } });
    clients.push(customer);

    await expect(emitWithAck(customer, 'join-customer', 2)).resolves.toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(socketServer.sockets.sockets.get(customer.id).rooms.has('customer-2')).toBe(false);

    await expect(emitWithAck(customer, 'join-customer', 1)).resolves.toEqual({ ok: true });
    expect(socketServer.sockets.sockets.get(customer.id).rooms.has('customer-1')).toBe(true);
  });

  it('accepts an HttpOnly-style cookie handshake and rejects legacy administrator tokens', async () => {
    const login = await request(server)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(200);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const cookieClient = await connect(baseUrl, {
      auth: { audience: 'admin' },
      extraHeaders: { Cookie: cookie },
    });
    clients.push(cookieClient);
    await expect(emitWithAck(cookieClient, 'join-admin')).resolves.toEqual({ ok: true });

    const legacyToken = jwt.sign(
      { userId: 1, username: 'admin', role: 'admin' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    await expect(connect(baseUrl, { auth: { token: legacyToken, audience: 'admin' } }))
      .rejects.toThrow('UNAUTHORIZED');
  });
});

describe('WebSocket Redis adapter contract', () => {
  it('attaches dedicated, healthy Redis pub/sub clients to Socket.IO', async () => {
    const pubClient = {
      on: vi.fn(),
      ping: vi.fn().mockResolvedValue('PONG'),
      quit: vi.fn().mockResolvedValue('OK'),
    };
    const subClient = {
      on: vi.fn(),
      ping: vi.fn().mockResolvedValue('PONG'),
      quit: vi.fn().mockResolvedValue('OK'),
    };
    const redisClient = {
      duplicate: vi.fn()
        .mockReturnValueOnce(pubClient)
        .mockReturnValueOnce(subClient),
    };
    const adapter = vi.fn();
    const adapterFactory = vi.fn().mockReturnValue(adapter);
    const socketIo = { adapter: vi.fn() };

    const configured = await configureRedisAdapter(socketIo, {
      redisClient,
      adapterFactory,
      required: true,
    });

    expect(redisClient.duplicate).toHaveBeenCalledTimes(2);
    expect(pubClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(subClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(adapterFactory).toHaveBeenCalledWith(pubClient, subClient);
    expect(socketIo.adapter).toHaveBeenCalledWith(adapter);
    await configured.close();
    expect([pubClient.quit.mock.calls.length, subClient.quit.mock.calls.length]).toEqual([1, 1]);
  });

  it('fails closed when clustered delivery requires Redis but Redis is unavailable', async () => {
    await expect(configureRedisAdapter({ adapter: vi.fn() }, {
      redisClient: null,
      required: true,
    })).rejects.toThrow('需要 Redis Pub/Sub 客户端');
  });
});
