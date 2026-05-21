-- PostgreSQL 数据库初始化脚本

-- 创建数据库（需要在psql中手动执行）
-- CREATE DATABASE bearing_sales;
-- CREATE USER bearing_admin WITH PASSWORD 'your_password';
-- GRANT ALL PRIVILEGES ON DATABASE bearing_sales TO bearing_admin;

-- 连接到数据库后执行以下脚本

-- 1. 轴承产品表
CREATE TABLE IF NOT EXISTS bearings (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    model VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    image VARCHAR(500),
    category VARCHAR(100) NOT NULL,
    inner_diameter DECIMAL(10, 2),
    outer_diameter DECIMAL(10, 2),
    width DECIMAL(10, 2),
    stock INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_bearings_category ON bearings(category);
CREATE INDEX IF NOT EXISTS idx_bearings_model ON bearings(model);
CREATE INDEX IF NOT EXISTS idx_bearings_price ON bearings(price);
CREATE INDEX IF NOT EXISTS idx_bearings_stock ON bearings(stock);
CREATE INDEX IF NOT EXISTS idx_bearings_created_at ON bearings(created_at);

-- 2. 订单表
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    province VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    district VARCHAR(100),
    address_detail TEXT NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    tracking_number VARCHAR(100),
    shipped_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- 3. 订单项表
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    bearing_id INTEGER NOT NULL REFERENCES bearings(id),
    quantity INTEGER NOT NULL,
    price DECIMAL(10, 2) NOT NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_bearing_id ON order_items(bearing_id);

-- 4. 订单状态历史表
CREATE TABLE IF NOT EXISTS order_status_history (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);

-- 5. 管理员表
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    role VARCHAR(50) DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username);

-- 6. 全文搜索配置（使用PostgreSQL的全文搜索）
-- 添加全文搜索列
ALTER TABLE bearings ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 创建全文搜索索引
CREATE INDEX IF NOT EXISTS idx_bearings_search ON bearings USING GIN(search_vector);

-- 创建触发器函数来自动更新搜索向量
CREATE OR REPLACE FUNCTION bearings_search_trigger() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('simple', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(NEW.model, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(NEW.category, '')), 'B') ||
        setweight(to_tsvector('simple', COALESCE(NEW.description, '')), 'C');
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- 创建触发器
DROP TRIGGER IF EXISTS bearings_search_update ON bearings;
CREATE TRIGGER bearings_search_update
    BEFORE INSERT OR UPDATE ON bearings
    FOR EACH ROW EXECUTE FUNCTION bearings_search_trigger();

-- 更新现有数据的搜索向量
UPDATE bearings SET search_vector =
    setweight(to_tsvector('simple', COALESCE(name, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(model, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(category, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(description, '')), 'C');

-- 7. 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_bearings_updated_at ON bearings;
CREATE TRIGGER update_bearings_updated_at
    BEFORE UPDATE ON bearings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. 插入示例数据（可选）
INSERT INTO bearings (name, model, price, category, inner_diameter, outer_diameter, width, stock, image, description)
VALUES
    ('深沟球轴承', '6205', 25.50, '深沟球轴承', 25, 52, 15, 100, '/images/6205.jpg', '高品质深沟球轴承，适用于各种工业设备'),
    ('调心球轴承', '1205', 35.00, '调心球轴承', 25, 52, 15, 80, '/images/1205.jpg', '自动调心，适用于轴承座孔不能严格对中的场合'),
    ('圆柱滚子轴承', 'NU205', 45.00, '圆柱滚子轴承', 25, 52, 15, 60, '/images/NU205.jpg', '承受径向负荷能力强'),
    ('圆锥滚子轴承', '30205', 55.00, '圆锥滚子轴承', 25, 52, 15, 50, '/images/30205.jpg', '可同时承受径向和轴向负荷'),
    ('推力球轴承', '51205', 40.00, '推力球轴承', 25, 47, 15, 70, '/images/51205.jpg', '专门承受轴向负荷')
ON CONFLICT DO NOTHING;

-- 9. 创建默认管理员（密码: admin123，已用bcrypt加密）
-- 注意：这是示例密码的hash，生产环境请使用脚本生成
INSERT INTO admins (username, password, email, role)
VALUES ('admin', '$2a$10$YourBcryptHashHere', 'admin@bearing-sales.com', 'admin')
ON CONFLICT (username) DO NOTHING;

-- 10. 创建视图：产品销售统计
CREATE OR REPLACE VIEW product_sales_stats AS
SELECT
    b.id,
    b.name,
    b.model,
    b.category,
    b.price,
    b.stock,
    COALESCE(SUM(oi.quantity), 0) as total_sold,
    COALESCE(COUNT(DISTINCT o.id), 0) as order_count,
    COALESCE(SUM(oi.quantity * oi.price), 0) as total_revenue
FROM bearings b
LEFT JOIN order_items oi ON b.id = oi.bearing_id
LEFT JOIN orders o ON oi.order_id = o.id AND o.status != 'cancelled'
GROUP BY b.id, b.name, b.model, b.category, b.price, b.stock;

-- 11. 创建视图：订单统计
CREATE OR REPLACE VIEW order_stats AS
SELECT
    DATE(created_at) as order_date,
    COUNT(*) as order_count,
    SUM(total_price) as total_revenue,
    AVG(total_price) as avg_order_value
FROM orders
WHERE status != 'cancelled'
GROUP BY DATE(created_at)
ORDER BY order_date DESC;

-- 完成
SELECT 'PostgreSQL数据库初始化完成！' as message;
