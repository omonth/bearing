const fs = require('fs');

const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  if (process.env.MOCK_PG_RESTORE_FAIL === 'true') {
    process.stderr.write('simulated pg_restore failure\n');
    process.exitCode = 8;
    return;
  }
  fs.writeFileSync(process.env.MOCK_RESTORE_OUTPUT, Buffer.concat(chunks));
});
