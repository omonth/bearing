const { spawn } = require('child_process');

const MAX_CAPTURE_BYTES = 64 * 1024;
const SENSITIVE_ENV_NAME = /(PASSWORD|SECRET|TOKEN|PRIVATE_KEY|API_KEY|WEBHOOK_URL|ENCRYPTION_KEY)/i;

function parsePrefixArgs(value, variableName) {
  if (!value) return [];
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${variableName} must be a JSON string array`);
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error(`${variableName} must be a JSON string array`);
  }
  return parsed;
}

function captureStream(stream, maxBytes = MAX_CAPTURE_BYTES) {
  let output = '';
  stream?.setEncoding('utf8');
  stream?.on('data', (chunk) => {
    if (output.length < maxBytes) {
      output += chunk.slice(0, maxBytes - output.length);
    }
  });
  return () => output.trim();
}

function sanitizedChildEnv(env, allowedSecrets = {}) {
  const childEnv = {};
  for (const [name, value] of Object.entries(env)) {
    if (!SENSITIVE_ENV_NAME.test(name)) childEnv[name] = value;
  }
  for (const [name, value] of Object.entries(allowedSecrets)) {
    if (value !== undefined && value !== null) childEnv[name] = value;
  }
  return childEnv;
}

function waitForProcess(child, name, getStderr = () => '') {
  return new Promise((resolve, reject) => {
    child.once('error', (error) => {
      reject(new Error(`${name} could not start: ${error.message}`));
    });
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = getStderr();
      const suffix = detail ? `: ${detail}` : signal ? ` (signal ${signal})` : '';
      reject(new Error(`${name} exited with code ${code}${suffix}`));
    });
  });
}

async function runCaptured(binary, args, options = {}) {
  const child = spawn(binary, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const getStdout = captureStream(child.stdout, options.maxCaptureBytes);
  const getStderr = captureStream(child.stderr);
  await waitForProcess(child, options.name || binary, getStderr);
  return getStdout();
}

module.exports = {
  captureStream,
  parsePrefixArgs,
  runCaptured,
  sanitizedChildEnv,
  waitForProcess,
};
