const crypto = require('crypto');
const fs = require('fs');
const { pipeline } = require('stream/promises');
const { Writable } = require('stream');

const MAGIC = Buffer.from('BRGBK01\n', 'ascii');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + IV_LENGTH;

function decodeEncryptionKey(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('BACKUP_ENCRYPTION_KEY_BASE64 or BACKUP_ENCRYPTION_KEY_FILE is required');
  }

  const normalized = value.trim();
  if (!/^[A-Za-z0-9+/]{43}=$/.test(normalized)) {
    throw new Error('Backup encryption key must be a canonical base64-encoded 32-byte key');
  }

  const key = Buffer.from(normalized, 'base64');
  if (key.length !== 32 || key.toString('base64') !== normalized) {
    throw new Error('Backup encryption key must decode to exactly 32 bytes');
  }
  return key;
}

function loadEncryptionKey(env = process.env) {
  if (env.BACKUP_ENCRYPTION_KEY_FILE) {
    const value = fs.readFileSync(env.BACKUP_ENCRYPTION_KEY_FILE, 'utf8');
    return decodeEncryptionKey(value);
  }
  return decodeEncryptionKey(env.BACKUP_ENCRYPTION_KEY_BASE64);
}

async function encryptStreamToFile(input, destination, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const header = Buffer.concat([MAGIC, iv]);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(header);

  const output = fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 });
  output.write(header);

  try {
    await pipeline(input, cipher, output, { end: false });
    output.end(cipher.getAuthTag());
    await new Promise((resolve, reject) => {
      output.once('close', resolve);
      output.once('error', reject);
    });
  } catch (error) {
    output.destroy();
    await fs.promises.rm(destination, { force: true });
    throw error;
  }
}

async function readEnvelope(filePath) {
  const stats = await fs.promises.stat(filePath);
  if (stats.size <= HEADER_LENGTH + TAG_LENGTH) {
    throw new Error('Encrypted backup is truncated');
  }

  const handle = await fs.promises.open(filePath, 'r');
  try {
    const header = Buffer.alloc(HEADER_LENGTH);
    const tag = Buffer.alloc(TAG_LENGTH);
    await handle.read(header, 0, HEADER_LENGTH, 0);
    await handle.read(tag, 0, TAG_LENGTH, stats.size - TAG_LENGTH);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new Error('Encrypted backup has an unsupported format');
    }
    return { header, tag, size: stats.size };
  } finally {
    await handle.close();
  }
}

async function decryptFileToWritable(filePath, output, key) {
  const { header, tag, size } = await readEnvelope(filePath);
  const iv = header.subarray(MAGIC.length);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(header);
  decipher.setAuthTag(tag);

  const input = fs.createReadStream(filePath, {
    start: HEADER_LENGTH,
    end: size - TAG_LENGTH - 1,
  });
  await pipeline(input, decipher, output);
}

async function verifyEncryptedBackup(filePath, key) {
  const discard = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  await decryptFileToWritable(filePath, discard, key);
}

module.exports = {
  decryptFileToWritable,
  encryptStreamToFile,
  loadEncryptionKey,
  verifyEncryptedBackup,
};
