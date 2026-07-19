if (process.env.MOCK_PG_DUMP_FAIL === 'true') {
  process.stderr.write('simulated pg_dump failure\n');
  process.exitCode = 7;
} else {
  process.stdout.write(Buffer.from('MOCK_POSTGRES_CUSTOM_DUMP\n', 'utf8'));
}
