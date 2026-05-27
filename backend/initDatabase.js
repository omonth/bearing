const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.isAbsolute(process.env.DB_PATH || '')
  ? process.env.DB_PATH
  : path.join(__dirname, process.env.DB_PATH || 'bearings.db');
const db = new sqlite3.Database(dbPath);

db.serialize(async () => {
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

  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password TEXT,
      email TEXT,
      company TEXT,
      address TEXT,
      level TEXT DEFAULT 'bronze',
      points INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      total_orders INTEGER DEFAULT 0,
      tags TEXT,
      notes TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS customer_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      min_points INTEGER NOT NULL,
      discount_rate REAL DEFAULT 0,
      benefits TEXT,
      color TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS points_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      points INTEGER NOT NULL,
      type TEXT NOT NULL,
      reason TEXT,
      order_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      discount_value REAL NOT NULL,
      min_order_amount REAL DEFAULT 0,
      max_discount REAL,
      total_quantity INTEGER,
      used_quantity INTEGER DEFAULT 0,
      valid_from DATETIME,
      valid_until DATETIME,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS customer_coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      coupon_id INTEGER NOT NULL,
      status TEXT DEFAULT 'unused',
      used_at DATETIME,
      used_order_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS customer_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      color TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS customer_interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      content TEXT,
      operator TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS customer_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      order_id INTEGER,
      rating INTEGER,
      content TEXT,
      reply TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      replied_at DATETIME,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    )
  `);

  const bearingsData = [
    // ===== 深沟球轴承 (Deep Groove Ball Bearings) =====
    {name:{zh:'深沟球轴承 6200',en:'Deep Groove Ball Bearing 6200'}, model:'6200', price:6.50, category:'深沟球轴承', inner_diameter:'10mm', outer_diameter:'30mm', width:'9mm', stock:500, description:{zh:'适用于高速旋转，低噪音，长寿命',en:'Suitable for high-speed rotation, low noise, long life'}},
    {name:{zh:'深沟球轴承 6201',en:'Deep Groove Ball Bearing 6201'}, model:'6201', price:7.20, category:'深沟球轴承', inner_diameter:'12mm', outer_diameter:'32mm', width:'10mm', stock:480, description:{zh:'通用型深沟球轴承，应用广泛',en:'General purpose deep groove ball bearing, widely used'}},
    {name:{zh:'深沟球轴承 6202',en:'Deep Groove Ball Bearing 6202'}, model:'6202', price:8.00, category:'深沟球轴承', inner_diameter:'15mm', outer_diameter:'35mm', width:'11mm', stock:450, description:{zh:'小型电机常用型号',en:'Common model for small motors'}},
    {name:{zh:'深沟球轴承 6203',en:'Deep Groove Ball Bearing 6203'}, model:'6203', price:9.50, category:'深沟球轴承', inner_diameter:'17mm', outer_diameter:'40mm', width:'12mm', stock:430, description:{zh:'家电和电动工具常用',en:'Commonly used in home appliances and power tools'}},
    {name:{zh:'深沟球轴承 6204',en:'Deep Groove Ball Bearing 6204'}, model:'6204', price:11.00, category:'深沟球轴承', inner_diameter:'20mm', outer_diameter:'47mm', width:'14mm', stock:400, description:{zh:'农机和输送设备通用型号',en:'General model for agricultural machinery and conveyors'}},
    {name:{zh:'深沟球轴承 6205',en:'Deep Groove Ball Bearing 6205'}, model:'6205', price:13.50, category:'深沟球轴承', inner_diameter:'25mm', outer_diameter:'52mm', width:'15mm', stock:380, description:{zh:'工业应用最广的型号之一',en:'One of the most widely used models in industry'}},
    {name:{zh:'深沟球轴承 6206',en:'Deep Groove Ball Bearing 6206'}, model:'6206', price:16.00, category:'深沟球轴承', inner_diameter:'30mm', outer_diameter:'62mm', width:'16mm', stock:350, description:{zh:'中等载荷通用轴承',en:'Medium load general purpose bearing'}},
    {name:{zh:'深沟球轴承 6207',en:'Deep Groove Ball Bearing 6207'}, model:'6207', price:19.00, category:'深沟球轴承', inner_diameter:'35mm', outer_diameter:'72mm', width:'17mm', stock:320, description:{zh:'重载机械通用型号',en:'General model for heavy machinery'}},
    {name:{zh:'深沟球轴承 6208',en:'Deep Groove Ball Bearing 6208'}, model:'6208', price:22.50, category:'深沟球轴承', inner_diameter:'40mm', outer_diameter:'80mm', width:'18mm', stock:280, description:{zh:'工业泵和风机常用',en:'Commonly used in industrial pumps and fans'}},
    {name:{zh:'深沟球轴承 6210',en:'Deep Groove Ball Bearing 6210'}, model:'6210', price:28.00, category:'深沟球轴承', inner_diameter:'50mm', outer_diameter:'90mm', width:'20mm', stock:250, description:{zh:'大载荷深沟球轴承',en:'Heavy load deep groove ball bearing'}},
    {name:{zh:'深沟球轴承 6212',en:'Deep Groove Ball Bearing 6212'}, model:'6212', price:35.00, category:'深沟球轴承', inner_diameter:'60mm', outer_diameter:'110mm', width:'22mm', stock:200, description:{zh:'大型工业设备通用',en:'General use in large industrial equipment'}},
    // ===== 圆锥滚子轴承 (Tapered Roller Bearings) =====
    {name:{zh:'圆锥滚子轴承 30203',en:'Tapered Roller Bearing 30203'}, model:'30203', price:18.00, category:'圆锥滚子轴承', inner_diameter:'17mm', outer_diameter:'40mm', width:'13mm', stock:300, description:{zh:'汽车轮毂常用规格',en:'Common specification for automotive wheel hubs'}},
    {name:{zh:'圆锥滚子轴承 30204',en:'Tapered Roller Bearing 30204'}, model:'30204', price:22.00, category:'圆锥滚子轴承', inner_diameter:'20mm', outer_diameter:'47mm', width:'14mm', stock:280, description:{zh:'承受径向和轴向联合载荷',en:'Withstands combined radial and axial loads'}},
    {name:{zh:'圆锥滚子轴承 30205',en:'Tapered Roller Bearing 30205'}, model:'30205', price:28.50, category:'圆锥滚子轴承', inner_diameter:'25mm', outer_diameter:'52mm', width:'15mm', stock:260, description:{zh:'适用于重载工况，汽车变速箱常用',en:'Suitable for heavy load, common in automotive transmissions'}},
    {name:{zh:'圆锥滚子轴承 30206',en:'Tapered Roller Bearing 30206'}, model:'30206', price:32.00, category:'圆锥滚子轴承', inner_diameter:'30mm', outer_diameter:'62mm', width:'16mm', stock:240, description:{zh:'重型卡车和工程机械通用',en:'General use in heavy trucks and construction machinery'}},
    {name:{zh:'圆锥滚子轴承 30207',en:'Tapered Roller Bearing 30207'}, model:'30207', price:38.00, category:'圆锥滚子轴承', inner_diameter:'35mm', outer_diameter:'72mm', width:'17mm', stock:220, description:{zh:'高承载圆锥滚子轴承',en:'High load capacity tapered roller bearing'}},
    {name:{zh:'圆锥滚子轴承 30208',en:'Tapered Roller Bearing 30208'}, model:'30208', price:45.00, category:'圆锥滚子轴承', inner_diameter:'40mm', outer_diameter:'80mm', width:'18mm', stock:200, description:{zh:'矿山机械和冶金设备常用',en:'Common in mining machinery and metallurgical equipment'}},
    {name:{zh:'圆锥滚子轴承 30306',en:'Tapered Roller Bearing 30306'}, model:'30306', price:42.00, category:'圆锥滚子轴承', inner_diameter:'30mm', outer_diameter:'72mm', width:'19mm', stock:180, description:{zh:'加大宽系列，更高承载能力',en:'Wide series with higher load capacity'}},
    // ===== 圆柱滚子轴承 (Cylindrical Roller Bearings) =====
    {name:{zh:'圆柱滚子轴承 NU204',en:'Cylindrical Roller Bearing NU204'}, model:'NU204', price:28.00, category:'圆柱滚子轴承', inner_diameter:'20mm', outer_diameter:'47mm', width:'14mm', stock:200, description:{zh:'承受大径向载荷，高转速',en:'Withstands large radial loads, high speed'}},
    {name:{zh:'圆柱滚子轴承 NU205',en:'Cylindrical Roller Bearing NU205'}, model:'NU205', price:35.00, category:'圆柱滚子轴承', inner_diameter:'25mm', outer_diameter:'52mm', width:'15mm', stock:180, description:{zh:'圆柱滚子轴承高承载型',en:'High load cylindrical roller bearing'}},
    {name:{zh:'圆柱滚子轴承 NU206',en:'Cylindrical Roller Bearing NU206'}, model:'NU206', price:42.00, category:'圆柱滚子轴承', inner_diameter:'30mm', outer_diameter:'62mm', width:'16mm', stock:160, description:{zh:'电机和减速机常用型号',en:'Common model for motors and gearboxes'}},
    {name:{zh:'圆柱滚子轴承 NU207',en:'Cylindrical Roller Bearing NU207'}, model:'NU207', price:50.00, category:'圆柱滚子轴承', inner_diameter:'35mm', outer_diameter:'72mm', width:'17mm', stock:140, description:{zh:'大型电机专用轴承',en:'Specialized bearing for large motors'}},
    {name:{zh:'圆柱滚子轴承 NU208',en:'Cylindrical Roller Bearing NU208'}, model:'NU208', price:58.00, category:'圆柱滚子轴承', inner_diameter:'40mm', outer_diameter:'80mm', width:'18mm', stock:120, description:{zh:'承受大径向载荷，高转速性能优异',en:'Excellent high-speed performance under heavy radial load'}},
    {name:{zh:'圆柱滚子轴承 NU212',en:'Cylindrical Roller Bearing NU212'}, model:'NU212', price:85.00, category:'圆柱滚子轴承', inner_diameter:'60mm', outer_diameter:'110mm', width:'22mm', stock:80, description:{zh:'重型工业齿轮箱专用',en:'Specialized for heavy industrial gearboxes'}},
    // ===== 调心球轴承 (Self-aligning Ball Bearings) =====
    {name:{zh:'调心球轴承 1204',en:'Self-aligning Ball Bearing 1204'}, model:'1204', price:16.00, category:'调心球轴承', inner_diameter:'20mm', outer_diameter:'47mm', width:'14mm', stock:250, description:{zh:'自动调心，适应轴的挠曲',en:'Self-aligning, adapts to shaft deflection'}},
    {name:{zh:'调心球轴承 1205',en:'Self-aligning Ball Bearing 1205'}, model:'1205', price:20.00, category:'调心球轴承', inner_diameter:'25mm', outer_diameter:'52mm', width:'15mm', stock:230, description:{zh:'适应不对中工况',en:'Adapts to misalignment conditions'}},
    {name:{zh:'调心球轴承 1206',en:'Self-aligning Ball Bearing 1206'}, model:'1206', price:24.00, category:'调心球轴承', inner_diameter:'30mm', outer_diameter:'62mm', width:'16mm', stock:210, description:{zh:'纺织机械和风机常用',en:'Common in textile machinery and fans'}},
    {name:{zh:'调心球轴承 1207',en:'Self-aligning Ball Bearing 1207'}, model:'1207', price:28.00, category:'调心球轴承', inner_diameter:'35mm', outer_diameter:'72mm', width:'17mm', stock:190, description:{zh:'农业机械和输送设备常用',en:'Common in agricultural machinery and conveyors'}},
    {name:{zh:'调心球轴承 1210',en:'Self-aligning Ball Bearing 1210'}, model:'1210', price:38.00, category:'调心球轴承', inner_diameter:'50mm', outer_diameter:'90mm', width:'20mm', stock:150, description:{zh:'大型设备调心轴承',en:'Self-aligning bearing for large equipment'}},
    // ===== 推力球轴承 (Thrust Ball Bearings) =====
    {name:{zh:'推力球轴承 51100',en:'Thrust Ball Bearing 51100'}, model:'51100', price:12.00, category:'推力球轴承', inner_diameter:'10mm', outer_diameter:'24mm', width:'9mm', stock:350, description:{zh:'单向推力，结构紧凑',en:'Single direction thrust, compact design'}},
    {name:{zh:'推力球轴承 51104',en:'Thrust Ball Bearing 51104'}, model:'51104', price:16.00, category:'推力球轴承', inner_diameter:'20mm', outer_diameter:'35mm', width:'10mm', stock:300, description:{zh:'小型旋转设备常用',en:'Common in small rotating equipment'}},
    {name:{zh:'推力球轴承 51105',en:'Thrust Ball Bearing 51105'}, model:'51105', price:18.00, category:'推力球轴承', inner_diameter:'25mm', outer_diameter:'42mm', width:'11mm', stock:280, description:{zh:'垂直轴定位常用',en:'Common for vertical shaft positioning'}},
    {name:{zh:'推力球轴承 51108',en:'Thrust Ball Bearing 51108'}, model:'51108', price:25.00, category:'推力球轴承', inner_diameter:'40mm', outer_diameter:'60mm', width:'13mm', stock:220, description:{zh:'专门承受轴向载荷',en:'Specifically designed for axial loads'}},
    {name:{zh:'推力球轴承 51110',en:'Thrust Ball Bearing 51110'}, model:'51110', price:32.00, category:'推力球轴承', inner_diameter:'50mm', outer_diameter:'70mm', width:'14mm', stock:180, description:{zh:'机床主轴和钻床常用',en:'Common in machine tool spindles and drill presses'}},
    // ===== 角接触球轴承 (Angular Contact Ball Bearings) =====
    {name:{zh:'角接触球轴承 7204',en:'Angular Contact Ball Bearing 7204'}, model:'7204', price:22.00, category:'角接触球轴承', inner_diameter:'20mm', outer_diameter:'47mm', width:'14mm', stock:250, description:{zh:'高速运转，可承受径向和轴向载荷',en:'High speed, withstands radial and axial loads'}},
    {name:{zh:'角接触球轴承 7205',en:'Angular Contact Ball Bearing 7205'}, model:'7205', price:25.00, category:'角接触球轴承', inner_diameter:'25mm', outer_diameter:'52mm', width:'15mm', stock:230, description:{zh:'机床主轴精密轴承',en:'Precision bearing for machine tool spindles'}},
    {name:{zh:'角接触球轴承 7206',en:'Angular Contact Ball Bearing 7206'}, model:'7206', price:30.00, category:'角接触球轴承', inner_diameter:'30mm', outer_diameter:'62mm', width:'16mm', stock:210, description:{zh:'高速精密设备常用',en:'Common in high-speed precision equipment'}},
    {name:{zh:'角接触球轴承 7208',en:'Angular Contact Ball Bearing 7208'}, model:'7208', price:40.00, category:'角接触球轴承', inner_diameter:'40mm', outer_diameter:'80mm', width:'18mm', stock:170, description:{zh:'中等载荷高速主轴',en:'Medium load high-speed spindle'}},
    {name:{zh:'角接触球轴承 7210',en:'Angular Contact Ball Bearing 7210'}, model:'7210', price:55.00, category:'角接触球轴承', inner_diameter:'50mm', outer_diameter:'90mm', width:'20mm', stock:130, description:{zh:'CNC加工中心主轴常用',en:'Common in CNC machining center spindles'}},
    // ===== 滚针轴承 (Needle Roller Bearings) =====
    {name:{zh:'滚针轴承 NK20/16',en:'Needle Roller Bearing NK20/16'}, model:'NK20/16', price:28.00, category:'滚针轴承', inner_diameter:'20mm', outer_diameter:'28mm', width:'16mm', stock:200, description:{zh:'紧凑空间高承载',en:'High load capacity in compact space'}},
    {name:{zh:'滚针轴承 NK30/20',en:'Needle Roller Bearing NK30/20'}, model:'NK30/20', price:35.00, category:'滚针轴承', inner_diameter:'30mm', outer_diameter:'40mm', width:'20mm', stock:160, description:{zh:'齿轮箱和摩托车常用',en:'Common in gearboxes and motorcycles'}},
    // ===== 带座轴承 (Pillow Block Bearings) =====
    {name:{zh:'带座轴承 UCP205',en:'Pillow Block Bearing UCP205'}, model:'UCP205', price:45.00, category:'带座轴承', inner_diameter:'25mm', outer_diameter:'52mm', width:'34mm', stock:180, description:{zh:'立式轴承座单元，即装即用',en:'Vertical pillow block unit, ready to install'}},
    {name:{zh:'带座轴承 UCP208',en:'Pillow Block Bearing UCP208'}, model:'UCP208', price:68.00, category:'带座轴承', inner_diameter:'40mm', outer_diameter:'80mm', width:'43mm', stock:120, description:{zh:'输送机和搅拌设备常用',en:'Common in conveyors and mixing equipment'}},
    // ===== 关节轴承 (Spherical Plain Bearings) =====
    {name:{zh:'关节轴承 GE20ES',en:'Spherical Plain Bearing GE20ES'}, model:'GE20ES', price:52.00, category:'关节轴承', inner_diameter:'20mm', outer_diameter:'35mm', width:'16mm', stock:100, description:{zh:'低速重载摆动运动',en:'Low-speed heavy-load oscillating motion'}},
    {name:{zh:'关节轴承 GE30ES',en:'Spherical Plain Bearing GE30ES'}, model:'GE30ES', price:75.00, category:'关节轴承', inner_diameter:'30mm', outer_diameter:'47mm', width:'22mm', stock:80, description:{zh:'工程机械液压缸常用',en:'Common in construction machinery hydraulic cylinders'}},
    // ===== 直线轴承 (Linear Bearings) =====
    {name:{zh:'直线轴承 LM12UU',en:'Linear Bearing LM12UU'}, model:'LM12UU', price:15.00, category:'直线轴承', inner_diameter:'12mm', outer_diameter:'21mm', width:'30mm', stock:300, description:{zh:'3D打印机和自动化设备常用',en:'Common in 3D printers and automation equipment'}},
    {name:{zh:'直线轴承 LM20UU',en:'Linear Bearing LM20UU'}, model:'LM20UU', price:22.00, category:'直线轴承', inner_diameter:'20mm', outer_diameter:'32mm', width:'42mm', stock:250, description:{zh:'线性导轨和滑台常用',en:'Common in linear guides and slides'}},
    // ===== 外球面轴承 (Insert Bearings) =====
    {name:{zh:'外球面轴承 UC205',en:'Insert Bearing UC205'}, model:'UC205', price:32.00, category:'外球面轴承', inner_diameter:'25mm', outer_diameter:'52mm', width:'34mm', stock:200, description:{zh:'农机和输送设备，大偏心补偿',en:'Agricultural and conveyor equipment, large misalignment compensation'}},
    {name:{zh:'外球面轴承 UC207',en:'Insert Bearing UC207'}, model:'UC207', price:42.00, category:'外球面轴承', inner_diameter:'35mm', outer_diameter:'72mm', width:'43mm', stock:160, description:{zh:'农业和食品加工设备常用',en:'Common in agricultural and food processing equipment'}},
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO bearings
    (name, model, price, image, category, inner_diameter, outer_diameter, width, stock, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  bearingsData.forEach(bearing => {
    stmt.run(
      JSON.stringify(bearing.name),
      bearing.model,
      bearing.price,
      `https://via.placeholder.com/300x300/1a1a2e/4a90e2?text=${bearing.model}`,
      bearing.category,
      bearing.inner_diameter,
      bearing.outer_diameter,
      bearing.width,
      bearing.stock,
      JSON.stringify(bearing.description)
    );
  });

  stmt.finalize();

  // Create admins table and seed default admin
  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    )
  `);

  const passwordHash = await bcrypt.hash('admin123', 10);
  db.run(
    'INSERT OR IGNORE INTO admins (username, password, email, role) VALUES (?, ?, ?, ?)',
    ['admin', passwordHash, 'admin@bearing-sales.com', 'admin']
  );

  console.log('数据库初始化完成！');
  console.log('已创建以下表：');
  console.log('- admins (管理员表)');
  console.log('- bearings (轴承产品表)');
  console.log('- orders (订单表)');
  console.log('- order_items (订单项表)');
  console.log(`已插入 ${bearingsData.length} 条轴承数据`);
  console.log('默认管理员: admin / admin123');
});

db.close();
