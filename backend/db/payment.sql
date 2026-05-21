-- 支付订单表 (PostgreSQL)
CREATE TABLE IF NOT EXISTS payment_orders (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    payment_method VARCHAR(20) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    transaction_id VARCHAR(100),
    trade_no VARCHAR(100),
    payer_info TEXT,
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_order ON payment_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_trade_no ON payment_orders(trade_no);

-- 退款记录表
CREATE TABLE IF NOT EXISTS refund_records (
    id SERIAL PRIMARY KEY,
    payment_order_id INTEGER NOT NULL,
    refund_amount DECIMAL(10, 2) NOT NULL,
    refund_reason TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    refund_no VARCHAR(100),
    refunded_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payment_order_id) REFERENCES payment_orders(id)
);

CREATE INDEX IF NOT EXISTS idx_refund_payment_order ON refund_records(payment_order_id);
