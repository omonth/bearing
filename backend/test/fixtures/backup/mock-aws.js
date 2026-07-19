const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const serviceIndex = args.findIndex((argument) => argument === 's3' || argument === 's3api');
if (serviceIndex === -1) throw new Error('mock aws did not receive an s3 command');

const service = args[serviceIndex];
const command = args[serviceIndex + 1];
const commandArgs = args.slice(serviceIndex + 2);
const remoteRoot = process.env.MOCK_S3_ROOT;

function option(name) {
  const index = commandArgs.indexOf(name);
  return index === -1 ? null : commandArgs[index + 1];
}

function fromS3Uri(uri) {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!match) throw new Error(`invalid mock S3 URI: ${uri}`);
  return path.join(remoteRoot, match[1], ...match[2].split('/'));
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

if (service === 's3' && command === 'cp') {
  const [source, destination] = commandArgs;
  const sourcePath = source.startsWith('s3://') ? fromS3Uri(source) : source;
  const destinationPath = destination.startsWith('s3://') ? fromS3Uri(destination) : destination;
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
} else if (service === 's3api' && command === 'list-objects-v2') {
  const bucket = option('--bucket');
  const prefix = option('--prefix') || '';
  const bucketRoot = path.join(remoteRoot, bucket);
  const contents = listFiles(bucketRoot)
    .map((filePath) => {
      const stats = fs.statSync(filePath);
      return {
        Key: path.relative(bucketRoot, filePath).split(path.sep).join('/'),
        LastModified: stats.mtime.toISOString(),
      };
    })
    .filter((item) => item.Key.startsWith(prefix));
  process.stdout.write(JSON.stringify({ Contents: contents }));
} else if (service === 's3api' && command === 'delete-object') {
  const bucket = option('--bucket');
  const key = option('--key');
  fs.rmSync(path.join(remoteRoot, bucket, ...key.split('/')), { force: true });
} else {
  throw new Error(`unsupported mock aws command: ${service} ${command}`);
}
