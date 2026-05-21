const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'bearings.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS bearings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      model TEXT NOT NULL UNIQUE,
      price REAL NOT NULL,
      image TEXT,
      category TEXT NOT NULL,
      inner_diameter TEXT NOT NULL,
      outer_diameter TEXT NOT NULL,
      width TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT,
      customer_phone TEXT,
      province TEXT,
      city TEXT,
      district TEXT,
      address_detail TEXT,
      total_price REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      bearing_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (bearing_id) REFERENCES bearings(id)
    )
  `);

  const bearingsData = [
    {
      name: '深沟球轴承 6200',
      model: '6200',
      price: 15.80,
      image: 'https://via.placeholder.com/300x300/4A90E2/ffffff?text=6200',
      category: '深沟球轴承',
      inner_diameter: '10mm',
      outer_diameter: '30mm',
      width: '9mm',
      stock: 500,
      description: '适用于高速旋转，低噪音，长寿命'
    },
    {
      name: '圆锥滚子轴承 30205',
      model: '30205',
      price: 28.50,
      image: 'https://via.placeholder.com/300x300/50C878/ffffff?text=30205',
      category: '圆锥滚子轴承',
      inner_diameter: '25mm',
      outer_diameter: '52mm',
      width: '15mm',
      stock: 320,
      description: '承受径向和轴向联合载荷，适用于重载工况'
    },
    {
      name: '调心球轴承 1206',
      model: '1206',
      price: 22.00,
      image: 'https://via.placeholder.com/300x300/FF6B6B/ffffff?text=1206',
      category: '调心球轴承',
      inner_diameter: '30mm',
      outer_diameter: '62mm',
      width: '16mm',
      stock: 280,
      description: '自动调心，适应轴的挠曲和不对中'
    },
    {
      name: '圆柱滚子轴承 NU208',
      model: 'NU208',
      price: 35.60,
      image: 'https://via.placeholder.com/300x300/9B59B6/ffffff?text=NU208',
      category: '圆柱滚子轴承',
      inner_diameter: '40mm',
      outer_diameter: '80mm',
      width: '18mm',
      stock: 150,
      description: '承受大径向载荷，高转速性能优异'
    },
    {
      name: '推力球轴承 51108',
      model: '51108',
      price: 18.90,
      image: 'https://via.placeholder.com/300x300/F39C12/ffffff?text=51108',
      category: '推力球轴承',
      inner_diameter: '40mm',
      outer_diameter: '60mm',
      width: '13mm',
      stock: 420,
      description: '专门承受轴向载荷，结构紧凑'
    },
    {
      name: '角接触球轴承 7205',
      model: '7205',
      price: 32.80,
      image: 'https://via.placeholder.com/300x300/1ABC9C/ffffff?text=7205',
      category: '角接触球轴承',
      inner_diameter: '25mm',
      outer_diameter: '52mm',
      width: '15mm',
      stock: 200,
      description: '高速运转，可承受径向和单向轴向载荷'
    }
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO bearings
    (name, model, price, image, category, inner_diameter, outer_diameter, width, stock, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  bearingsData.forEach(bearing => {
    stmt.run(
      bearing.name,
      bearing.model,
      bearing.price,
      bearing.image,
      bearing.category,
      bearing.inner_diameter,
      bearing.outer_diameter,
      bearing.width,
      bearing.stock,
      bearing.description
    );
  });

  stmt.finalize();

  console.log('数据库初始化完成！');
  console.log('已创建以下表：');
  console.log('- bearings (轴承产品表)');
  console.log('- orders (订单表)');
  console.log('- order_items (订单项表)');
  console.log(`已插入 ${bearingsData.length} 条轴承数据`);
});

db.close();
