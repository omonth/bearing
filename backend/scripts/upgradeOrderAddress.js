const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../bearings.db');
const db = new sqlite3.Database(dbPath);

console.log('开始升级订单表结构...');

db.serialize(() => {
  // 1. 创建新的订单表（带详细地址字段）
  db.run(`
    CREATE TABLE IF NOT EXISTS orders_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      province TEXT,
      city TEXT,
      district TEXT,
      address_detail TEXT,
      total_price REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      tracking_number TEXT,
      shipped_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('创建新表失败:', err.message);
      return;
    }
    console.log('✓ 新订单表创建成功');

    // 2. 迁移现有数据
    db.all('SELECT * FROM orders', [], (err, rows) => {
      if (err) {
        console.error('读取旧数据失败:', err.message);
        return;
      }

      if (rows.length === 0) {
        console.log('✓ 没有需要迁移的数据');
        finishMigration();
        return;
      }

      console.log(`开始迁移 ${rows.length} 条订单数据...`);

      const stmt = db.prepare(`
        INSERT INTO orders_new (
          id, customer_name, customer_phone,
          province, city, district, address_detail,
          total_price, status, tracking_number,
          shipped_at, completed_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      rows.forEach((row) => {
        // 尝试解析旧地址格式
        const addressParts = parseAddress(row.customer_address);

        stmt.run(
          row.id,
          row.customer_name,
          row.customer_phone,
          addressParts.province,
          addressParts.city,
          addressParts.district,
          addressParts.detail,
          row.total_price,
          row.status,
          row.tracking_number,
          row.shipped_at,
          row.completed_at,
          row.created_at
        );
      });

      stmt.finalize((err) => {
        if (err) {
          console.error('数据迁移失败:', err.message);
          return;
        }
        console.log(`✓ 成功迁移 ${rows.length} 条订单数据`);
        finishMigration();
      });
    });
  });
});

// 解析旧地址格式
function parseAddress(oldAddress) {
  if (!oldAddress) {
    return {
      province: '',
      city: '',
      district: '',
      detail: ''
    };
  }

  // 简单的地址解析逻辑
  // 假设旧地址格式可能是："北京市朝阳区某某街道123号"
  const provinceRegex = /(.*?省|.*?市|.*?自治区|.*?特别行政区)/;
  const cityRegex = /(.*?市|.*?地区|.*?州)/;
  const districtRegex = /(.*?区|.*?县|.*?市)/;

  let remaining = oldAddress;
  let province = '';
  let city = '';
  let district = '';

  // 提取省份
  const provinceMatch = remaining.match(provinceRegex);
  if (provinceMatch) {
    province = provinceMatch[1];
    remaining = remaining.substring(province.length);
  }

  // 提取城市
  const cityMatch = remaining.match(cityRegex);
  if (cityMatch) {
    city = cityMatch[1];
    remaining = remaining.substring(city.length);
  }

  // 提取区县
  const districtMatch = remaining.match(districtRegex);
  if (districtMatch) {
    district = districtMatch[1];
    remaining = remaining.substring(district.length);
  }

  return {
    province: province || '',
    city: city || '',
    district: district || '',
    detail: remaining.trim() || oldAddress
  };
}

function finishMigration() {
  // 3. 删除旧表
  db.run('DROP TABLE IF EXISTS orders', (err) => {
    if (err) {
      console.error('删除旧表失败:', err.message);
      return;
    }
    console.log('✓ 旧订单表已删除');

    // 4. 重命名新表
    db.run('ALTER TABLE orders_new RENAME TO orders', (err) => {
      if (err) {
        console.error('重命名表失败:', err.message);
        return;
      }
      console.log('✓ 新订单表已重命名');

      // 5. 创建索引
      db.run('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)', (err) => {
        if (err) {
          console.error('创建索引失败:', err.message);
        } else {
          console.log('✓ 索引创建成功');
        }

        console.log('\n🎉 订单表结构升级完成！');
        console.log('\n新的地址字段：');
        console.log('  - province: 省份');
        console.log('  - city: 城市');
        console.log('  - district: 区/县');
        console.log('  - address_detail: 详细地址');

        db.close();
      });
    });
  });
}
