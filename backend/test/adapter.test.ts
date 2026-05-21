import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from './helpers';

let db: any;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.close();
});

describe('DB Adapter', () => {
  it('should create a table', async () => {
    const result = await db.run('CREATE TABLE test_items (id INTEGER PRIMARY KEY, name TEXT)');
    expect(result).toBeDefined();
  });

  it('should insert and retrieve a row via get', async () => {
    await db.run('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');
    const insert = await db.run('INSERT INTO users (name) VALUES (?)', ['Alice']);
    expect(insert.lastID).toBeGreaterThan(0);

    const row = await db.get('SELECT * FROM users WHERE id = ?', [insert.lastID]);
    expect(row.name).toBe('Alice');
  });

  it('should return null for missing row', async () => {
    await db.run('CREATE TABLE things (id INTEGER PRIMARY KEY, val TEXT)');
    const row = await db.get('SELECT * FROM things WHERE id = ?', [999]);
    expect(row).toBeNull();
  });

  it('should return all rows', async () => {
    await db.run('CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');
    await db.run('INSERT INTO items (name) VALUES (?)', ['A']);
    await db.run('INSERT INTO items (name) VALUES (?)', ['B']);
    const rows = await db.all('SELECT * FROM items ORDER BY id', []);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('A');
    expect(rows[1].name).toBe('B');
  });

  it('should return changes count', async () => {
    await db.run('CREATE TABLE counters (id INTEGER PRIMARY KEY, val INTEGER)');
    await db.run('INSERT INTO counters (val) VALUES (?)', [1]);
    const result = await db.run('UPDATE counters SET val = val + 1', []);
    expect(result.changes).toBe(1);
  });

  it('should commit a transaction', async () => {
    await db.run('CREATE TABLE txn_test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');
    await db.transaction(async (tx: any) => {
      await tx.run('INSERT INTO txn_test (name) VALUES (?)', ['TxItem']);
    });
    const rows = await db.all('SELECT * FROM txn_test', []);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('TxItem');
  });

  it('should rollback a transaction on error', async () => {
    await db.run('CREATE TABLE rb_test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE)');
    await db.run('INSERT INTO rb_test (name) VALUES (?)', ['Unique']);
    try {
      await db.transaction(async (tx: any) => {
        await tx.run('INSERT INTO rb_test (name) VALUES (?)', ['Unique']);
        await tx.run('INSERT INTO rb_test (name) VALUES (?)', ['Unique']);
      });
    } catch {}
    const rows = await db.all('SELECT * FROM rb_test', []);
    expect(rows).toHaveLength(1);
  });

  it('should return lastID from run', async () => {
    await db.run('CREATE TABLE seq (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT)');
    const r1 = await db.run('INSERT INTO seq (label) VALUES (?)', ['first']);
    const r2 = await db.run('INSERT INTO seq (label) VALUES (?)', ['second']);
    expect(r1.lastID).toBe(1);
    expect(r2.lastID).toBe(2);
  });
});
