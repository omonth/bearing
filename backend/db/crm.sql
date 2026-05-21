-- CRM客户管理系统数据库表 (PostgreSQL)

-- 1. 客户表
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255),
    company VARCHAR(255),
    address TEXT,
    level VARCHAR(20) DEFAULT 'bronze',
    points INTEGER DEFAULT 0,
    total_spent DECIMAL(10, 2) DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    tags TEXT,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_level ON customers(level);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);

-- 2. 客户等级配置表
CREATE TABLE IF NOT EXISTS customer_levels (
    id SERIAL PRIMARY KEY,
    level VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL,
    min_points INTEGER NOT NULL,
    discount_rate DECIMAL(5, 2) DEFAULT 0,
    benefits TEXT,
    color VARCHAR(20)
);

-- 插入默认等级
INSERT INTO customer_levels (level, name, min_points, discount_rate, benefits, color)
VALUES
    ('bronze', '青铜会员', 0, 0, '基础服务', '#CD7F32'),
    ('silver', '白银会员', 1000, 5, '5%折扣,优先发货', '#C0C0C0'),
    ('gold', '黄金会员', 5000, 10, '10%折扣,专属客服', '#FFD700'),
    ('platinum', '铂金会员', 10000, 15, '15%折扣,免运费', '#E5E4E2'),
    ('diamond', '钻石会员', 50000, 20, '20%折扣,定制服务', '#B9F2FF')
ON CONFLICT DO NOTHING;

-- 3. 积分记录表
CREATE TABLE IF NOT EXISTS points_records (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    points INTEGER NOT NULL,
    type VARCHAR(20) NOT NULL,
    reason VARCHAR(255),
    order_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_points_customer ON points_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_points_date ON points_records(created_at);

-- 4. 优惠券表
CREATE TABLE IF NOT EXISTS coupons (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL,
    discount_value DECIMAL(10, 2) NOT NULL,
    min_order_amount DECIMAL(10, 2) DEFAULT 0,
    max_discount DECIMAL(10, 2),
    total_quantity INTEGER,
    used_quantity INTEGER DEFAULT 0,
    valid_from TIMESTAMP,
    valid_until TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_status ON coupons(status);

-- 5. 客户优惠券关联表
CREATE TABLE IF NOT EXISTS customer_coupons (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    coupon_id INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'unused',
    used_at TIMESTAMP,
    order_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_coupons_customer ON customer_coupons(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_coupons_status ON customer_coupons(status);

-- 6. 客户标签表
CREATE TABLE IF NOT EXISTS customer_tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    color VARCHAR(20),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入默认标签
INSERT INTO customer_tags (name, color, description)
VALUES
    ('VIP', '#FF0000', '重要客户'),
    ('新客户', '#00FF00', '新注册客户'),
    ('活跃', '#0000FF', '经常购买'),
    ('沉睡', '#808080', '长期未购买'),
    ('高价值', '#FFD700', '消费金额高')
ON CONFLICT DO NOTHING;

-- 7. 客户互动记录表
CREATE TABLE IF NOT EXISTS customer_interactions (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    type VARCHAR(20) NOT NULL,
    content TEXT,
    operator VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_interactions_customer ON customer_interactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_interactions_date ON customer_interactions(created_at);

-- 8. 客户反馈表
CREATE TABLE IF NOT EXISTS customer_feedback (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    order_id INTEGER,
    rating INTEGER,
    content TEXT,
    reply TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    replied_at TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feedback_customer ON customer_feedback(customer_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON customer_feedback(status);
