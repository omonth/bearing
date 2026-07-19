#!/usr/bin/env node

const { checkRollbackCompatibility } = require('../migrations/migrator');

function main(argv = process.argv.slice(2)) {
  if (argv.length > 1) {
    throw new Error('Usage: node scripts/checkMigrationRollbackCompatibility.js [migration-directory]');
  }
  const migrationDirectory = argv[0];
  const result = checkRollbackCompatibility(migrationDirectory ? { migrationDirectory } : undefined);
  console.log(JSON.stringify({ command: 'rollback-compat', ...result }, null, 2));
  return result;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(JSON.stringify({
      command: 'rollback-compat',
      error: error.message,
      code: error.code || 'ROLLBACK_COMPATIBILITY_CHECK_FAILED',
    }));
    process.exitCode = 1;
  }
}

module.exports = { main };
