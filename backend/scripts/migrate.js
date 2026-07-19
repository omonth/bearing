#!/usr/bin/env node

require('dotenv').config();

const { closeDatabase, getDatabase } = require('../db/adapter');
const {
  applyMigrations,
  checkMigrations,
  getMigrationStatus,
  rollbackLastMigration,
} = require('../migrations/migrator');

function printResult(command, result) {
  console.log(JSON.stringify({ command, ...result }, null, 2));
}

async function execute(command, args) {
  const db = getDatabase();

  if (command === 'apply') {
    printResult(command, await applyMigrations(db));
    return;
  }
  if (command === 'check') {
    const status = await checkMigrations(db);
    printResult(command, { applied: status.applied, pending: status.pending });
    return;
  }
  if (command === 'status') {
    const status = await getMigrationStatus(db);
    printResult(command, { applied: status.applied, pending: status.pending });
    return;
  }
  if (command === 'rollback') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Production rollback is disabled; use a new forward migration or the documented backup recovery plan');
    }
    const [version, confirmation] = args;
    if (!version || confirmation !== '--confirm') {
      throw new Error('Usage: node scripts/migrate.js rollback <version> --confirm');
    }
    printResult(command, await rollbackLastMigration(db, { confirmedVersion: version }));
    return;
  }

  throw new Error('Usage: node scripts/migrate.js <apply|check|status|rollback>');
}

async function main(argv = process.argv.slice(2)) {
  const [command = 'status', ...args] = argv;
  try {
    if (process.env.NODE_ENV === 'production') {
      const { validateProductionEnvironment } = require('../config/production');
      validateProductionEnvironment();
    }
    await execute(command, args);
  } finally {
    await closeDatabase();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({
      command: process.argv[2] || 'status',
      error: error.message,
      code: error.code || 'MIGRATION_COMMAND_FAILED',
    }));
    process.exitCode = 1;
  });
}

module.exports = { execute, main };
