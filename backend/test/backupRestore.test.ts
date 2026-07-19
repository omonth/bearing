import { createServer, type Server } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const backendRoot = path.resolve(__dirname, '..');
const backupCli = path.join(backendRoot, 'backup.js');
const restoreCli = path.join(backendRoot, 'scripts', 'backup', 'restore-postgres.js');
const fixture = (name: string) => path.join(__dirname, 'fixtures', 'backup', name);
const key = Buffer.alloc(32, 23).toString('base64');
const dumpContents = Buffer.from('MOCK_POSTGRES_CUSTOM_DUMP\n');
const temporaryDirectories: string[] = [];
const servers: Server[] = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'bearing-backup-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function alertServer() {
  const events: Record<string, unknown>[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      events.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      response.writeHead(204).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('alert server did not bind');
  return { events, url: `http://127.0.0.1:${address.port}/backup-alert` };
}

function baseEnv(root: string, webhookUrl: string) {
  return {
    ...process.env,
    NODE_ENV: 'test',
    DB_TYPE: 'postgres',
    DB_HOST: 'mock-postgres',
    DB_PORT: '5432',
    DB_NAME: 'bearing_sales_restore_drill',
    DB_USER: 'backup_operator',
    DB_PASSWORD: 'not-a-real-password',
    BACKUP_DIR: path.join(root, 'backups'),
    BACKUP_ENCRYPTION_KEY_BASE64: key,
    BACKUP_RETENTION_DAYS: '30',
    BACKUP_REQUIRE_REMOTE: 'true',
    BACKUP_REQUIRE_ALERTS: 'true',
    BACKUP_ALERT_WEBHOOK_URL: webhookUrl,
    BACKUP_S3_BUCKET: 'mock-offsite-bucket',
    BACKUP_S3_ENDPOINT: 'http://mock-s3.invalid',
    BACKUP_S3_PREFIX: 'bearing-sales/postgres',
    BACKUP_S3_REGION: 'test-region-1',
    BACKUP_S3_CLI_BIN: process.execPath,
    BACKUP_S3_CLI_PREFIX_ARGS_JSON: JSON.stringify([fixture('mock-aws.js')]),
    MOCK_S3_ROOT: path.join(root, 'offsite'),
    PG_DUMP_BIN: process.execPath,
    PG_DUMP_PREFIX_ARGS_JSON: JSON.stringify([fixture('mock-pg-dump.js')]),
    LOG_DIR: path.join(root, 'logs'),
  };
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true,
  })));
});

describe('PostgreSQL encrypted backup and restore drill', () => {
  it('streams pg_dump through encryption, uploads offsite, applies retention, and restores exactly', async () => {
    const root = await temporaryDirectory();
    const { events, url } = await alertServer();
    const env = baseEnv(root, url);
    const oldLocal = path.join(env.BACKUP_DIR, 'old.dump.enc');
    const oldRemote = path.join(env.MOCK_S3_ROOT, env.BACKUP_S3_BUCKET, env.BACKUP_S3_PREFIX, 'old.dump.enc');
    await mkdir(path.dirname(oldLocal), { recursive: true });
    await mkdir(path.dirname(oldRemote), { recursive: true });
    await writeFile(oldLocal, 'expired-local');
    await writeFile(oldRemote, 'expired-remote');
    const oldTime = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await utimes(oldLocal, oldTime, oldTime);
    await utimes(oldRemote, oldTime, oldTime);

    const backupResult = await execFileAsync(process.execPath, [backupCli], { cwd: backendRoot, env });
    expect(backupResult.stderr).toBe('');
    const localFiles = await readdir(env.BACKUP_DIR);
    const encryptedName = localFiles.find((name) => name.endsWith('.dump.enc'));
    expect(encryptedName).toBeDefined();
    expect(localFiles).not.toContain('old.dump.enc');
    expect(localFiles.some((name) => name.endsWith('.dump') && !name.endsWith('.enc'))).toBe(false);

    const encryptedPath = path.join(env.BACKUP_DIR, encryptedName!);
    const encrypted = await readFile(encryptedPath);
    expect(encrypted.includes(dumpContents)).toBe(false);
    await expect(stat(`${encryptedPath}.json`)).resolves.toBeDefined();

    const remotePath = path.join(
      env.MOCK_S3_ROOT,
      env.BACKUP_S3_BUCKET,
      env.BACKUP_S3_PREFIX,
      encryptedName!,
    );
    await expect(stat(remotePath)).resolves.toBeDefined();
    await expect(stat(oldRemote)).rejects.toThrow();

    const restoreOutput = path.join(root, 'restored.dump');
    const restoreEnv = {
      ...env,
      RESTORE_TARGET_ENV: 'development',
      RESTORE_TEMP_DIR: path.join(root, 'restore-temp'),
      PG_RESTORE_BIN: process.execPath,
      PG_RESTORE_PREFIX_ARGS_JSON: JSON.stringify([fixture('mock-pg-restore.js')]),
      MOCK_RESTORE_OUTPUT: restoreOutput,
    };
    await mkdir(restoreEnv.RESTORE_TEMP_DIR, { recursive: true });
    const keyName = `${env.BACKUP_S3_PREFIX}/${encryptedName}`;
    const restoreResult = await execFileAsync(
      process.execPath,
      [restoreCli, `--s3-key=${keyName}`],
      { cwd: backendRoot, env: restoreEnv },
    );
    expect(restoreResult.stderr).toBe('');
    expect(await readFile(restoreOutput)).toEqual(dumpContents);
    expect(events.map((event) => event.event)).toEqual([
      'postgres_backup_succeeded',
      'postgres_restore_succeeded',
    ]);
  });

  it('returns non-zero, removes partial output, and alerts when pg_dump fails', async () => {
    const root = await temporaryDirectory();
    const { events, url } = await alertServer();
    const env = { ...baseEnv(root, url), MOCK_PG_DUMP_FAIL: 'true' };

    await expect(execFileAsync(process.execPath, [backupCli], { cwd: backendRoot, env }))
      .rejects.toMatchObject({ code: 1 });
    const files = await readdir(env.BACKUP_DIR);
    expect(files.filter((name) => name.includes('.dump.enc'))).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: 'postgres_backup_failed', status: 'failed' });
  });

  it('authenticates the entire ciphertext before starting pg_restore', async () => {
    const root = await temporaryDirectory();
    const { url } = await alertServer();
    const env = baseEnv(root, url);
    await execFileAsync(process.execPath, [backupCli], { cwd: backendRoot, env });
    const encryptedName = (await readdir(env.BACKUP_DIR)).find((name) => name.endsWith('.dump.enc'))!;
    const encryptedPath = path.join(env.BACKUP_DIR, encryptedName);
    const encrypted = await readFile(encryptedPath);
    encrypted[encrypted.length - 1] ^= 0xff;
    await writeFile(encryptedPath, encrypted);
    const restoreOutput = path.join(root, 'must-not-exist.dump');
    const restoreEnv = {
      ...env,
      RESTORE_TARGET_ENV: 'development',
      PG_RESTORE_BIN: process.execPath,
      PG_RESTORE_PREFIX_ARGS_JSON: JSON.stringify([fixture('mock-pg-restore.js')]),
      MOCK_RESTORE_OUTPUT: restoreOutput,
    };

    await expect(execFileAsync(
      process.execPath,
      [restoreCli, `--file=${encryptedPath}`],
      { cwd: backendRoot, env: restoreEnv },
    )).rejects.toMatchObject({ code: 1 });
    await expect(stat(restoreOutput)).rejects.toThrow();
  });

  it('refuses a mismatched manifest before starting pg_restore', async () => {
    const root = await temporaryDirectory();
    const { url } = await alertServer();
    const env = baseEnv(root, url);
    await execFileAsync(process.execPath, [backupCli], { cwd: backendRoot, env });
    const encryptedName = (await readdir(env.BACKUP_DIR)).find((name) => name.endsWith('.dump.enc'))!;
    const encryptedPath = path.join(env.BACKUP_DIR, encryptedName);
    const manifestPath = `${encryptedPath}.json`;
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.database = 'another_database';
    await writeFile(manifestPath, JSON.stringify(manifest));
    const restoreOutput = path.join(root, 'must-not-exist.dump');
    const restoreEnv = {
      ...env,
      RESTORE_TARGET_ENV: 'development',
      RESTORE_EXPECTED_SOURCE_DB: 'bearing_sales_restore_drill',
      PG_RESTORE_BIN: process.execPath,
      PG_RESTORE_PREFIX_ARGS_JSON: JSON.stringify([fixture('mock-pg-restore.js')]),
      MOCK_RESTORE_OUTPUT: restoreOutput,
    };

    await expect(execFileAsync(
      process.execPath,
      [restoreCli, `--file=${encryptedPath}`],
      { cwd: backendRoot, env: restoreEnv },
    )).rejects.toMatchObject({ code: 1 });
    await expect(stat(restoreOutput)).rejects.toThrow();
  });
});

describe('production safety gates', () => {
  it('requires configured offsite storage for production backups', () => {
    const { loadBackupConfig } = require('../scripts/backup/postgres-backup');
    expect(() => loadBackupConfig({
      NODE_ENV: 'production',
      DB_HOST: 'postgres',
      DB_PORT: '5432',
      DB_NAME: 'bearing_sales',
      DB_USER: 'backup_operator',
      DB_PASSWORD: 'not-a-real-password',
      BACKUP_ENCRYPTION_KEY_BASE64: key,
      BACKUP_ALERT_WEBHOOK_URL: 'https://alerts.example.test/backup',
    })).toThrow('BACKUP_S3_BUCKET is required');
  });

  it('refuses an implicit production restore', () => {
    const { loadRestoreConfig } = require('../scripts/backup/restore-postgres');
    expect(() => loadRestoreConfig({ file: 'backup.dump.enc' }, {
      DB_HOST: 'postgres',
      DB_PORT: '5432',
      DB_NAME: 'bearing_sales',
      DB_USER: 'restore_operator',
      DB_PASSWORD: 'not-a-real-password',
      BACKUP_ENCRYPTION_KEY_BASE64: key,
    })).toThrow('Production restore refused');
  });
});
