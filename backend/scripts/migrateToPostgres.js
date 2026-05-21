const sqlite3 = require('sqlite3').verbose();
const { pool } = require('../db/postgres');
const bcrypt = require('bcryptjs');
const path = require('path');

// SQLite数据库路径
const sqliteDbPath = path.join(__dirname, '../bearings.db');
const sqliteDb = new sqlite3.Database(sqliteDbPath);

// 迁移函数
async function migrateData() {
  console.log('🚀 开始数据迁移：SQLite → PostgreSQL');
  console.log('');

  try {
    // 1. 迁移轴承产品数据
    console.log('1️⃣  迁移轴承产品数据...');
    const bearings = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM bearings', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    for (const bearing of bearings) {
      await pool.query(`
        INSERT INTO bearings (
          name, model, price, image, category,
          inner_diameter, outer_diameter, width, stock, description,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT DO NOTHING
      `, [
        bearing.name,
        bearing.model,
        bearing.price,
        bearing.image,
        bearing.category,
        bearing.inner_diameter,
        bearing.outer_diameter,
        bearing.width,
        bearing.stock,
        bearing.description,
        bearing.created_at || new Date(),
        bearing.updated_at || new Date()
      ]);
    }
    console.log(`✅ 迁移了 ${bearings.length} 个产品`);
    console.log('');

    // 2. 迁移订单数据
    console.log('2️⃣  迁移订单数据...');
    const orders = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM orders', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const orderIdMap = new Map(); // SQLite ID -> PostgreSQL ID 映射

    for (const order of orders) {
      const result = await pool.query(`
        INSERT INTO orders (
          customer_name, customer_phone, customer_address,
          total_price, status, tracking_number,
          shipped_at, completed_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [
        order.customer_name,
        order.customer_phone,
        order.customer_address,
        order.total_price,
        order.status || 'pending',
        order.tracking_number,
        order.shipped_at,
        order.completed_at,
        order.created_at || new Date()
      ]);

      orderIdMap.set(order.id, result.rows[0].id);
    }
    console.log(`✅ 迁移了 ${orders.length} 个订单`);
    console.log('');

    // 3. 迁移订单项数据
    console.log('3️⃣  迁移订单项数据...');
    const orderItems = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM order_items', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    for (const item of orderItems) {
      const newOrderId = orderIdMap.get(item.order_id);
      if (newOrderId) {
        await pool.query(`
          INSERT INTO order_items (order_id, bearing_id, quantity, price)
          VALUES ($1, $2, $3, $4)
        `, [newOrderId, item.bearing_id, item.quantity, item.price]);
      }
    }
    console.log(`✅ 迁移了 ${orderItems.length} 个订单项`);
    console.log('');

    // 4. 迁移管理员数据
    console.log('4️⃣  迁移管理员数据...');
    const admins = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM admins', [], (err, rows) => {
        if (err) {
          // 如果表不存在，创建默认管理员
          resolve([]);
        } else {
          resolve(rows);
        }
      });
    });

    if (admins.length === 0) {
      // 创建默认管理员
      const defaultPassword = await bcrypt.hash('admin123', 10);
      await pool.query(`
        INSERT INTO admins (username, password, email, role)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (username) DO NOTHING
      `, ['admin', defaultPassword, 'admin@bearing-sales.com', 'admin']);
      console.log('✅ 创建了默认管理员账号');
    } else {
      for (const admin of admins) {
        await pool.query(`
          INSERT INTO admins (username, password, email, role, created_at, last_login)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (username) DO NOTHING
        `, [
          admin.username,
          admin.password,
          admin.email,
          admin.role || 'admin',
          admin.created_at || new Date(),
          admin.last_login
        ]);
      }
      console.log(`✅ 迁移了 ${admins.length} 个管理员账号`);
    }
    console.log('');

    // 5. 迁移订单状态历史（如果存在）
    console.log('5️⃣  迁移订单状态历史...');
    const statusHistory = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM order_status_history', [], (err, rows) => {
        if (err) {
          resolve([]);
        } else {
          resolve(rows);
        }
      });
    });

    for (const history of statusHistory) {
      const newOrderId = orderIdMap.get(history.order_id);
      if (newOrderId) {
        await pool.query(`
          INSERT INTO order_status_history (order_id, old_status, new_status, note, created_at)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          newOrderId,
          history.old_status,
          history.new_status,
          history.note,
          history.created_at || new Date()
        ]);
      }
    }
    console.log(`✅ 迁移了 ${statusHistory.length} 条状态历史`);
    console.log('');

    // 6. 更新序列
    console.log('6️⃣  更新PostgreSQL序列...');
    await pool.query(`
      SELECT setval('bearings_id_seq', (SELECT MAX(id) FROM bearings));
      SELECT setval('orders_id_seq', (SELECT MAX(id) FROM orders));
      SELECT setval('order_items_id_seq', (SELECT MAX(id) FROM order_items));
      SELECT setval('admins_id_seq', (SELECT MAX(id) FROM admins));
    `);
    console.log('✅ 序列更新完成');
    console.log('');

    console.log('🎉 数据迁移完成！');
    console.log('');
    console.log('📊 迁移统计:');
    console.log(`  - 产品: ${bearings.length}`);
    console.log(`  - 订单: ${orders.length}`);
    console.log(`  - 订单项: ${orderItems.length}`);
    console.log(`  - 管理员: ${admins.length || 1}`);
    console.log(`  - 状态历史: ${statusHistory.length}`);
    console.log('');
    console.log('✅ 可以开始使用PostgreSQL数据库了！');

  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    throw error;
  } finally {
    sqliteDb.close();
    await pool.end();
  }
}

// 执行迁移
if (require.main === module) {
  migrateData()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { migrateData };
