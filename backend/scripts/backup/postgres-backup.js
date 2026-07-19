const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { encryptStreamToFile, loadEncryptionKey } = require('./crypto-stream');
const {
  captureStream,
  parsePrefixArgs,
  sanitizedChildEnv,
  waitForProcess,
} = require('./process-runner');
const { cleanRemoteRetention, loadS3Config, uploadFile } = require('./s3-storage');
const { sendWebhook, validateWebhookUrl } = require('./webhook');

function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function loadBackupConfig(env = process.env) {
  const retentionDays = Number(env.BACKUP_RETENTION_DAYS || 30);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
    throw new Error('BACKUP_RETENTION_DAYS must be an integer between 1 and 3650');
  }
  const production = env.NODE_ENV === 'production';
  const requireRemote = production || env.BACKUP_REQUIRE_REMOTE === 'true';
  const requireAlerts = production || env.BACKUP_REQUIRE_ALERTS === 'true';
  if (requireAlerts && !env.BACKUP_ALERT_WEBHOOK_URL) {
    throw new Error('BACKUP_ALERT_WEBHOOK_URL is required');
  }
  validateWebhookUrl(env.BACKUP_ALERT_WEBHOOK_URL, env);

  return {
    backupDir: path.resolve(env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups')),
    database: required(env.DB_NAME, 'DB_NAME'),
    host: required(env.DB_HOST, 'DB_HOST'),
    key: loadEncryptionKey(env),
    password: required(env.DB_PASSWORD, 'DB_PASSWORD'),
    pgDumpBin: env.PG_DUMP_BIN || 'pg_dump',
    pgDumpPrefixArgs: parsePrefixArgs(env.PG_DUMP_PREFIX_ARGS_JSON, 'PG_DUMP_PREFIX_ARGS_JSON'),
    port: required(String(env.DB_PORT || ''), 'DB_PORT'),
    retentionDays,
    s3: loadS3Config(env, requireRemote),
    user: required(env.DB_USER, 'DB_USER'),
    webhookUrl: env.BACKUP_ALERT_WEBHOOK_URL || null,
  };
}

function timestampForFile(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function dumpEncrypted(config, destination, env) {
  const args = [
    ...config.pgDumpPrefixArgs,
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--host', config.host,
    '--port', config.port,
    '--username', config.user,
    '--dbname', config.database,
  ];
  const child = spawn(config.pgDumpBin, args, {
    env: sanitizedChildEnv(env, { PGPASSWORD: config.password }),
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const getStderr = captureStream(child.stderr);
  const processPromise = waitForProcess(child, 'pg_dump', getStderr);
  const results = await Promise.allSettled([
    encryptStreamToFile(child.stdout, destination, config.key),
    processPromise,
  ]);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) {
    if (child.exitCode === null) child.kill();
    await fs.promises.rm(destination, { force: true });
    throw failure.reason;
  }
}

async function writeManifest(backupPath, config, createdAt) {
  const stats = await fs.promises.stat(backupPath);
  const manifest = {
    schemaVersion: 1,
    createdAt: createdAt.toISOString(),
    database: config.database,
    encrypted: true,
    encryption: 'AES-256-GCM',
    format: 'postgres-custom',
    host: config.host,
    sha256: await sha256File(backupPath),
    size: stats.size,
  };
  const manifestPath = `${backupPath}.json`;
  await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  return { manifest, manifestPath };
}

async function cleanLocalRetention(backupDir, cutoff, keepPaths = []) {
  const keep = new Set(keepPaths.map((item) => path.resolve(item)));
  const entries = await fs.promises.readdir(backupDir, { withFileTypes: true });
  const removed = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.dump\.enc(?:\.json)?$/.test(entry.name)) continue;
    const filePath = path.join(backupDir, entry.name);
    if (keep.has(path.resolve(filePath))) continue;
    const stats = await fs.promises.stat(filePath);
    if (stats.mtime.getTime() < cutoff.getTime()) {
      await fs.promises.rm(filePath);
      removed.push(filePath);
    }
  }
  return removed;
}

async function notifyFailure(env, startedAt, error) {
  if (!env.BACKUP_ALERT_WEBHOOK_URL) return;
  await sendWebhook(env.BACKUP_ALERT_WEBHOOK_URL, {
    event: 'postgres_backup_failed',
    status: 'failed',
    database: env.DB_NAME || 'unknown',
    durationMs: Date.now() - startedAt.getTime(),
    error: error.message,
    occurredAt: new Date().toISOString(),
  }, env);
}

async function runPostgresBackup(env = process.env, now = new Date()) {
  const startedAt = new Date();
  let config;
  try {
    config = loadBackupConfig(env);
    await fs.promises.mkdir(config.backupDir, { recursive: true, mode: 0o700 });
    await fs.promises.chmod(config.backupDir, 0o700);
    const fileName = `bearing_sales_${timestampForFile(now)}.dump.enc`;
    const finalPath = path.join(config.backupDir, fileName);
    const partialPath = `${finalPath}.partial`;
    await fs.promises.rm(partialPath, { force: true });
    await dumpEncrypted(config, partialPath, env);
    await fs.promises.rename(partialPath, finalPath);
    const { manifest, manifestPath } = await writeManifest(finalPath, config, now);

    let remoteKey = null;
    if (config.s3) {
      remoteKey = await uploadFile(config.s3, finalPath, env);
      await uploadFile(config.s3, manifestPath, env);
    }

    const cutoff = new Date(now.getTime() - config.retentionDays * 24 * 60 * 60 * 1000);
    await cleanLocalRetention(config.backupDir, cutoff, [finalPath, manifestPath]);
    if (config.s3) await cleanRemoteRetention(config.s3, cutoff, env);

    await sendWebhook(config.webhookUrl, {
      event: 'postgres_backup_succeeded',
      status: 'success',
      database: config.database,
      durationMs: Date.now() - startedAt.getTime(),
      encryptedSize: manifest.size,
      sha256: manifest.sha256,
      remoteKey,
      occurredAt: new Date().toISOString(),
    }, env);
    return { backupPath: finalPath, manifestPath, remoteKey, manifest };
  } catch (error) {
    try {
      await notifyFailure(env, startedAt, error);
    } catch (alertError) {
      throw new Error(`${error.message}; failure alert also failed: ${alertError.message}`);
    }
    throw error;
  }
}

module.exports = {
  cleanLocalRetention,
  loadBackupConfig,
  runPostgresBackup,
};
