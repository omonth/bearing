const path = require('path');
const { parsePrefixArgs, runCaptured, sanitizedChildEnv } = require('./process-runner');

function loadS3Config(env = process.env, required = false) {
  const bucket = env.BACKUP_S3_BUCKET?.trim();
  if (!bucket) {
    if (required) throw new Error('BACKUP_S3_BUCKET is required for offsite backups');
    return null;
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error('BACKUP_S3_BUCKET is invalid');
  }

  const endpoint = env.BACKUP_S3_ENDPOINT?.trim() || null;
  if (endpoint) {
    const url = new URL(endpoint);
    if (url.username || url.password) throw new Error('BACKUP_S3_ENDPOINT must not contain credentials');
    if (url.protocol !== 'https:' && env.NODE_ENV === 'production') {
      throw new Error('BACKUP_S3_ENDPOINT must use HTTPS in production');
    }
  }

  const prefix = (env.BACKUP_S3_PREFIX || 'bearing-sales/postgres')
    .replace(/^\/+|\/+$/g, '');
  if (!prefix || prefix.includes('..')) throw new Error('BACKUP_S3_PREFIX is invalid');

  return {
    binary: env.BACKUP_S3_CLI_BIN || 'aws',
    bucket,
    endpoint,
    prefix,
    prefixArgs: parsePrefixArgs(env.BACKUP_S3_CLI_PREFIX_ARGS_JSON, 'BACKUP_S3_CLI_PREFIX_ARGS_JSON'),
    region: env.BACKUP_S3_REGION || 'us-east-1',
  };
}

function globalArgs(config) {
  return config.endpoint ? ['--endpoint-url', config.endpoint] : [];
}

function commandEnv(config, env) {
  return sanitizedChildEnv(env, {
    AWS_DEFAULT_REGION: config.region,
    AWS_REGION: config.region,
    AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
    AWS_SESSION_TOKEN: env.AWS_SESSION_TOKEN,
    AWS_WEB_IDENTITY_TOKEN_FILE: env.AWS_WEB_IDENTITY_TOKEN_FILE,
  });
}

function objectKey(config, fileName) {
  return `${config.prefix}/${fileName}`;
}

async function uploadFile(config, localPath, env = process.env) {
  const key = objectKey(config, path.basename(localPath));
  await runCaptured(config.binary, [
    ...config.prefixArgs,
    ...globalArgs(config),
    's3',
    'cp',
    localPath,
    `s3://${config.bucket}/${key}`,
    '--only-show-errors',
  ], { env: commandEnv(config, env), name: 'S3 upload' });
  return key;
}

async function downloadFile(config, key, localPath, env = process.env) {
  if (!key.startsWith(`${config.prefix}/`) || key.includes('..')) {
    throw new Error('Restore S3 key is outside BACKUP_S3_PREFIX');
  }
  await runCaptured(config.binary, [
    ...config.prefixArgs,
    ...globalArgs(config),
    's3',
    'cp',
    `s3://${config.bucket}/${key}`,
    localPath,
    '--only-show-errors',
  ], { env: commandEnv(config, env), name: 'S3 download' });
}

async function cleanRemoteRetention(config, cutoff, env = process.env) {
  const objects = [];
  let continuationToken = null;
  do {
    const output = await runCaptured(config.binary, [
      ...config.prefixArgs,
      ...globalArgs(config),
      's3api',
      'list-objects-v2',
      '--bucket',
      config.bucket,
      '--prefix',
      `${config.prefix}/`,
      ...(continuationToken ? ['--continuation-token', continuationToken] : []),
      '--output',
      'json',
    ], {
      env: commandEnv(config, env),
      maxCaptureBytes: 8 * 1024 * 1024,
      name: 'S3 retention listing',
    });

    let listing;
    try {
      listing = output ? JSON.parse(output) : {};
    } catch {
      throw new Error('S3 retention listing returned invalid JSON');
    }
    if (Array.isArray(listing.Contents)) objects.push(...listing.Contents);
    continuationToken = listing.IsTruncated ? listing.NextContinuationToken : null;
    if (listing.IsTruncated && !continuationToken) {
      throw new Error('S3 retention listing was truncated without a continuation token');
    }
  } while (continuationToken);

  const expiredDumpKeys = objects
    .filter((item) => typeof item.Key === 'string' && item.Key.endsWith('.dump.enc'))
    .filter((item) => new Date(item.LastModified).getTime() < cutoff.getTime())
    .map((item) => item.Key);

  const existingKeys = new Set(objects.map((item) => item.Key));
  const keysToDelete = expiredDumpKeys.flatMap((key) => (
    existingKeys.has(`${key}.json`) ? [key, `${key}.json`] : [key]
  ));

  for (const key of keysToDelete) {
    await runCaptured(config.binary, [
      ...config.prefixArgs,
      ...globalArgs(config),
      's3api',
      'delete-object',
      '--bucket',
      config.bucket,
      '--key',
      key,
    ], { env: commandEnv(config, env), name: 'S3 retention deletion' });
  }
  return keysToDelete;
}

module.exports = {
  cleanRemoteRetention,
  downloadFile,
  loadS3Config,
  uploadFile,
};
