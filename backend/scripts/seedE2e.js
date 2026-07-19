require('dotenv').config();

const { closeDatabase, getDatabase } = require('../db/adapter');
const bcrypt = require('bcryptjs');

async function seedE2e() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('The E2E seed is restricted to NODE_ENV=test');
  }

  const db = getDatabase();
  await db.run(
    `INSERT INTO bearings
      (name, model, price, image, category, inner_diameter, outer_diameter, width, stock, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      JSON.stringify({ zh: '深沟球轴承 6205', en: 'Deep Groove Ball Bearing 6205' }),
      '6205',
      25.5,
      '',
      '深沟球轴承',
      '25mm',
      '52mm',
      '15mm',
      100,
      JSON.stringify({ zh: 'E2E 测试轴承', en: 'E2E test bearing' }),
    ]
  );
  const customerPassword = await bcrypt.hash('customer-e2e-password-123', 10);
  await db.run(
    `INSERT INTO customers
      (name, phone, password, status, phone_verified_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['E2E Customer', '13900000001', customerPassword, 'active', Math.floor(Date.now() / 1000)]
  );
}

seedE2e().then(closeDatabase).catch(async (error) => {
  console.error(error.message);
  await closeDatabase();
  process.exitCode = 1;
});
