import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createTestDb, seedTestData } from './helpers';

const createApp = require('../app');
const AuthService = require('../services/authService');
const CustomerService = require('../services/customerService');
const CustomerSelfService = require('../services/customerSelfService');
const AddressBookService = require('../services/addressBookService');
const { ensureCustomerAddressSchema } = require('../db/migrations/customerAddresses');

let app: any;
let db: any;

async function createCustomerTables(database: any) {
  await database.run(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password TEXT,
      email TEXT,
      company TEXT,
      address TEXT,
      level TEXT DEFAULT 'bronze',
      points INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      total_orders INTEGER DEFAULT 0,
      tags TEXT,
      notes TEXT,
      status TEXT DEFAULT 'active',
      phone_verified_at BIGINT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function customerToken(phone: string) {
  const response = await request(app)
    .post('/api/customer/login')
    .send({ phone, password: 'test123' });
  return response.body.data.token as string;
}

function addressPayload(overrides: Record<string, unknown> = {}) {
  return {
    recipientName: 'Address owner',
    recipientPhone: '13800000001',
    province: 'Guangdong',
    city: 'Shenzhen',
    district: 'Nanshan',
    addressDetail: 'Science Park 1',
    ...overrides,
  };
}

beforeAll(async () => {
  db = await createTestDb();
  await seedTestData(db);
  await createCustomerTables(db);
  await ensureCustomerAddressSchema(db);

  const password = await bcrypt.hash('test123', 10);
  await db.run('INSERT INTO customers (name, phone, password, phone_verified_at) VALUES (?, ?, ?, ?)', [
    'Address owner',
    '13800000001',
    password,
    2_000_000_000,
  ]);
  await db.run('INSERT INTO customers (name, phone, password, phone_verified_at) VALUES (?, ?, ?, ?)', [
    'Other customer',
    '13800000002',
    password,
    2_000_000_000,
  ]);

  const authService = new AuthService(db);
  const customerService = new CustomerService(db);
  const addressBookService = new AddressBookService(db);
  const customerSelfService = new CustomerSelfService({
    db,
    customerService,
    addressBookService,
  });

  app = createApp(db, { authService, customerService, customerSelfService });
});

beforeEach(async () => {
  await db.run('DELETE FROM customer_addresses');
});

afterAll(async () => {
  await db.close();
});

describe('Customer address book API', () => {
  it('creates the first address as the customer default and returns it only to that customer', async () => {
    const token = await customerToken('13800000001');

    const createResponse = await request(app)
      .post('/api/customer/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send(addressPayload());

    expect(createResponse.status).toBe(200);
    expect(createResponse.body.data).toMatchObject({
      recipientName: 'Address owner',
      recipientPhone: '13800000001',
      isDefault: true,
    });

    const listResponse = await request(app)
      .get('/api/customer/addresses')
      .set('Authorization', `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toEqual([
      expect.objectContaining({
        recipientName: 'Address owner',
        province: 'Guangdong',
        isDefault: true,
      }),
    ]);
  });

  it('keeps one default address when the default is changed or removed', async () => {
    const token = await customerToken('13800000001');
    const first = await request(app)
      .post('/api/customer/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send(addressPayload({ addressDetail: 'Science Park 1' }));
    const second = await request(app)
      .post('/api/customer/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send(addressPayload({ city: 'Guangzhou', district: 'Tianhe', addressDetail: 'Sports Road 8' }));

    expect(first.body.data.isDefault).toBe(true);
    expect(second.body.data.isDefault).toBe(false);

    const updateResponse = await request(app)
      .put(`/api/customer/addresses/${second.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(addressPayload({ city: 'Guangzhou', district: 'Tianhe', addressDetail: 'Sports Road 8', isDefault: true }));
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.isDefault).toBe(true);

    const afterUpdate = await request(app)
      .get('/api/customer/addresses')
      .set('Authorization', `Bearer ${token}`);
    expect(afterUpdate.body.data.filter((address: { isDefault: boolean }) => address.isDefault)).toEqual([
      expect.objectContaining({ id: second.body.data.id }),
    ]);

    const deleteResponse = await request(app)
      .delete(`/api/customer/addresses/${second.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteResponse.status).toBe(200);

    const afterDelete = await request(app)
      .get('/api/customer/addresses')
      .set('Authorization', `Bearer ${token}`);
    expect(afterDelete.body.data).toEqual([
      expect.objectContaining({ id: first.body.data.id, isDefault: true }),
    ]);
  });

  it('does not expose or mutate another customer address', async () => {
    const ownerToken = await customerToken('13800000001');
    const otherToken = await customerToken('13800000002');
    const createResponse = await request(app)
      .post('/api/customer/addresses')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(addressPayload());
    const addressId = createResponse.body.data.id;

    const listResponse = await request(app)
      .get('/api/customer/addresses')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(listResponse.body.data).toEqual([]);

    const updateResponse = await request(app)
      .put(`/api/customer/addresses/${addressId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send(addressPayload({ addressDetail: 'Attempted takeover' }));
    expect(updateResponse.status).toBe(404);

    const deleteResponse = await request(app)
      .delete(`/api/customer/addresses/${addressId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(deleteResponse.status).toBe(404);

    const ownerList = await request(app)
      .get('/api/customer/addresses')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerList.body.data).toEqual([
      expect.objectContaining({ id: addressId, addressDetail: 'Science Park 1' }),
    ]);
  });

  it('requires a customer token and validates address fields', async () => {
    const unauthenticated = await request(app).get('/api/customer/addresses');
    expect(unauthenticated.status).toBe(401);

    const token = await customerToken('13800000001');
    const invalidPhone = await request(app)
      .post('/api/customer/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send(addressPayload({ recipientPhone: 'not-a-phone' }));
    expect(invalidPhone.status).toBe(400);

    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    const adminResponse = await request(app)
      .get('/api/customer/addresses')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`);
    expect(adminResponse.status).toBe(403);
  });
});
