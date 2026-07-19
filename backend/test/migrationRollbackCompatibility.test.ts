const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  checkRollbackCompatibility,
  loadMigrations,
} = require('../migrations/migrator');

function writeMigration(deploymentSource: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bearing-rollback-compat-'));
  fs.writeFileSync(
    path.join(directory, '202607190099_compatibility_probe.js'),
    `module.exports = {
      version: '202607190099',
      name: 'compatibility_probe',
      metadata: {
        compatibility: { sqlite: '3.24+', postgresql: '12+' },
        ${deploymentSource}
        dataImpact: 'Creates an empty additive probe table.',
        recoveryPlan: 'Drop the empty probe table before dependent code is deployed.'
      },
      async up({ db }) { await db.run('CREATE TABLE compatibility_probe (id INTEGER)'); },
      async down({ db }) { await db.run('DROP TABLE compatibility_probe'); }
    };\n`,
    'utf8'
  );
  return directory;
}

describe('migration rollback compatibility gate', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('accepts a migration with an explicit compatible deployment assessment', () => {
    const directory = writeMigration(`deployment: {
          previousReleaseCompatible: true,
          rationale: 'The new table is additive and ignored by the immediately previous release.'
        },`);
    temporaryDirectories.push(directory);

    expect(checkRollbackCompatibility({ migrationDirectory: directory })).toEqual({
      compatible: true,
      checked: [{
        version: '202607190099',
        name: 'compatibility_probe',
        rationale: 'The new table is additive and ignored by the immediately previous release.',
      }],
    });
  });

  it('rejects missing deployment compatibility metadata', () => {
    const directory = writeMigration('');
    temporaryDirectories.push(directory);

    let caughtError;
    try {
      loadMigrations(directory);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toMatchObject({
      code: 'INVALID_MIGRATION',
      message: expect.stringMatching(/previousReleaseCompatible.*rationale/i),
    });
  });

  it('fails closed when a migration is declared incompatible', () => {
    const directory = writeMigration(`deployment: {
          previousReleaseCompatible: false,
          rationale: 'Drops a column still read by the immediately previous release.'
        },`);
    temporaryDirectories.push(directory);

    let caughtError;
    try {
      checkRollbackCompatibility({ migrationDirectory: directory });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toMatchObject({
      code: 'ROLLBACK_INCOMPATIBLE_MIGRATION',
      message: expect.stringMatching(/202607190099.*drops a column/i),
    });
  });

  it('returns non-zero CLI status for missing and incompatible assessments', () => {
    const validDirectory = writeMigration(`deployment: {
          previousReleaseCompatible: true,
          rationale: 'The new table is additive and ignored by the immediately previous release.'
        },`);
    const missingDirectory = writeMigration('');
    const incompatibleDirectory = writeMigration(`deployment: {
          previousReleaseCompatible: false,
          rationale: 'Drops a column still read by the immediately previous release.'
        },`);
    temporaryDirectories.push(validDirectory, missingDirectory, incompatibleDirectory);
    const script = path.join(__dirname, '..', 'scripts', 'checkMigrationRollbackCompatibility.js');
    const run = (directory: string) => spawnSync(
      process.execPath,
      [script, directory],
      { encoding: 'utf8' }
    );

    const valid = run(validDirectory);
    const missing = run(missingDirectory);
    const incompatible = run(incompatibleDirectory);

    expect({
      validStatus: valid.status,
      missingStatus: missing.status,
      missingError: missing.stderr,
      incompatibleStatus: incompatible.status,
      incompatibleError: incompatible.stderr,
    }).toMatchObject({
      validStatus: 0,
      missingStatus: 1,
      missingError: expect.stringMatching(/INVALID_MIGRATION/),
      incompatibleStatus: 1,
      incompatibleError: expect.stringMatching(/ROLLBACK_INCOMPATIBLE_MIGRATION/),
    });
  });
});
