#!/usr/bin/env node
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { decryptFileToWritable, loadEncryptionKey, verifyEncryptedBackup } = require('./crypto-stream');
const {
  captureStream,
  parsePrefixArgs,
  sanitizedChildEnv,
  waitForProcess,
} = require('./process-runner');
const { downloadFile, loadS3Config } = require('./s3-storage');
const { sendWebhook } = require('./webhook');

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const separator = argument.indexOf('=');
    if (separator !== -1) {
      result[argument.slice(2, separator)] = argument.slice(separator + 1);
      continue;
    }
    const name = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}`);
    result[name] = value;
    index += 1;
  }
  return result;
}

function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function productionConfirmation(database) {
  return `RESTORE_${database.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`;
}

function loadRestoreConfig(args, env = process.env) {
  const database = required(env.DB_NAME, 'DB_NAME');
  const targetEnvironment = (env.RESTORE_TARGET_ENV || 'production').toLowerCase();
  if (targetEnvironment === 'production') {
    const expected = productionConfirmation(database);
    if (env.ALLOW_PRODUCTION_RESTORE !== 'true' || args['confirm-production'] !== expected) {
      throw new Error(
        `Production restore refused. Set ALLOW_PRODUCTION_RESTORE=true and pass --confirm-production=${expected}`,
      );
    }
  }

  if (!args.file && !args['s3-key']) {
    throw new Error('Pass exactly one of --file or --s3-key');
  }
  if (args.file && args['s3-key']) throw new Error('Pass only one of --file or --s3-key');

  return {
    database,
    host: required(env.DB_HOST, 'DB_HOST'),
    key: loadEncryptionKey(env),
    password: required(env.DB_PASSWORD, 'DB_PASSWORD'),
    pgRestoreBin: env.PG_RESTORE_BIN || 'pg_restore',
    pgRestorePrefixArgs: parsePrefixArgs(env.PG_RESTORE_PREFIX_ARGS_JSON, 'PG_RESTORE_PREFIX_ARGS_JSON'),
    port: required(String(env.DB_PORT || ''), 'DB_PORT'),
    s3: args['s3-key'] ? loadS3Config(env, true) : null,
    sourceFile: args.file ? path.resolve(args.file) : null,
    sourceManifest: args.manifest ? path.resolve(args.manifest) : null,
    sourceKey: args['s3-key'] || null,
    targetEnvironment,
    user: required(env.DB_USER, 'DB_USER'),
    webhookUrl: env.BACKUP_ALERT_WEBHOOK_URL || null,
    expectedSourceDatabase: env.RESTORE_EXPECTED_SOURCE_DB
      || (targetEnvironment === 'production' ? database : null),
  };
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function verifyManifest(config, encryptedPath, manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Backup manifest is missing or invalid: ${error.message}`);
  }
  if (manifest.schemaVersion !== 1
    || manifest.encrypted !== true
    || manifest.encryption !== 'AES-256-GCM'
    || manifest.format !== 'postgres-custom'
    || typeof manifest.database !== 'string'
    || typeof manifest.sha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(manifest.sha256)
    || !Number.isSafeInteger(manifest.size)
    || manifest.size <= 0
    || !Number.isFinite(Date.parse(manifest.createdAt))) {
    throw new Error('Backup manifest contract is invalid');
  }
  if (config.expectedSourceDatabase && manifest.database !== config.expectedSourceDatabase) {
    throw new Error(
      `Backup source database mismatch: expected ${config.expectedSourceDatabase}, received ${manifest.database}`,
    );
  }
  const stats = await fs.promises.stat(encryptedPath);
  if (stats.size !== manifest.size) throw new Error('Backup manifest size does not match ciphertext');
  if (await sha256File(encryptedPath) !== manifest.sha256) {
    throw new Error('Backup manifest checksum does not match ciphertext');
  }
  return manifest;
}

async function restoreEncryptedBackup(config, encryptedPath, env) {
  await verifyEncryptedBackup(encryptedPath, config.key);

  const args = [
    ...config.pgRestorePrefixArgs,
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--exit-on-error',
    '--single-transaction',
    '--host', config.host,
    '--port', config.port,
    '--username', config.user,
    '--dbname', config.database,
  ];
  const child = spawn(config.pgRestoreBin, args, {
    env: sanitizedChildEnv(env, { PGPASSWORD: config.password }),
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  const getStderr = captureStream(child.stderr);
  const processPromise = waitForProcess(child, 'pg_restore', getStderr);
  const results = await Promise.allSettled([
    decryptFileToWritable(encryptedPath, child.stdin, config.key),
    processPromise,
  ]);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) {
    if (child.exitCode === null) child.kill();
    throw failure.reason;
  }
}

async function runRestore(argv = process.argv.slice(2), env = process.env) {
  const startedAt = Date.now();
  const args = parseArgs(argv);
  const config = loadRestoreConfig(args, env);
  let temporaryDirectory = null;
  let encryptedPath = config.sourceFile;
  let manifestPath = config.sourceManifest || (config.sourceFile ? `${config.sourceFile}.json` : null);
  try {
    if (config.sourceKey) {
      temporaryDirectory = await fs.promises.mkdtemp(path.join(
        path.resolve(env.RESTORE_TEMP_DIR || os.tmpdir()),
        'bearing-restore-',
      ));
      encryptedPath = path.join(temporaryDirectory, path.basename(config.sourceKey));
      manifestPath = `${encryptedPath}.json`;
      await downloadFile(config.s3, config.sourceKey, encryptedPath, env);
      await downloadFile(config.s3, `${config.sourceKey}.json`, manifestPath, env);
    }
    await fs.promises.access(encryptedPath, fs.constants.R_OK);
    await verifyManifest(config, encryptedPath, manifestPath);
    await restoreEncryptedBackup(config, encryptedPath, env);
    await sendWebhook(config.webhookUrl, {
      event: 'postgres_restore_succeeded',
      status: 'success',
      database: config.database,
      targetEnvironment: config.targetEnvironment,
      durationMs: Date.now() - startedAt,
      occurredAt: new Date().toISOString(),
    }, env);
    return { database: config.database, durationMs: Date.now() - startedAt };
  } catch (error) {
    try {
      await sendWebhook(config.webhookUrl, {
        event: 'postgres_restore_failed',
        status: 'failed',
        database: config.database,
        targetEnvironment: config.targetEnvironment,
        durationMs: Date.now() - startedAt,
        error: error.message,
        occurredAt: new Date().toISOString(),
      }, env);
    } catch (alertError) {
      throw new Error(`${error.message}; restore failure alert also failed: ${alertError.message}`);
    }
    throw error;
  } finally {
    if (temporaryDirectory) await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (require.main === module) {
  runRestore()
    .then((result) => {
      console.log(`PostgreSQL 恢复成功: ${result.database} (${result.durationMs}ms)`);
    })
    .catch((error) => {
      console.error(`PostgreSQL 恢复失败: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  loadRestoreConfig,
  parseArgs,
  productionConfirmation,
  restoreEncryptedBackup,
  runRestore,
  verifyManifest,
};
