-- 支付订单表 (PostgreSQL)
CREATE TABLE IF NOT EXISTS payment_orders (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    payment_method VARCHAR(20) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    status VARCHAR(20) DEFAULT 'pending',
    transaction_id VARCHAR(100) UNIQUE,
    trade_no VARCHAR(100),
    payer_info TEXT,
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_order ON payment_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_trade_no ON payment_orders(trade_no);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_active_order
    ON payment_orders(order_id)
    WHERE status IN ('pending', 'processing');

-- 退款记录表
CREATE TABLE IF NOT EXISTS refund_records (
    id SERIAL PRIMARY KEY,
    payment_order_id INTEGER NOT NULL,
    refund_amount DECIMAL(10, 2) NOT NULL,
    refund_reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested', 'processing', 'success', 'failed', 'manual_required')),
    refund_no VARCHAR(100) UNIQUE,
    refunded_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payment_order_id) REFERENCES payment_orders(id)
);

CREATE INDEX IF NOT EXISTS idx_refund_payment_order ON refund_records(payment_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_records_active_payment
    ON refund_records(payment_order_id)
    WHERE status IN ('requested', 'processing', 'success', 'manual_required');

CREATE TABLE IF NOT EXISTS payment_callback_events (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(20) NOT NULL,
    event_id VARCHAR(128) NOT NULL,
    event_key CHAR(64) NOT NULL,
    signature_nonce VARCHAR(128) NOT NULL,
    event_timestamp BIGINT NOT NULL,
    transaction_id VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'processing',
    processing_started_at BIGINT NOT NULL,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, event_id),
    UNIQUE(provider, event_key),
    UNIQUE(provider, signature_nonce, event_timestamp)
);

CREATE INDEX IF NOT EXISTS idx_payment_callback_transaction
    ON payment_callback_events(provider, transaction_id);
