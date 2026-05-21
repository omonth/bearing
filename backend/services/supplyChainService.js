const { getDatabase } = require('../db/adapter');
const logger = require('../logger');

// ==================== 供应商管理 ====================

async function getAllSuppliers(status = null) {
  const db = getDatabase();
  let query = 'SELECT * FROM suppliers';
  const params = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY rating DESC, name ASC';
  return await db.all(query, params);
}

async function createSupplier(supplierData) {
  const db = getDatabase();
  const { name, contactPerson, phone, email, address, bankAccount, taxId, rating, notes } = supplierData;

  const result = await db.run(
    `INSERT INTO suppliers (name, contact_person, phone, email, address, bank_account, tax_id, rating, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, contactPerson, phone, email, address, bankAccount, taxId, rating || 5, notes]
  );

  logger.info('供应商已创建', { id: result.lastID, name });
  return { id: result.lastID };
}

async function updateSupplier(id, supplierData) {
  const db = getDatabase();
  const { name, contactPerson, phone, email, address, bankAccount, taxId, rating, status, notes } = supplierData;

  const result = await db.run(
    `UPDATE suppliers
     SET name = ?, contact_person = ?, phone = ?, email = ?, address = ?,
         bank_account = ?, tax_id = ?, rating = ?, status = ?, notes = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [name, contactPerson, phone, email, address, bankAccount, taxId, rating, status, notes, id]
  );

  logger.info('供应商已更新', { id });
  return { changes: result.changes };
}

// ==================== 采购订单管理 ====================

async function createPurchaseOrder(orderData) {
  const db = getDatabase();
  const { orderNumber, supplierId, items, expectedDate, notes, createdBy } = orderData;
  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

  const result = await db.transaction(async (tx) => {
    const orderResult = await tx.run(
      `INSERT INTO purchase_orders (order_number, supplier_id, total_amount, expected_date, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [orderNumber, supplierId, totalAmount, expectedDate, notes, createdBy]
    );

    const purchaseOrderId = orderResult.lastID;

    for (const item of items) {
      await tx.run(
        `INSERT INTO purchase_order_items (purchase_order_id, bearing_id, quantity, unit_price)
         VALUES (?, ?, ?, ?)`,
        [purchaseOrderId, item.bearingId, item.quantity, item.unitPrice]
      );
    }

    return { id: purchaseOrderId, totalAmount };
  });

  logger.info('采购订单已创建', { id: result.id, orderNumber });
  return result;
}

async function getPurchaseOrders(status = null) {
  const db = getDatabase();
  let query = `
    SELECT po.*, s.name as supplier_name
    FROM purchase_orders po
    JOIN suppliers s ON po.supplier_id = s.id
  `;
  const params = [];

  if (status) {
    query += ' WHERE po.status = ?';
    params.push(status);
  }

  query += ' ORDER BY po.order_date DESC';
  return await db.all(query, params);
}

async function getPurchaseOrderDetails(id) {
  const db = getDatabase();

  const order = await db.get(
    `SELECT po.*, s.name as supplier_name, s.contact_person, s.phone
     FROM purchase_orders po
     JOIN suppliers s ON po.supplier_id = s.id
     WHERE po.id = ?`,
    [id]
  );

  if (!order) return null;

  const items = await db.all(
    `SELECT poi.*, b.name, b.model
     FROM purchase_order_items poi
     JOIN bearings b ON poi.bearing_id = b.id
     WHERE poi.purchase_order_id = ?`,
    [id]
  );

  return { ...order, items };
}

async function updatePurchaseOrderStatus(id, status, receivedDate = null) {
  const db = getDatabase();
  let query = 'UPDATE purchase_orders SET status = ?';
  const params = [status];

  if (receivedDate && status === 'received') {
    query += ', received_date = ?';
    params.push(receivedDate);
  }

  query += ' WHERE id = ?';
  params.push(id);

  const result = await db.run(query, params);
  logger.info('采购订单状态已更新', { id, status });
  return { changes: result.changes };
}

// ==================== 入库管理 ====================

async function createStockInRecord(recordData) {
  const db = getDatabase();
  const { purchaseOrderId, bearingId, quantity, unitCost, batchNumber, warehouseLocation, operator, notes } = recordData;

  const result = await db.transaction(async (tx) => {
    const recordResult = await tx.run(
      `INSERT INTO stock_in_records (purchase_order_id, bearing_id, quantity, unit_cost, batch_number, warehouse_location, operator, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [purchaseOrderId, bearingId, quantity, unitCost, batchNumber, warehouseLocation, operator, notes]
    );

    await tx.run(
      'UPDATE bearings SET stock = stock + ? WHERE id = ?',
      [quantity, bearingId]
    );

    if (purchaseOrderId) {
      await tx.run(
        'UPDATE purchase_order_items SET received_quantity = received_quantity + ? WHERE purchase_order_id = ? AND bearing_id = ?',
        [quantity, purchaseOrderId, bearingId]
      );

      await tx.run(
        `INSERT INTO inventory_costs (bearing_id, batch_number, quantity, unit_cost, remaining_quantity, purchase_date)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [bearingId, batchNumber, quantity, unitCost, quantity]
      );
    }

    return { id: recordResult.lastID };
  });

  logger.info('入库记录已创建', { id: result.id, bearingId, quantity });
  return result;
}

async function getStockInRecords(startDate = null, endDate = null) {
  const db = getDatabase();
  let query = `
    SELECT sir.*, b.name, b.model, po.order_number
    FROM stock_in_records sir
    JOIN bearings b ON sir.bearing_id = b.id
    LEFT JOIN purchase_orders po ON sir.purchase_order_id = po.id
    WHERE 1=1
  `;
  const params = [];

  if (startDate) {
    query += ' AND sir.created_at >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND sir.created_at <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY sir.created_at DESC';
  return await db.all(query, params);
}

// ==================== 出库管理 ====================

async function createStockOutRecord(recordData) {
  const db = getDatabase();
  const { orderId, bearingId, quantity, batchNumber, operator, notes } = recordData;

  const result = await db.transaction(async (tx) => {
    const cost = await tx.get(
      `SELECT unit_cost FROM inventory_costs
       WHERE bearing_id = ? AND remaining_quantity > 0
       ORDER BY purchase_date ASC
       LIMIT 1`,
      [bearingId]
    );

    const unitCost = cost ? cost.unit_cost : 0;

    const recordResult = await tx.run(
      `INSERT INTO stock_out_records (order_id, bearing_id, quantity, unit_cost, batch_number, operator, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [orderId, bearingId, quantity, unitCost, batchNumber, operator, notes]
    );

    await tx.run(
      'UPDATE bearings SET stock = stock - ? WHERE id = ?',
      [quantity, bearingId]
    );

    // FIFO成本扣减
    let remainingQty = quantity;
    while (remainingQty > 0) {
      const costRow = await tx.get(
        `SELECT id, remaining_quantity FROM inventory_costs
         WHERE bearing_id = ? AND remaining_quantity > 0
         ORDER BY purchase_date ASC
         LIMIT 1`,
        [bearingId]
      );

      if (!costRow) break;

      const deductQty = Math.min(remainingQty, costRow.remaining_quantity);
      await tx.run(
        'UPDATE inventory_costs SET remaining_quantity = remaining_quantity - ? WHERE id = ?',
        [deductQty, costRow.id]
      );
      remainingQty -= deductQty;
    }

    return { id: recordResult.lastID, unitCost };
  });

  logger.info('出库记录已创建', { id: result.id, bearingId, quantity });
  return result;
}

async function getStockOutRecords(startDate = null, endDate = null) {
  const db = getDatabase();
  let query = `
    SELECT sor.*, b.name, b.model, o.id as order_number
    FROM stock_out_records sor
    JOIN bearings b ON sor.bearing_id = b.id
    LEFT JOIN orders o ON sor.order_id = o.id
    WHERE 1=1
  `;
  const params = [];

  if (startDate) {
    query += ' AND sor.created_at >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND sor.created_at <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY sor.created_at DESC';
  return await db.all(query, params);
}

// ==================== 成本核算 ====================

async function getProductCost(bearingId) {
  const db = getDatabase();

  const rows = await db.all(
    `SELECT * FROM inventory_costs
     WHERE bearing_id = ? AND remaining_quantity > 0
     ORDER BY purchase_date ASC`,
    [bearingId]
  );

  const totalQuantity = rows.reduce((sum, row) => sum + row.remaining_quantity, 0);
  const totalCost = rows.reduce((sum, row) => sum + (row.remaining_quantity * row.unit_cost), 0);
  const avgCost = totalQuantity > 0 ? totalCost / totalQuantity : 0;

  return { bearingId, totalQuantity, totalCost, avgCost, batches: rows };
}

async function getProfitAnalysis(startDate, endDate) {
  const db = getDatabase();

  return await db.all(
    `SELECT
      sor.bearing_id,
      b.name,
      b.model,
      SUM(sor.quantity) as total_sold,
      SUM(sor.quantity * sor.unit_cost) as total_cost,
      SUM(sor.quantity * oi.price) as total_revenue,
      SUM(sor.quantity * (oi.price - sor.unit_cost)) as total_profit
     FROM stock_out_records sor
     JOIN bearings b ON sor.bearing_id = b.id
     JOIN order_items oi ON sor.order_id = oi.order_id AND sor.bearing_id = oi.bearing_id
     WHERE sor.created_at >= ? AND sor.created_at <= ?
     GROUP BY sor.bearing_id
     ORDER BY total_profit DESC`,
    [startDate, endDate]
  );
}

module.exports = {
  getAllSuppliers,
  createSupplier,
  updateSupplier,
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrderDetails,
  updatePurchaseOrderStatus,
  createStockInRecord,
  getStockInRecords,
  createStockOutRecord,
  getStockOutRecords,
  getProductCost,
  getProfitAnalysis
};
