-- 供应链管理数据库表 (PostgreSQL)

-- 1. 供应商表
CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    bank_account VARCHAR(100),
    tax_id VARCHAR(50),
    rating INTEGER DEFAULT 5,
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
CREATE INDEX IF NOT EXISTS idx_suppliers_rating ON suppliers(rating);

-- 2. 采购订单表
CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_id INTEGER NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expected_date TIMESTAMP,
    received_date TIMESTAMP,
    notes TEXT,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_date ON purchase_orders(order_date);

-- 3. 采购订单明细表
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id SERIAL PRIMARY KEY,
    purchase_order_id INTEGER NOT NULL,
    bearing_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    received_quantity INTEGER DEFAULT 0,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (bearing_id) REFERENCES bearings(id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_bearing ON purchase_order_items(bearing_id);

-- 4. 入库记录表
CREATE TABLE IF NOT EXISTS stock_in_records (
    id SERIAL PRIMARY KEY,
    purchase_order_id INTEGER,
    bearing_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(10, 2) NOT NULL,
    batch_number VARCHAR(50),
    warehouse_location VARCHAR(100),
    operator VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
    FOREIGN KEY (bearing_id) REFERENCES bearings(id)
);

CREATE INDEX IF NOT EXISTS idx_stock_in_bearing ON stock_in_records(bearing_id);
CREATE INDEX IF NOT EXISTS idx_stock_in_date ON stock_in_records(created_at);

-- 5. 出库记录表
CREATE TABLE IF NOT EXISTS stock_out_records (
    id SERIAL PRIMARY KEY,
    order_id INTEGER,
    bearing_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(10, 2),
    batch_number VARCHAR(50),
    operator VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (bearing_id) REFERENCES bearings(id)
);

CREATE INDEX IF NOT EXISTS idx_stock_out_bearing ON stock_out_records(bearing_id);
CREATE INDEX IF NOT EXISTS idx_stock_out_order ON stock_out_records(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_out_date ON stock_out_records(created_at);

-- 6. 库存成本表（用于成本核算）
CREATE TABLE IF NOT EXISTS inventory_costs (
    id SERIAL PRIMARY KEY,
    bearing_id INTEGER NOT NULL,
    batch_number VARCHAR(50),
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(10, 2) NOT NULL,
    remaining_quantity INTEGER NOT NULL,
    purchase_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bearing_id) REFERENCES bearings(id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_costs_bearing ON inventory_costs(bearing_id);
CREATE INDEX IF NOT EXISTS idx_inventory_costs_batch ON inventory_costs(batch_number);

-- 7. 供应商产品关联表
CREATE TABLE IF NOT EXISTS supplier_products (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER NOT NULL,
    bearing_id INTEGER NOT NULL,
    supplier_price DECIMAL(10, 2),
    lead_time_days INTEGER,
    min_order_quantity INTEGER,
    is_preferred BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
    FOREIGN KEY (bearing_id) REFERENCES bearings(id) ON DELETE CASCADE,
    UNIQUE(supplier_id, bearing_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_products_supplier ON supplier_products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_products_bearing ON supplier_products(bearing_id);

-- 插入示例供应商数据
INSERT INTO suppliers (name, contact_person, phone, email, address, rating, status)
VALUES
    ('深圳轴承供应商', '张经理', '13800138001', 'zhang@supplier1.com', '深圳市南山区科技园', 5, 'active'),
    ('上海精密轴承厂', '李经理', '13800138002', 'li@supplier2.com', '上海市浦东新区', 4, 'active'),
    ('北京工业轴承公司', '王经理', '13800138003', 'wang@supplier3.com', '北京市朝阳区', 5, 'active')
ON CONFLICT DO NOTHING;
