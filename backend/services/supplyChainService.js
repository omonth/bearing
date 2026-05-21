const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../logger');

const dbPath = path.join(__dirname, '../bearings.db');
const db = new sqlite3.Database(dbPath);

// ==================== 供应商管理 ====================

// 获取所有供应商
async function getAllSuppliers(status = null) {
  return new Promise((resolve, reject) => {
    let query = 'SELECT * FROM suppliers';
    const params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY rating DESC, name ASC';

    db.all(query, params, (err, rows) => {
      if (err) {
        logger.error('获取供应商列表失败', { error: err.message });
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// 创建供应商
async function createSupplier(supplierData) {
  return new Promise((resolve, reject) => {
    const { name, contactPerson, phone, email, address, bankAccount, taxId, rating, notes } = supplierData;

    db.run(
      `INSERT INTO suppliers (name, contact_person, phone, email, address, bank_account, tax_id, rating, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, contactPerson, phone, email, address, bankAccount, taxId, rating || 5, notes],
      function(err) {
        if (err) {
          logger.error('创建供应商失败', { error: err.message });
          reject(err);
        } else {
          logger.info('供应商已创建', { id: this.lastID, name });
          resolve({ id: this.lastID });
        }
      }
    );
  });
}

// 更新供应商
async function updateSupplier(id, supplierData) {
  return new Promise((resolve, reject) => {
    const { name, contactPerson, phone, email, address, bankAccount, taxId, rating, status, notes } = supplierData;

    db.run(
      `UPDATE suppliers
       SET name = ?, contact_person = ?, phone = ?, email = ?, address = ?,
           bank_account = ?, tax_id = ?, rating = ?, status = ?, notes = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, contactPerson, phone, email, address, bankAccount, taxId, rating, status, notes, id],
      function(err) {
        if (err) {
          logger.error('更新供应商失败', { error: err.message });
          reject(err);
        } else {
          logger.info('供应商已更新', { id });
          resolve({ changes: this.changes });
        }
      }
    );
  });
}

// ==================== 采购订单管理 ====================

// 创建采购订单
async function createPurchaseOrder(orderData) {
  return new Promise((resolve, reject) => {
    const { orderNumber, supplierId, items, expectedDate, notes, createdBy } = orderData;

    // 计算总金额
    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      // 创建采购订单
      db.run(
        `INSERT INTO purchase_orders (order_number, supplier_id, total_amount, expected_date, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderNumber, supplierId, totalAmount, expectedDate, notes, createdBy],
        function(err) {
          if (err) {
            db.run('ROLLBACK');
            logger.error('创建采购订单失败', { error: err.message });
            reject(err);
            return;
          }

          const purchaseOrderId = this.lastID;

          // 插入订单明细
          const stmt = db.prepare(
            `INSERT INTO purchase_order_items (purchase_order_id, bearing_id, quantity, unit_price)
             VALUES (?, ?, ?, ?)`
          );

          items.forEach(item => {
            stmt.run(purchaseOrderId, item.bearingId, item.quantity, item.unitPrice);
          });

          stmt.finalize((err) => {
            if (err) {
              db.run('ROLLBACK');
              logger.error('插入采购订单明细失败', { error: err.message });
              reject(err);
            } else {
              db.run('COMMIT');
              logger.info('采购订单已创建', { id: purchaseOrderId, orderNumber });
              resolve({ id: purchaseOrderId, totalAmount });
            }
          });
        }
      );
    });
  });
}

// 获取采购订单列表
async function getPurchaseOrders(status = null) {
  return new Promise((resolve, reject) => {
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

    db.all(query, params, (err, rows) => {
      if (err) {
        logger.error('获取采购订单列表失败', { error: err.message });
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// 获取采购订单详情
async function getPurchaseOrderDetails(id) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT po.*, s.name as supplier_name, s.contact_person, s.phone
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id
       WHERE po.id = ?`,
      [id],
      (err, order) => {
        if (err) {
          logger.error('获取采购订单详情失败', { error: err.message });
          reject(err);
          return;
        }

        if (!order) {
          resolve(null);
          return;
        }

        // 获取订单明细
        db.all(
          `SELECT poi.*, b.name, b.model
           FROM purchase_order_items poi
           JOIN bearings b ON poi.bearing_id = b.id
           WHERE poi.purchase_order_id = ?`,
          [id],
          (err, items) => {
            if (err) {
              logger.error('获取采购订单明细失败', { error: err.message });
              reject(err);
            } else {
              resolve({ ...order, items });
            }
          }
        );
      }
    );
  });
}

// 更新采购订单状态
async function updatePurchaseOrderStatus(id, status, receivedDate = null) {
  return new Promise((resolve, reject) => {
    let query = 'UPDATE purchase_orders SET status = ?';
    const params = [status];

    if (receivedDate && status === 'received') {
      query += ', received_date = ?';
      params.push(receivedDate);
    }

    query += ' WHERE id = ?';
    params.push(id);

    db.run(query, params, function(err) {
      if (err) {
        logger.error('更新采购订单状态失败', { error: err.message });
        reject(err);
      } else {
        logger.info('采购订单状态已更新', { id, status });
        resolve({ changes: this.changes });
      }
    });
  });
}

// ==================== 入库管理 ====================

// 创建入库记录
async function createStockInRecord(recordData) {
  return new Promise((resolve, reject) => {
    const { purchaseOrderId, bearingId, quantity, unitCost, batchNumber, warehouseLocation, operator, notes } = recordData;

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      // 插入入库记录
      db.run(
        `INSERT INTO stock_in_records (purchase_order_id, bearing_id, quantity, unit_cost, batch_number, warehouse_location, operator, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [purchaseOrderId, bearingId, quantity, unitCost, batchNumber, warehouseLocation, operator, notes],
        function(err) {
          if (err) {
            db.run('ROLLBACK');
            logger.error('创建入库记录失败', { error: err.message });
            reject(err);
            return;
          }

          const recordId = this.lastID;

          // 更新产品库存
          db.run(
            'UPDATE bearings SET stock = stock + ? WHERE id = ?',
            [quantity, bearingId],
            (err) => {
              if (err) {
                db.run('ROLLBACK');
                logger.error('更新库存失败', { error: err.message });
                reject(err);
                return;
              }

              // 更新采购订单明细的已收货数量
              if (purchaseOrderId) {
                db.run(
                  'UPDATE purchase_order_items SET received_quantity = received_quantity + ? WHERE purchase_order_id = ? AND bearing_id = ?',
                  [quantity, purchaseOrderId, bearingId],
                  (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      logger.error('更新已收货数量失败', { error: err.message });
                      reject(err);
                    } else {
                      // 记录库存成本
                      db.run(
                        `INSERT INTO inventory_costs (bearing_id, batch_number, quantity, unit_cost, remaining_quantity, purchase_date)
                         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                        [bearingId, batchNumber, quantity, unitCost, quantity],
                        (err) => {
                          if (err) {
                            db.run('ROLLBACK');
                            logger.error('记录库存成本失败', { error: err.message });
                            reject(err);
                          } else {
                            db.run('COMMIT');
                            logger.info('入库记录已创建', { id: recordId, bearingId, quantity });
                            resolve({ id: recordId });
                          }
                        }
                      );
                    }
                  }
                );
              } else {
                db.run('COMMIT');
                logger.info('入库记录已创建', { id: recordId, bearingId, quantity });
                resolve({ id: recordId });
              }
            }
          );
        }
      );
    });
  });
}

// 获取入库记录
async function getStockInRecords(startDate = null, endDate = null) {
  return new Promise((resolve, reject) => {
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

    db.all(query, params, (err, rows) => {
      if (err) {
        logger.error('获取入库记录失败', { error: err.message });
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// ==================== 出库管理 ====================

// 创建出库记录
async function createStockOutRecord(recordData) {
  return new Promise((resolve, reject) => {
    const { orderId, bearingId, quantity, batchNumber, operator, notes } = recordData;

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      // 获取成本（FIFO - 先进先出）
      db.get(
        `SELECT unit_cost FROM inventory_costs
         WHERE bearing_id = ? AND remaining_quantity > 0
         ORDER BY purchase_date ASC
         LIMIT 1`,
        [bearingId],
        (err, cost) => {
          if (err) {
            db.run('ROLLBACK');
            logger.error('获取成本失败', { error: err.message });
            reject(err);
            return;
          }

          const unitCost = cost ? cost.unit_cost : 0;

          // 插入出库记录
          db.run(
            `INSERT INTO stock_out_records (order_id, bearing_id, quantity, unit_cost, batch_number, operator, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [orderId, bearingId, quantity, unitCost, batchNumber, operator, notes],
            function(err) {
              if (err) {
                db.run('ROLLBACK');
                logger.error('创建出库记录失败', { error: err.message });
                reject(err);
                return;
              }

              const recordId = this.lastID;

              // 更新产品库存
              db.run(
                'UPDATE bearings SET stock = stock - ? WHERE id = ?',
                [quantity, bearingId],
                (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    logger.error('更新库存失败', { error: err.message });
                    reject(err);
                  } else {
                    // 更新库存成本（FIFO）
                    updateInventoryCostsFIFO(bearingId, quantity, (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        reject(err);
                      } else {
                        db.run('COMMIT');
                        logger.info('出库记录已创建', { id: recordId, bearingId, quantity });
                        resolve({ id: recordId, unitCost });
                      }
                    });
                  }
                }
              );
            }
          );
        }
      );
    });
  });
}

// 更新库存成本（FIFO）
function updateInventoryCostsFIFO(bearingId, quantity, callback) {
  let remainingQty = quantity;

  const updateNext = () => {
    if (remainingQty <= 0) {
      callback(null);
      return;
    }

    db.get(
      `SELECT id, remaining_quantity FROM inventory_costs
       WHERE bearing_id = ? AND remaining_quantity > 0
       ORDER BY purchase_date ASC
       LIMIT 1`,
      [bearingId],
      (err, row) => {
        if (err) {
          callback(err);
          return;
        }

        if (!row) {
          callback(null);
          return;
        }

        const deductQty = Math.min(remainingQty, row.remaining_quantity);

        db.run(
          'UPDATE inventory_costs SET remaining_quantity = remaining_quantity - ? WHERE id = ?',
          [deductQty, row.id],
          (err) => {
            if (err) {
              callback(err);
            } else {
              remainingQty -= deductQty;
              updateNext();
            }
          }
        );
      }
    );
  };

  updateNext();
}

// 获取出库记录
async function getStockOutRecords(startDate = null, endDate = null) {
  return new Promise((resolve, reject) => {
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

    db.all(query, params, (err, rows) => {
      if (err) {
        logger.error('获取出库记录失败', { error: err.message });
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// ==================== 成本核算 ====================

// 获取产品成本
async function getProductCost(bearingId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM inventory_costs
       WHERE bearing_id = ? AND remaining_quantity > 0
       ORDER BY purchase_date ASC`,
      [bearingId],
      (err, rows) => {
        if (err) {
          logger.error('获取产品成本失败', { error: err.message });
          reject(err);
        } else {
          const totalQuantity = rows.reduce((sum, row) => sum + row.remaining_quantity, 0);
          const totalCost = rows.reduce((sum, row) => sum + (row.remaining_quantity * row.unit_cost), 0);
          const avgCost = totalQuantity > 0 ? totalCost / totalQuantity : 0;

          resolve({
            bearingId,
            totalQuantity,
            totalCost,
            avgCost,
            batches: rows
          });
        }
      }
    );
  });
}

// 获取利润分析
async function getProfitAnalysis(startDate, endDate) {
  return new Promise((resolve, reject) => {
    db.all(
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
      [startDate, endDate],
      (err, rows) => {
        if (err) {
          logger.error('获取利润分析失败', { error: err.message });
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

module.exports = {
  // 供应商
  getAllSuppliers,
  createSupplier,
  updateSupplier,
  // 采购订单
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrderDetails,
  updatePurchaseOrderStatus,
  // 入库
  createStockInRecord,
  getStockInRecords,
  // 出库
  createStockOutRecord,
  getStockOutRecords,
  // 成本
  getProductCost,
  getProfitAnalysis
};
