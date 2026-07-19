const crypto = require('crypto');
const {
  BusinessError,
  ConflictError,
  NotFoundError,
  ValidationError,
} = require('../utils/errors');

const CASE_TYPES = new Set(['return_refund', 'refund_only', 'order_exception']);
const CASE_STATUSES = new Set([
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'awaiting_return',
  'received',
  'refund_processing',
  'completed',
  'cancelled',
]);
const ADMIN_TRANSITIONS = {
  submitted: new Set(['under_review', 'cancelled']),
  under_review: new Set(['approved', 'rejected', 'cancelled']),
  approved: new Set(['awaiting_return', 'completed', 'cancelled']),
  rejected: new Set(),
  awaiting_return: new Set(['received', 'cancelled']),
  received: new Set(['completed', 'cancelled']),
  refund_processing: new Set(['completed']),
  completed: new Set(),
  cancelled: new Set(),
};
const CASE_INPUT_FIELDS = new Set([
  'clientRequestId',
  'orderId',
  'type',
  'reason',
  'description',
  'requestedAmount',
]);
const REFUND_STATUSES = new Set([
  'requested',
  'processing',
  'success',
  'failed',
  'manual_required',
]);
const INVOICE_PROFILE_FIELDS = new Set([
  'titleType',
  'title',
  'taxNumber',
  'email',
  'recipientPhone',
  'registeredAddress',
  'bankName',
  'bankAccount',
  'isDefault',
]);
const INVOICE_STATUSES = new Set(['requested', 'processing', 'issued', 'rejected', 'cancelled']);
const INVOICE_TRANSITIONS = {
  requested: new Set(['processing', 'rejected', 'cancelled']),
  processing: new Set(['issued', 'rejected', 'cancelled']),
  issued: new Set(),
  rejected: new Set(),
  cancelled: new Set(),
};
const SHIPMENT_STATUSES = new Set([
  'label_created',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'exception',
  'returned',
]);
const INITIAL_SHIPMENT_STATUSES = new Set(['label_created', 'in_transit']);
const SHIPMENT_TRANSITIONS = {
  label_created: new Set(['in_transit', 'exception']),
  in_transit: new Set(['out_for_delivery', 'delivered', 'exception', 'returned']),
  out_for_delivery: new Set(['delivered', 'exception', 'returned']),
  delivered: new Set(),
  exception: new Set(['in_transit', 'out_for_delivery', 'returned']),
  returned: new Set(),
};

function normalizeCase(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    caseNo: row.case_no,
    clientRequestId: row.client_request_id,
    customerId: Number(row.customer_id),
    orderId: row.order_id === null ? null : Number(row.order_id),
    type: row.type,
    reason: row.reason,
    description: row.description,
    requestedAmount: row.requested_amount === null ? null : Number(row.requested_amount),
    status: row.status,
    version: Number(row.version),
    paymentOrderId: row.payment_order_id === null ? null : Number(row.payment_order_id),
    refundId: row.refund_id === null ? null : Number(row.refund_id),
    refundStatus: row.refund_status,
    resolutionNote: row.resolution_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeHistory(row) {
  return {
    id: Number(row.id),
    caseId: Number(row.case_id),
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actorType: row.actor_type,
    actorId: row.actor_id === null ? null : Number(row.actor_id),
    note: row.note,
    version: Number(row.version),
    createdAt: row.created_at,
  };
}

function normalizeInvoiceProfile(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    customerId: Number(row.customer_id),
    titleType: row.title_type,
    title: row.title,
    taxNumber: row.tax_number,
    email: row.email,
    recipientPhone: row.recipient_phone,
    registeredAddress: row.registered_address,
    bankName: row.bank_name,
    bankAccount: row.bank_account,
    isDefault: Boolean(row.is_default),
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeInvoiceRequest(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    customerId: Number(row.customer_id),
    orderId: Number(row.order_id),
    profileId: row.invoice_profile_id === null ? null : Number(row.invoice_profile_id),
    profileSnapshot: JSON.parse(row.profile_snapshot),
    status: row.status,
    invoiceNumber: row.invoice_number,
    resolutionNote: row.resolution_note,
    version: Number(row.version),
    issuedAt: row.issued_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeInvoiceHistory(row) {
  return {
    id: Number(row.id),
    invoiceId: Number(row.invoice_request_id),
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actorType: row.actor_type,
    actorId: Number(row.actor_id),
    note: row.note,
    version: Number(row.version),
    createdAt: row.created_at,
  };
}

function normalizeShipmentEvent(row) {
  return {
    id: Number(row.id),
    status: row.status,
    carrier: row.carrier,
    trackingNumber: row.tracking_number,
    location: row.location,
    note: row.note,
    version: Number(row.version),
    occurredAt: row.occurred_at,
  };
}

function assertPlainObject(input, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError(`${label}格式无效`);
  }
}

function assertKnownFields(input, allowedFields) {
  const unknown = Object.keys(input).filter((field) => !allowedFields.has(field));
  if (unknown.length > 0) {
    throw new ValidationError(`不允许提交字段：${unknown.join(', ')}`);
  }
}

function parsePositiveId(value, field) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`${field}无效`, field);
  }
  return parsed;
}

function parseNonNegativeVersion(value, field = 'version') {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ValidationError(`${field}无效`, field);
  }
  return parsed;
}

function optionalText(value, { field, max, min = 0 }) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ValidationError(`${field}格式无效`, field);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new ValidationError(`${field}长度必须为 ${min} 至 ${max} 个字符`, field);
  }
  return normalized || null;
}

class AfterSalesService {
  constructor({ db, paymentOrchestrator = null }) {
    this.db = db;
    this.paymentOrchestrator = paymentOrchestrator;
  }

  _validateCaseInput(input) {
    assertPlainObject(input, '售后申请');
    assertKnownFields(input, CASE_INPUT_FIELDS);

    const clientRequestId = optionalText(input.clientRequestId, {
      field: 'clientRequestId',
      min: 8,
      max: 64,
    });
    if (!/^[A-Za-z0-9._:-]+$/.test(clientRequestId || '')) {
      throw new ValidationError('clientRequestId 只能包含字母、数字、点、下划线、冒号或短横线', 'clientRequestId');
    }
    if (!CASE_TYPES.has(input.type)) {
      throw new ValidationError('售后类型无效', 'type');
    }
    const orderId = input.orderId === undefined || input.orderId === null
      ? null
      : parsePositiveId(input.orderId, 'orderId');
    if (input.type !== 'order_exception' && orderId === null) {
      throw new ValidationError('退货或退款申请必须关联订单', 'orderId');
    }
    const reason = optionalText(input.reason, { field: 'reason', min: 2, max: 120 });
    const description = optionalText(input.description, {
      field: 'description',
      min: 10,
      max: 2000,
    });
    if (!reason) throw new ValidationError('售后原因不能为空', 'reason');
    if (!description) throw new ValidationError('售后说明不能为空', 'description');
    const requestedAmount = input.requestedAmount === undefined || input.requestedAmount === null
      ? null
      : Number(input.requestedAmount);
    if (requestedAmount !== null
      && (!Number.isFinite(requestedAmount) || requestedAmount <= 0)) {
      throw new ValidationError('requestedAmount 必须大于 0', 'requestedAmount');
    }
    if (requestedAmount !== null
      && Math.abs(requestedAmount * 100 - Math.round(requestedAmount * 100)) > 1e-8) {
      throw new ValidationError('requestedAmount 最多保留两位小数', 'requestedAmount');
    }
    if (input.type === 'order_exception' && requestedAmount !== null) {
      throw new ValidationError('异常订单工单不能填写退款金额', 'requestedAmount');
    }

    return {
      clientRequestId,
      orderId,
      type: input.type,
      reason,
      description,
      requestedAmount: requestedAmount === null ? null : Math.round(requestedAmount * 100) / 100,
    };
  }

  _fingerprint(input) {
    return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
  }

  _caseNo() {
    return `AS-${Date.now()}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  }

  _validateInvoiceProfile(input, current = null) {
    assertPlainObject(input, '发票资料');
    assertKnownFields(input, INVOICE_PROFILE_FIELDS);
    if (current && Object.keys(input).length === 0) {
      throw new ValidationError('没有可更新的发票资料字段');
    }

    const value = (field) => Object.prototype.hasOwnProperty.call(input, field)
      ? input[field]
      : current?.[field];
    const titleType = value('titleType');
    if (!['personal', 'company'].includes(titleType)) {
      throw new ValidationError('titleType 必须是 personal 或 company', 'titleType');
    }
    const title = optionalText(value('title'), { field: 'title', min: 1, max: 160 });
    const email = optionalText(value('email'), { field: 'email', min: 3, max: 254 });
    if (!title) throw new ValidationError('发票抬头不能为空', 'title');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) {
      throw new ValidationError('发票接收邮箱格式无效', 'email');
    }
    const taxNumberValue = optionalText(value('taxNumber'), {
      field: 'taxNumber',
      max: 32,
    });
    const taxNumber = taxNumberValue?.toUpperCase() || null;
    if (titleType === 'company' && !/^[A-Z0-9]{15,20}$/.test(taxNumber || '')) {
      throw new ValidationError('企业发票税号格式无效', 'taxNumber');
    }
    if (titleType === 'personal' && taxNumber) {
      throw new ValidationError('个人发票不能填写企业税号', 'taxNumber');
    }
    const recipientPhone = optionalText(value('recipientPhone'), {
      field: 'recipientPhone',
      max: 20,
    });
    if (recipientPhone
      && !/^(?:1[3-9]\d{9}|0\d{2,3}-?\d{7,8})$/.test(recipientPhone)) {
      throw new ValidationError('发票联系电话格式无效', 'recipientPhone');
    }
    const registeredAddress = optionalText(value('registeredAddress'), {
      field: 'registeredAddress',
      max: 300,
    });
    const bankName = optionalText(value('bankName'), { field: 'bankName', max: 160 });
    const bankAccount = optionalText(value('bankAccount'), { field: 'bankAccount', max: 64 });
    if (Boolean(bankName) !== Boolean(bankAccount)) {
      throw new ValidationError('开户行和银行账号必须同时填写', 'bankAccount');
    }
    if (bankAccount && !/^\d{8,32}$/.test(bankAccount)) {
      throw new ValidationError('银行账号格式无效', 'bankAccount');
    }
    const isDefaultValue = value('isDefault');
    if (isDefaultValue !== undefined && typeof isDefaultValue !== 'boolean') {
      throw new ValidationError('isDefault 必须是布尔值', 'isDefault');
    }

    return {
      titleType,
      title,
      taxNumber,
      email: email.toLowerCase(),
      recipientPhone,
      registeredAddress,
      bankName,
      bankAccount,
      isDefault: Boolean(isDefaultValue),
    };
  }

  async _ownedOrder(executor, customerId, orderId) {
    const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
    return executor.get(
      `SELECT o.id, o.status, o.total_price, o.tracking_number,
              o.shipped_at, o.completed_at
       FROM orders o
       JOIN customers c ON c.phone = o.customer_phone
       WHERE o.id = ? AND c.id = ?${lockClause}`,
      [orderId, customerId]
    );
  }

  async createInvoiceProfile(customerIdValue, input) {
    const customerId = parsePositiveId(customerIdValue, 'customerId');
    const normalized = this._validateInvoiceProfile(input);

    return this.db.transaction(async (tx) => {
      const customer = await tx.get(
        'SELECT id FROM customers WHERE id = ? AND status = ?',
        [customerId, 'active']
      );
      if (!customer) throw new NotFoundError('顾客');
      const count = await tx.get(
        'SELECT COUNT(*) AS count FROM invoice_profiles WHERE customer_id = ?',
        [customerId]
      );
      const isDefault = normalized.isDefault || Number(count.count) === 0;
      if (isDefault) {
        await tx.run(
          'UPDATE invoice_profiles SET is_default = 0 WHERE customer_id = ? AND is_default = 1',
          [customerId]
        );
      }
      const result = await tx.run(
        `INSERT INTO invoice_profiles
           (customer_id, title_type, title, tax_number, email, recipient_phone,
            registered_address, bank_name, bank_account, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerId,
          normalized.titleType,
          normalized.title,
          normalized.taxNumber,
          normalized.email,
          normalized.recipientPhone,
          normalized.registeredAddress,
          normalized.bankName,
          normalized.bankAccount,
          isDefault ? 1 : 0,
        ]
      );
      const created = await tx.get('SELECT * FROM invoice_profiles WHERE id = ?', [result.lastID]);
      return normalizeInvoiceProfile(created);
    });
  }

  async listInvoiceProfiles(customerIdValue) {
    const customerId = parsePositiveId(customerIdValue, 'customerId');
    const rows = await this.db.all(
      `SELECT * FROM invoice_profiles
       WHERE customer_id = ? ORDER BY is_default DESC, created_at DESC, id DESC`,
      [customerId]
    );
    return rows.map(normalizeInvoiceProfile);
  }

  async updateInvoiceProfile({
    customerId: customerIdValue,
    profileId: profileIdValue,
    expectedVersion: expectedVersionValue,
    input,
  }) {
    const customerId = parsePositiveId(customerIdValue, 'customerId');
    const profileId = parsePositiveId(profileIdValue, 'profileId');
    const expectedVersion = parsePositiveId(expectedVersionValue, 'version');

    return this.db.transaction(async (tx) => {
      const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
      const currentRow = await tx.get(
        `SELECT * FROM invoice_profiles
         WHERE id = ? AND customer_id = ?${lockClause}`,
        [profileId, customerId]
      );
      if (!currentRow) throw new NotFoundError('发票资料');
      if (Number(currentRow.version) !== expectedVersion) {
        throw new BusinessError(
          '发票资料已被更新，请刷新后重试',
          409,
          'INVOICE_PROFILE_VERSION_CONFLICT'
        );
      }
      const normalized = this._validateInvoiceProfile(
        input,
        normalizeInvoiceProfile(currentRow)
      );
      if (normalized.isDefault) {
        await tx.run(
          `UPDATE invoice_profiles SET is_default = 0
           WHERE customer_id = ? AND id <> ? AND is_default = 1`,
          [customerId, profileId]
        );
      }
      const nextVersion = expectedVersion + 1;
      const result = await tx.run(
        `UPDATE invoice_profiles
         SET title_type = ?, title = ?, tax_number = ?, email = ?, recipient_phone = ?,
             registered_address = ?, bank_name = ?, bank_account = ?, is_default = ?,
             version = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND customer_id = ? AND version = ?`,
        [
          normalized.titleType,
          normalized.title,
          normalized.taxNumber,
          normalized.email,
          normalized.recipientPhone,
          normalized.registeredAddress,
          normalized.bankName,
          normalized.bankAccount,
          normalized.isDefault ? 1 : 0,
          nextVersion,
          profileId,
          customerId,
          expectedVersion,
        ]
      );
      if (!result || result.changes !== 1) {
        throw new BusinessError(
          '发票资料已被并发更新',
          409,
          'INVOICE_PROFILE_VERSION_CONFLICT'
        );
      }
      const updated = await tx.get('SELECT * FROM invoice_profiles WHERE id = ?', [profileId]);
      return normalizeInvoiceProfile(updated);
    });
  }

  async deleteInvoiceProfile({
    customerId: customerIdValue,
    profileId: profileIdValue,
    expectedVersion: expectedVersionValue,
  }) {
    const customerId = parsePositiveId(customerIdValue, 'customerId');
    const profileId = parsePositiveId(profileIdValue, 'profileId');
    const expectedVersion = parsePositiveId(expectedVersionValue, 'version');
    return this.db.transaction(async (tx) => {
      const current = await tx.get(
        'SELECT * FROM invoice_profiles WHERE id = ? AND customer_id = ?',
        [profileId, customerId]
      );
      if (!current) throw new NotFoundError('发票资料');
      if (Number(current.version) !== expectedVersion) {
        throw new BusinessError(
          '发票资料已被更新，请刷新后重试',
          409,
          'INVOICE_PROFILE_VERSION_CONFLICT'
        );
      }
      const result = await tx.run(
        'DELETE FROM invoice_profiles WHERE id = ? AND customer_id = ? AND version = ?',
        [profileId, customerId, expectedVersion]
      );
      if (!result || result.changes !== 1) {
        throw new BusinessError(
          '发票资料已被并发更新',
          409,
          'INVOICE_PROFILE_VERSION_CONFLICT'
        );
      }
      if (current.is_default) {
        const replacement = await tx.get(
          `SELECT id FROM invoice_profiles
           WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
          [customerId]
        );
        if (replacement) {
          await tx.run('UPDATE invoice_profiles SET is_default = 1 WHERE id = ?', [replacement.id]);
        }
      }
      return { id: profileId, deleted: true };
    });
  }

  async requestOrderInvoice({
    customerId: customerIdValue,
    orderId: orderIdValue,
    profileId: profileIdValue,
  }) {
    const customerId = parsePositiveId(customerIdValue, 'customerId');
    const orderId = parsePositiveId(orderIdValue, 'orderId');
    const profileId = parsePositiveId(profileIdValue, 'profileId');

    return this.db.transaction(async (tx) => {
      const order = await this._ownedOrder(tx, customerId, orderId);
      if (!order) throw new NotFoundError('订单');
      if (!['paid', 'shipped', 'completed'].includes(order.status)) {
        throw new BusinessError(
          '只有已支付订单可以申请发票',
          409,
          'ORDER_NOT_INVOICE_ELIGIBLE'
        );
      }
      const profile = await tx.get(
        `SELECT * FROM invoice_profiles
         WHERE id = ? AND customer_id = ?`,
        [profileId, customerId]
      );
      if (!profile) throw new NotFoundError('发票资料');
      const existing = await tx.get(
        'SELECT id FROM order_invoice_requests WHERE order_id = ?',
        [orderId]
      );
      if (existing) throw new ConflictError('该订单已申请发票');

      const normalizedProfile = normalizeInvoiceProfile(profile);
      const profileSnapshot = JSON.stringify({
        titleType: normalizedProfile.titleType,
        title: normalizedProfile.title,
        taxNumber: normalizedProfile.taxNumber,
        email: normalizedProfile.email,
        recipientPhone: normalizedProfile.recipientPhone,
        registeredAddress: normalizedProfile.registeredAddress,
        bankName: normalizedProfile.bankName,
        bankAccount: normalizedProfile.bankAccount,
      });
      const result = await tx.run(
        `INSERT INTO order_invoice_requests
           (customer_id, order_id, invoice_profile_id, profile_snapshot)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(order_id) DO NOTHING`,
        [customerId, orderId, profileId, profileSnapshot]
      );
      if (!result || result.changes !== 1) {
        const raced = await tx.get(
          'SELECT id FROM order_invoice_requests WHERE order_id = ?',
          [orderId]
        );
        if (raced) throw new ConflictError('该订单已申请发票');
        throw new ConflictError('发票申请创建冲突，请重试');
      }
      await tx.run(
        `INSERT INTO order_invoice_history
           (invoice_request_id, from_status, to_status, actor_type, actor_id, note, version)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [result.lastID, null, 'requested', 'customer', customerId, '顾客申请发票', 1]
      );
      const created = await tx.get(
        'SELECT * FROM order_invoice_requests WHERE id = ?',
        [result.lastID]
      );
      return normalizeInvoiceRequest(created);
    });
  }

  async listOrderInvoices(customerIdValue) {
    const customerId = parsePositiveId(customerIdValue, 'customerId');
    const rows = await this.db.all(
      `SELECT * FROM order_invoice_requests
       WHERE customer_id = ? ORDER BY created_at DESC, id DESC`,
      [customerId]
    );
    return rows.map(normalizeInvoiceRequest);
  }

  async getInvoiceForAdmin(invoiceIdValue) {
    const invoiceId = parsePositiveId(invoiceIdValue, 'invoiceId');
    const row = await this.db.get(
      'SELECT * FROM order_invoice_requests WHERE id = ?',
      [invoiceId]
    );
    if (!row) throw new NotFoundError('发票申请');
    const history = await this.db.all(
      `SELECT * FROM order_invoice_history
       WHERE invoice_request_id = ? ORDER BY version`,
      [invoiceId]
    );
    return { ...normalizeInvoiceRequest(row), history: history.map(normalizeInvoiceHistory) };
  }

  async listInvoicesForAdmin({ status, page = 1, pageSize = 20 } = {}) {
    if (status && !INVOICE_STATUSES.has(status)) {
      throw new ValidationError('发票状态无效', 'status');
    }
    const normalizedPage = parsePositiveId(page, 'page');
    const normalizedPageSize = parsePositiveId(pageSize, 'pageSize');
    if (normalizedPageSize > 100) throw new ValidationError('pageSize 不能超过 100', 'pageSize');
    const where = status ? 'WHERE status = ?' : '';
    const params = status ? [status] : [];
    const total = await this.db.get(
      `SELECT COUNT(*) AS total FROM order_invoice_requests ${where}`,
      params
    );
    const rows = await this.db.all(
      `SELECT * FROM order_invoice_requests ${where}
       ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, normalizedPageSize, (normalizedPage - 1) * normalizedPageSize]
    );
    return {
      items: rows.map(normalizeInvoiceRequest),
      total: Number(total.total),
      page: normalizedPage,
      pageSize: normalizedPageSize,
    };
  }

  async updateInvoiceStatus({
    invoiceId: invoiceIdValue,
    expectedVersion: expectedVersionValue,
    status,
    adminId: adminIdValue,
    note,
    invoiceNumber,
  }) {
    const invoiceId = parsePositiveId(invoiceIdValue, 'invoiceId');
    const expectedVersion = parsePositiveId(expectedVersionValue, 'version');
    const adminId = parsePositiveId(adminIdValue, 'adminId');
    if (!INVOICE_STATUSES.has(status) || status === 'requested') {
      throw new ValidationError('目标发票状态无效', 'status');
    }
    const normalizedNote = optionalText(note, { field: 'note', min: 2, max: 1000 });
    if (!normalizedNote) throw new ValidationError('发票处理备注不能为空', 'note');
    const normalizedInvoiceNumber = optionalText(invoiceNumber, {
      field: 'invoiceNumber',
      max: 100,
    });
    if (status === 'issued'
      && (!normalizedInvoiceNumber || !/^[A-Za-z0-9._:-]{4,100}$/.test(normalizedInvoiceNumber))) {
      throw new ValidationError('开票成功时必须提供有效发票号码', 'invoiceNumber');
    }
    if (status !== 'issued' && normalizedInvoiceNumber) {
      throw new ValidationError('只有已开票状态可以填写发票号码', 'invoiceNumber');
    }

    return this.db.transaction(async (tx) => {
      const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
      const current = await tx.get(
        `SELECT * FROM order_invoice_requests WHERE id = ?${lockClause}`,
        [invoiceId]
      );
      if (!current) throw new NotFoundError('发票申请');
      if (Number(current.version) !== expectedVersion) {
        throw new BusinessError(
          '发票申请已被更新，请刷新后重试',
          409,
          'INVOICE_VERSION_CONFLICT'
        );
      }
      if (!INVOICE_TRANSITIONS[current.status]?.has(status)) {
        throw new BusinessError(
          `发票状态不能从 ${current.status} 变更为 ${status}`,
          409,
          'INVALID_INVOICE_TRANSITION'
        );
      }
      const nextVersion = expectedVersion + 1;
      const result = await tx.run(
        `UPDATE order_invoice_requests
         SET status = ?, invoice_number = ?, resolution_note = ?, version = ?,
             issued_at = CASE WHEN ? = 'issued' THEN CURRENT_TIMESTAMP ELSE issued_at END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = ? AND version = ?`,
        [
          status,
          normalizedInvoiceNumber,
          normalizedNote,
          nextVersion,
          status,
          invoiceId,
          current.status,
          expectedVersion,
        ]
      );
      if (!result || result.changes !== 1) {
        throw new BusinessError(
          '发票申请已被并发更新',
          409,
          'INVOICE_VERSION_CONFLICT'
        );
      }
      await tx.run(
        `INSERT INTO order_invoice_history
           (invoice_request_id, from_status, to_status, actor_type, actor_id, note, version)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [invoiceId, current.status, status, 'admin', adminId, normalizedNote, nextVersion]
      );
      const updated = await tx.get(
        'SELECT * FROM order_invoice_requests WHERE id = ?',
        [invoiceId]
      );
      return normalizeInvoiceRequest(updated);
    });
  }

  async _buildLogisticsView(executor, order) {
    const history = await executor.all(
      `SELECT old_status, new_status, note, created_at
       FROM order_status_history WHERE order_id = ? ORDER BY created_at, id`,
      [order.id]
    );
    const shipment = await executor.get(
      'SELECT * FROM shipment_records WHERE order_id = ?',
      [order.id]
    );
    const shippingStatusByOrderStatus = {
      pending: 'not_shipped',
      paid: 'awaiting_shipment',
      shipped: 'in_transit',
      completed: 'delivered',
      cancelled: 'cancelled',
    };
    const view = {
      orderId: Number(order.id),
      orderStatus: order.status,
      shippingStatus: shipment?.status
        || shippingStatusByOrderStatus[order.status]
        || 'unknown',
      trackingNumber: shipment?.tracking_number || order.tracking_number,
      shippedAt: order.shipped_at,
      completedAt: order.completed_at,
      history: history.map((event) => ({
        oldStatus: event.old_status,
        newStatus: event.new_status,
        note: event.note,
        createdAt: event.created_at,
      })),
    };
    if (!shipment) return view;
    const events = await executor.all(
      'SELECT * FROM shipment_history WHERE shipment_id = ? ORDER BY version',
      [shipment.id]
    );
    return {
      ...view,
      carrier: shipment.carrier,
      shipmentVersion: Number(shipment.version),
      lastLocation: shipment.last_location,
      latestNote: shipment.note,
      occurredAt: shipment.occurred_at,
      events: events.map(normalizeShipmentEvent),
    };
  }

  async getLogisticsForCustomer(customerIdValue, orderIdValue) {
    const customerId = parsePositiveId(customerIdValue, 'customerId');
    const orderId = parsePositiveId(orderIdValue, 'orderId');
    const order = await this._ownedOrder(this.db, customerId, orderId);
    if (!order) throw new NotFoundError('订单');
    return this._buildLogisticsView(this.db, order);
  }

  async getLogisticsForAdmin(orderIdValue) {
    const orderId = parsePositiveId(orderIdValue, 'orderId');
    const order = await this.db.get(
      `SELECT id, status, total_price, tracking_number, shipped_at, completed_at
       FROM orders WHERE id = ?`,
      [orderId]
    );
    if (!order) throw new NotFoundError('订单');
    return this._buildLogisticsView(this.db, order);
  }

  async updateLogisticsForAdmin({
    orderId: orderIdValue,
    expectedVersion: expectedVersionValue,
    adminId: adminIdValue,
    carrier,
    trackingNumber,
    status,
    location,
    note,
  }) {
    const orderId = parsePositiveId(orderIdValue, 'orderId');
    const expectedVersion = parseNonNegativeVersion(expectedVersionValue);
    const adminId = parsePositiveId(adminIdValue, 'adminId');
    const normalizedCarrier = optionalText(carrier, { field: 'carrier', min: 2, max: 80 });
    const normalizedTracking = optionalText(trackingNumber, {
      field: 'trackingNumber',
      min: 4,
      max: 100,
    });
    if (!normalizedTracking || !/^[A-Za-z0-9-]{4,100}$/.test(normalizedTracking)) {
      throw new ValidationError('物流单号格式无效', 'trackingNumber');
    }
    if (!SHIPMENT_STATUSES.has(status)) {
      throw new ValidationError('物流状态无效', 'status');
    }
    const normalizedLocation = optionalText(location, { field: 'location', max: 200 });
    const normalizedNote = optionalText(note, { field: 'note', min: 2, max: 1000 });
    if (!normalizedCarrier) throw new ValidationError('物流承运商不能为空', 'carrier');
    if (!normalizedNote) throw new ValidationError('物流更新备注不能为空', 'note');

    await this.db.transaction(async (tx) => {
      const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
      const order = await tx.get(
        `SELECT * FROM orders WHERE id = ?${lockClause}`,
        [orderId]
      );
      if (!order) throw new NotFoundError('订单');
      if (!['paid', 'shipped', 'completed'].includes(order.status)) {
        throw new BusinessError(
          '当前订单状态不能更新物流',
          409,
          'ORDER_NOT_SHIPPABLE'
        );
      }
      if (order.status === 'completed' && status !== 'delivered') {
        throw new BusinessError(
          '已完成订单的物流状态不能回退',
          409,
          'INVALID_LOGISTICS_TRANSITION'
        );
      }

      const current = await tx.get(
        `SELECT * FROM shipment_records WHERE order_id = ?${lockClause}`,
        [orderId]
      );
      let shipmentId;
      let nextVersion;
      if (!current) {
        if (expectedVersion !== 0) {
          throw new BusinessError(
            '物流记录尚未创建，首次更新的 expectedVersion 必须为 0',
            409,
            'LOGISTICS_VERSION_CONFLICT'
          );
        }
        if (!INITIAL_SHIPMENT_STATUSES.has(status)) {
          throw new BusinessError(
            '首次物流状态只能是已创建面单或运输中',
            409,
            'INVALID_INITIAL_LOGISTICS_STATUS'
          );
        }
        const insert = await tx.run(
          `INSERT INTO shipment_records
             (order_id, carrier, tracking_number, status, last_location, note)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(order_id) DO NOTHING`,
          [
            orderId,
            normalizedCarrier,
            normalizedTracking,
            status,
            normalizedLocation,
            normalizedNote,
          ]
        );
        if (!insert || insert.changes !== 1) {
          throw new BusinessError(
            '物流记录已被并发创建，请刷新后重试',
            409,
            'LOGISTICS_VERSION_CONFLICT'
          );
        }
        shipmentId = insert.lastID;
        nextVersion = 1;
      } else {
        if (Number(current.version) !== expectedVersion) {
          throw new BusinessError(
            '物流记录已被更新，请刷新后重试',
            409,
            'LOGISTICS_VERSION_CONFLICT'
          );
        }
        if (current.status !== status
          && !SHIPMENT_TRANSITIONS[current.status]?.has(status)) {
          throw new BusinessError(
            `物流状态不能从 ${current.status} 变更为 ${status}`,
            409,
            'INVALID_LOGISTICS_TRANSITION'
          );
        }
        nextVersion = expectedVersion + 1;
        const update = await tx.run(
          `UPDATE shipment_records
           SET carrier = ?, tracking_number = ?, status = ?, last_location = ?,
               note = ?, version = ?, occurred_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = ? AND version = ?`,
          [
            normalizedCarrier,
            normalizedTracking,
            status,
            normalizedLocation,
            normalizedNote,
            nextVersion,
            current.id,
            current.status,
            expectedVersion,
          ]
        );
        if (!update || update.changes !== 1) {
          throw new BusinessError(
            '物流记录已被并发更新',
            409,
            'LOGISTICS_VERSION_CONFLICT'
          );
        }
        shipmentId = current.id;
      }

      await tx.run(
        `INSERT INTO shipment_history
           (shipment_id, status, carrier, tracking_number, location, note, actor_id, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          shipmentId,
          status,
          normalizedCarrier,
          normalizedTracking,
          normalizedLocation,
          normalizedNote,
          adminId,
          nextVersion,
        ]
      );
      const trackingUpdate = await tx.run(
        'UPDATE orders SET tracking_number = ? WHERE id = ?',
        [normalizedTracking, orderId]
      );
      if (!trackingUpdate || trackingUpdate.changes !== 1) {
        throw new BusinessError('订单物流单号更新失败', 409, 'ORDER_STATUS_CONFLICT');
      }

      let orderStatus = order.status;
      if (orderStatus === 'paid' && status !== 'label_created') {
        const shipped = await tx.run(
          `UPDATE orders
           SET status = ?, shipped_at = COALESCE(shipped_at, CURRENT_TIMESTAMP)
           WHERE id = ? AND status = ?`,
          ['shipped', orderId, 'paid']
        );
        if (!shipped || shipped.changes !== 1) {
          throw new BusinessError('订单发货状态并发冲突', 409, 'ORDER_STATUS_CONFLICT');
        }
        await tx.run(
          `INSERT INTO order_status_history (order_id, old_status, new_status, note)
           VALUES (?, ?, ?, ?)`,
          [orderId, 'paid', 'shipped', normalizedNote]
        );
        orderStatus = 'shipped';
      }
      if (orderStatus === 'shipped' && status === 'delivered') {
        const completed = await tx.run(
          `UPDATE orders
           SET status = ?, completed_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = ?`,
          ['completed', orderId, 'shipped']
        );
        if (!completed || completed.changes !== 1) {
          throw new BusinessError('订单完成状态并发冲突', 409, 'ORDER_STATUS_CONFLICT');
        }
        await tx.run(
          `INSERT INTO order_status_history (order_id, old_status, new_status, note)
           VALUES (?, ?, ?, ?)`,
          [orderId, 'shipped', 'completed', normalizedNote]
        );
      }
    });

    return this.getLogisticsForAdmin(orderId);
  }

  async createCase(customerIdValue, input) {
    const customerId = parsePositiveId(customerIdValue, 'customerId');
    const normalized = this._validateCaseInput(input);
    const fingerprint = this._fingerprint(normalized);

    return this.db.transaction(async (tx) => {
      const existing = await tx.get(
        `SELECT * FROM after_sales_cases
         WHERE customer_id = ? AND client_request_id = ?`,
        [customerId, normalized.clientRequestId]
      );
      if (existing) {
        if (existing.request_fingerprint !== fingerprint) {
          throw new ConflictError('同一 clientRequestId 已用于不同的售后申请');
        }
        return { ...normalizeCase(existing), idempotent: true };
      }

      if (normalized.orderId !== null) {
        const order = await this._ownedOrder(tx, customerId, normalized.orderId);
        if (!order) throw new NotFoundError('订单');
        if (normalized.type !== 'order_exception'
          && !['paid', 'shipped', 'completed'].includes(order.status)) {
          throw new BusinessError(
            '只有已支付订单可以申请退货或退款',
            409,
            'ORDER_NOT_AFTER_SALES_ELIGIBLE'
          );
        }
        if (normalized.requestedAmount !== null
          && normalized.requestedAmount > Number(order.total_price)) {
          throw new ValidationError('申请金额不能超过订单金额', 'requestedAmount');
        }
      }

      const result = await tx.run(
        `INSERT INTO after_sales_cases
           (case_no, client_request_id, request_fingerprint, customer_id,
            order_id, type, reason, description, requested_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(customer_id, client_request_id) DO NOTHING`,
        [
          this._caseNo(),
          normalized.clientRequestId,
          fingerprint,
          customerId,
          normalized.orderId,
          normalized.type,
          normalized.reason,
          normalized.description,
          normalized.requestedAmount,
        ]
      );
      if (!result || result.changes !== 1) {
        const raced = await tx.get(
          `SELECT * FROM after_sales_cases
           WHERE customer_id = ? AND client_request_id = ?`,
          [customerId, normalized.clientRequestId]
        );
        if (!raced) throw new ConflictError('售后申请创建冲突，请重试');
        if (raced.request_fingerprint !== fingerprint) {
          throw new ConflictError('同一 clientRequestId 已用于不同的售后申请');
        }
        return { ...normalizeCase(raced), idempotent: true };
      }

      await tx.run(
        `INSERT INTO after_sales_history
           (case_id, from_status, to_status, actor_type, actor_id, note, version)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [result.lastID, null, 'submitted', 'customer', customerId, '顾客提交售后申请', 1]
      );
      const created = await tx.get('SELECT * FROM after_sales_cases WHERE id = ?', [result.lastID]);
      return { ...normalizeCase(created), idempotent: false };
    });
  }

  async getCaseForCustomer(customerIdValue, caseIdValue) {
    const customerId = parsePositiveId(customerIdValue, 'customerId');
    const caseId = parsePositiveId(caseIdValue, 'caseId');
    const row = await this.db.get(
      'SELECT * FROM after_sales_cases WHERE id = ? AND customer_id = ?',
      [caseId, customerId]
    );
    if (!row) throw new NotFoundError('售后申请');
    const history = await this.db.all(
      'SELECT * FROM after_sales_history WHERE case_id = ? ORDER BY version',
      [caseId]
    );
    return { ...normalizeCase(row), history: history.map(normalizeHistory) };
  }

  async listCasesForCustomer(customerIdValue) {
    const customerId = parsePositiveId(customerIdValue, 'customerId');
    const rows = await this.db.all(
      `SELECT * FROM after_sales_cases
       WHERE customer_id = ? ORDER BY created_at DESC, id DESC`,
      [customerId]
    );
    return rows.map(normalizeCase);
  }

  async getCaseForAdmin(caseIdValue) {
    const caseId = parsePositiveId(caseIdValue, 'caseId');
    const row = await this.db.get('SELECT * FROM after_sales_cases WHERE id = ?', [caseId]);
    if (!row) throw new NotFoundError('售后申请');
    const history = await this.db.all(
      'SELECT * FROM after_sales_history WHERE case_id = ? ORDER BY version',
      [caseId]
    );
    return { ...normalizeCase(row), history: history.map(normalizeHistory) };
  }

  async listCasesForAdmin({ status, type, page = 1, pageSize = 20 } = {}) {
    if (status && !CASE_STATUSES.has(status)) {
      throw new ValidationError('售后状态无效', 'status');
    }
    if (type && !CASE_TYPES.has(type)) {
      throw new ValidationError('售后类型无效', 'type');
    }
    const normalizedPage = parsePositiveId(page, 'page');
    const normalizedPageSize = parsePositiveId(pageSize, 'pageSize');
    if (normalizedPageSize > 100) throw new ValidationError('pageSize 不能超过 100', 'pageSize');

    let where = 'WHERE 1 = 1';
    const params = [];
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }
    if (type) {
      where += ' AND type = ?';
      params.push(type);
    }
    const totalRow = await this.db.get(
      `SELECT COUNT(*) AS total FROM after_sales_cases ${where}`,
      params
    );
    const rows = await this.db.all(
      `SELECT * FROM after_sales_cases ${where}
       ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, normalizedPageSize, (normalizedPage - 1) * normalizedPageSize]
    );
    return {
      items: rows.map(normalizeCase),
      total: Number(totalRow.total),
      page: normalizedPage,
      pageSize: normalizedPageSize,
    };
  }

  async updateCaseStatus({
    caseId: caseIdValue,
    expectedVersion: expectedVersionValue,
    status,
    adminId: adminIdValue,
    note,
  }) {
    const caseId = parsePositiveId(caseIdValue, 'caseId');
    const expectedVersion = parsePositiveId(expectedVersionValue, 'version');
    const adminId = parsePositiveId(adminIdValue, 'adminId');
    if (!CASE_STATUSES.has(status) || status === 'submitted') {
      throw new ValidationError('目标售后状态无效', 'status');
    }
    if (status === 'refund_processing') {
      throw new BusinessError(
        '退款处理中状态只能通过统一支付退款流程进入',
        409,
        'REFUND_WORKFLOW_REQUIRED'
      );
    }
    const normalizedNote = optionalText(note, { field: 'note', min: 2, max: 1000 });
    if (!normalizedNote) throw new ValidationError('审核备注不能为空', 'note');

    return this.db.transaction(async (tx) => {
      const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
      const current = await tx.get(
        `SELECT * FROM after_sales_cases WHERE id = ?${lockClause}`,
        [caseId]
      );
      if (!current) throw new NotFoundError('售后申请');
      if (Number(current.version) !== expectedVersion) {
        throw new BusinessError(
          '售后申请已被更新，请刷新后重试',
          409,
          'AFTER_SALES_VERSION_CONFLICT'
        );
      }
      if (!ADMIN_TRANSITIONS[current.status]?.has(status)) {
        throw new BusinessError(
          `售后状态不能从 ${current.status} 变更为 ${status}`,
          409,
          'INVALID_AFTER_SALES_TRANSITION'
        );
      }
      if (status === 'awaiting_return' && current.type !== 'return_refund') {
        throw new BusinessError(
          '只有退货退款申请可以等待寄回商品',
          409,
          'RETURN_NOT_REQUIRED'
        );
      }
      if (status === 'received' && current.type !== 'return_refund') {
        throw new BusinessError(
          '只有退货退款申请可以确认收货',
          409,
          'RETURN_NOT_REQUIRED'
        );
      }
      if (status === 'completed'
        && current.type !== 'order_exception'
        && current.refund_status !== 'success') {
        throw new BusinessError(
          '支付渠道尚未确认退款成功，不能完成售后单',
          409,
          'REFUND_NOT_CONFIRMED'
        );
      }

      const nextVersion = expectedVersion + 1;
      const result = await tx.run(
        `UPDATE after_sales_cases
         SET status = ?, version = ?, resolution_note = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = ? AND version = ?`,
        [status, nextVersion, normalizedNote, caseId, current.status, expectedVersion]
      );
      if (!result || result.changes !== 1) {
        throw new BusinessError(
          '售后申请已被并发更新',
          409,
          'AFTER_SALES_VERSION_CONFLICT'
        );
      }
      await tx.run(
        `INSERT INTO after_sales_history
           (case_id, from_status, to_status, actor_type, actor_id, note, version)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [caseId, current.status, status, 'admin', adminId, normalizedNote, nextVersion]
      );
      const updated = await tx.get('SELECT * FROM after_sales_cases WHERE id = ?', [caseId]);
      return normalizeCase(updated);
    });
  }

  async _recordRefundStatus({
    caseId,
    expectedVersion,
    adminId,
    providerResult,
    note,
  }) {
    const refundStatus = providerResult?.status;
    if (!REFUND_STATUSES.has(refundStatus)) {
      throw new BusinessError(
        '统一支付退款流程返回了无效状态',
        502,
        'INVALID_REFUND_STATUS'
      );
    }

    return this.db.transaction(async (tx) => {
      const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
      const current = await tx.get(
        `SELECT * FROM after_sales_cases WHERE id = ?${lockClause}`,
        [caseId]
      );
      if (!current) throw new NotFoundError('售后申请');
      if (Number(current.version) !== expectedVersion) {
        throw new BusinessError(
          '售后申请已被更新，请刷新后重试',
          409,
          'AFTER_SALES_VERSION_CONFLICT'
        );
      }
      if (current.status !== 'refund_processing') {
        throw new BusinessError(
          '售后申请不在退款处理中状态',
          409,
          'INVALID_AFTER_SALES_TRANSITION'
        );
      }

      const refundId = providerResult.refundId === undefined
        || providerResult.refundId === null
        ? current.refund_id
        : parsePositiveId(providerResult.refundId, 'refundId');
      if (refundStatus === current.refund_status
        && (refundId === null || Number(refundId) === Number(current.refund_id))) {
        return { ...normalizeCase(current), idempotent: true };
      }

      let nextCaseStatus = 'refund_processing';
      if (refundStatus === 'success') {
        const payment = await tx.get(
          'SELECT id, order_id, status FROM payment_orders WHERE id = ?',
          [current.payment_order_id]
        );
        const order = payment
          ? await tx.get('SELECT id, status FROM orders WHERE id = ?', [payment.order_id])
          : null;
        if (!payment
          || payment.status !== 'refunded'
          || !order
          || !['cancelled', 'refunded'].includes(order.status)) {
          throw new BusinessError(
            '退款已成功但支付单或订单尚未完成本地同步',
            409,
            'REFUND_ORDER_SYNC_INCOMPLETE'
          );
        }
        nextCaseStatus = 'completed';
      }

      const nextVersion = expectedVersion + 1;
      const result = await tx.run(
        `UPDATE after_sales_cases
         SET status = ?, refund_id = ?, refund_status = ?, version = ?,
             resolution_note = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = ? AND version = ?`,
        [
          nextCaseStatus,
          refundId,
          refundStatus,
          nextVersion,
          note,
          caseId,
          'refund_processing',
          expectedVersion,
        ]
      );
      if (!result || result.changes !== 1) {
        throw new BusinessError(
          '售后申请已被并发更新',
          409,
          'AFTER_SALES_VERSION_CONFLICT'
        );
      }
      await tx.run(
        `INSERT INTO after_sales_history
           (case_id, from_status, to_status, actor_type, actor_id, note, version)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          caseId,
          'refund_processing',
          nextCaseStatus,
          'payment_system',
          adminId,
          note,
          nextVersion,
        ]
      );
      const updated = await tx.get('SELECT * FROM after_sales_cases WHERE id = ?', [caseId]);
      return { ...normalizeCase(updated), idempotent: false };
    });
  }

  async initiateRefund({
    caseId: caseIdValue,
    expectedVersion: expectedVersionValue,
    adminId: adminIdValue,
    note,
  }) {
    const caseId = parsePositiveId(caseIdValue, 'caseId');
    const expectedVersion = parsePositiveId(expectedVersionValue, 'version');
    const adminId = parsePositiveId(adminIdValue, 'adminId');
    const normalizedNote = optionalText(note, { field: 'note', min: 2, max: 1000 });
    if (!normalizedNote) throw new ValidationError('退款处理备注不能为空', 'note');
    if (!this.paymentOrchestrator
      || typeof this.paymentOrchestrator.createRefund !== 'function') {
      throw new BusinessError(
        '统一支付退款服务不可用',
        503,
        'PAYMENT_REFUND_SERVICE_UNAVAILABLE'
      );
    }

    const claim = await this.db.transaction(async (tx) => {
      const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
      const current = await tx.get(
        `SELECT * FROM after_sales_cases WHERE id = ?${lockClause}`,
        [caseId]
      );
      if (!current) throw new NotFoundError('售后申请');
      if (Number(current.version) !== expectedVersion) {
        throw new BusinessError(
          '售后申请已被更新，请刷新后重试',
          409,
          'AFTER_SALES_VERSION_CONFLICT'
        );
      }
      if (!['refund_only', 'return_refund'].includes(current.type)) {
        throw new BusinessError('该售后类型不支持支付退款', 409, 'REFUND_NOT_APPLICABLE');
      }
      const requiredStatus = current.type === 'return_refund' ? 'received' : 'approved';
      if (current.status !== requiredStatus) {
        throw new BusinessError(
          `该售后申请必须处于 ${requiredStatus} 状态才能退款`,
          409,
          'INVALID_AFTER_SALES_TRANSITION'
        );
      }

      const payment = await tx.get(
        `SELECT * FROM payment_orders
         WHERE order_id = ? AND status = ?
         ORDER BY id DESC LIMIT 1${lockClause}`,
        [current.order_id, 'paid']
      );
      if (!payment) {
        throw new BusinessError(
          '未找到可退款的已支付支付单',
          409,
          'REFUNDABLE_PAYMENT_NOT_FOUND'
        );
      }
      const refundAmount = current.requested_amount === null
        ? Number(payment.amount)
        : Number(current.requested_amount);
      if (Math.round(refundAmount * 100) !== Math.round(Number(payment.amount) * 100)) {
        throw new BusinessError(
          '当前统一退款流程仅支持整单退款',
          409,
          'PARTIAL_REFUND_UNSUPPORTED'
        );
      }

      const nextVersion = expectedVersion + 1;
      const result = await tx.run(
        `UPDATE after_sales_cases
         SET status = ?, payment_order_id = ?, refund_status = ?, version = ?,
             resolution_note = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = ? AND version = ?`,
        [
          'refund_processing',
          payment.id,
          'requested',
          nextVersion,
          normalizedNote,
          caseId,
          current.status,
          expectedVersion,
        ]
      );
      if (!result || result.changes !== 1) {
        throw new BusinessError(
          '售后申请已被并发更新',
          409,
          'AFTER_SALES_VERSION_CONFLICT'
        );
      }
      await tx.run(
        `INSERT INTO after_sales_history
           (case_id, from_status, to_status, actor_type, actor_id, note, version)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          caseId,
          current.status,
          'refund_processing',
          'admin',
          adminId,
          normalizedNote,
          nextVersion,
        ]
      );
      return {
        caseId,
        version: nextVersion,
        paymentOrderId: Number(payment.id),
        amount: refundAmount,
        reason: current.reason,
      };
    });

    const providerResult = await this.paymentOrchestrator.createRefund({
      paymentOrderId: claim.paymentOrderId,
      amount: claim.amount,
      reason: claim.reason,
      syncAfterSales: true,
    });
    const synchronized = await this.db.get(
      'SELECT * FROM after_sales_cases WHERE id = ?',
      [caseId]
    );
    if (synchronized
      && Number(synchronized.version) > Number(claim.version)
      && Number(synchronized.refund_id || 0) === Number(providerResult?.refundId || 0)
      && synchronized.refund_status === providerResult?.status) {
      return normalizeCase(synchronized);
    }
    return this._recordRefundStatus({
      caseId,
      expectedVersion: claim.version,
      adminId,
      providerResult,
      note: providerResult?.status === 'success'
        ? '支付退款已确认成功并完成本地同步'
        : `统一支付退款状态：${providerResult?.status || 'unknown'}`,
    });
  }

  async syncRefundStatus({
    caseId: caseIdValue,
    expectedVersion: expectedVersionValue,
    adminId: adminIdValue,
  }) {
    const caseId = parsePositiveId(caseIdValue, 'caseId');
    const expectedVersion = parsePositiveId(expectedVersionValue, 'version');
    const adminId = parsePositiveId(adminIdValue, 'adminId');
    const current = await this.db.get('SELECT * FROM after_sales_cases WHERE id = ?', [caseId]);
    if (!current) throw new NotFoundError('售后申请');
    if (Number(current.version) !== expectedVersion) {
      throw new BusinessError(
        '售后申请已被更新，请刷新后重试',
        409,
        'AFTER_SALES_VERSION_CONFLICT'
      );
    }
    if (current.status !== 'refund_processing' || !current.payment_order_id) {
      throw new BusinessError(
        '售后申请不在退款处理中状态',
        409,
        'INVALID_AFTER_SALES_TRANSITION'
      );
    }
    const refund = await this.db.get(
      `SELECT * FROM refund_records
       WHERE payment_order_id = ? ORDER BY id DESC LIMIT 1`,
      [current.payment_order_id]
    );
    if (!refund) throw new NotFoundError('退款记录');
    if (this.paymentOrchestrator
      && typeof this.paymentOrchestrator.reconcileRefund === 'function'
      && ['requested', 'processing', 'failed'].includes(refund.status)) {
      await this.paymentOrchestrator.reconcileRefund(refund.id, {
        syncAfterSales: false,
      });
    }
    const reconciledRefund = await this.db.get(
      'SELECT * FROM refund_records WHERE id = ?',
      [refund.id]
    );
    return this._recordRefundStatus({
      caseId,
      expectedVersion,
      adminId,
      providerResult: { status: reconciledRefund.status, refundId: reconciledRefund.id },
      note: reconciledRefund.status === 'success'
        ? '支付退款已确认成功并完成本地同步'
        : `同步统一退款状态：${reconciledRefund.status}`,
    });
  }

  async resolveManualRefund({
    caseId: caseIdValue,
    expectedVersion: expectedVersionValue,
    adminId: adminIdValue,
    resolution,
    evidence,
    externalReference,
  }) {
    const caseId = parsePositiveId(caseIdValue, 'caseId');
    const expectedVersion = parsePositiveId(expectedVersionValue, 'version');
    const adminId = parsePositiveId(adminIdValue, 'adminId');
    if (!['mark_manual_required', 'mark_failed', 'confirm_completed'].includes(resolution)) {
      throw new ValidationError('人工退款处理结论无效', 'resolution');
    }
    if (!this.paymentOrchestrator
      || typeof this.paymentOrchestrator.confirmManualRefund !== 'function'
      || typeof this.paymentOrchestrator.recordManualRefundDecision !== 'function') {
      throw new BusinessError(
        '统一支付人工退款服务不可用',
        503,
        'PAYMENT_REFUND_SERVICE_UNAVAILABLE'
      );
    }

    const current = await this.db.get('SELECT * FROM after_sales_cases WHERE id = ?', [caseId]);
    if (!current) throw new NotFoundError('售后申请');
    if (Number(current.version) !== expectedVersion) {
      throw new BusinessError(
        '售后申请已被更新，请刷新后重试',
        409,
        'AFTER_SALES_VERSION_CONFLICT'
      );
    }
    if (current.status !== 'refund_processing' || !current.payment_order_id) {
      throw new BusinessError(
        '售后申请不在退款处理中状态',
        409,
        'INVALID_AFTER_SALES_TRANSITION'
      );
    }
    const refund = current.refund_id
      ? await this.db.get('SELECT * FROM refund_records WHERE id = ?', [current.refund_id])
      : await this.db.get(
        `SELECT * FROM refund_records
         WHERE payment_order_id = ? ORDER BY id DESC LIMIT 1`,
        [current.payment_order_id]
      );
    if (!refund) throw new NotFoundError('退款记录');

    const common = {
      refundId: refund.id,
      adminId,
      evidence,
      externalReference,
      caseId,
      expectedVersion,
    };
    const result = resolution === 'confirm_completed'
      ? await this.paymentOrchestrator.confirmManualRefund(common)
      : await this.paymentOrchestrator.recordManualRefundDecision({
        ...common,
        status: resolution === 'mark_failed' ? 'failed' : 'manual_required',
      });
    const updated = await this.db.get('SELECT * FROM after_sales_cases WHERE id = ?', [caseId]);
    return { ...normalizeCase(updated), idempotent: Boolean(result.idempotent) };
  }

  async cancelCaseForCustomer(customerIdValue, caseIdValue, expectedVersionValue) {
    const customerId = parsePositiveId(customerIdValue, 'customerId');
    const caseId = parsePositiveId(caseIdValue, 'caseId');
    const expectedVersion = parsePositiveId(expectedVersionValue, 'version');

    return this.db.transaction(async (tx) => {
      const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
      const current = await tx.get(
        `SELECT * FROM after_sales_cases
         WHERE id = ? AND customer_id = ?${lockClause}`,
        [caseId, customerId]
      );
      if (!current) throw new NotFoundError('售后申请');
      if (Number(current.version) !== expectedVersion) {
        throw new BusinessError(
          '售后申请已被更新，请刷新后重试',
          409,
          'AFTER_SALES_VERSION_CONFLICT'
        );
      }
      if (current.status !== 'submitted') {
        throw new BusinessError(
          '只有待审核的售后申请可以由顾客取消',
          409,
          'AFTER_SALES_NOT_CANCELLABLE'
        );
      }

      const nextVersion = expectedVersion + 1;
      const update = await tx.run(
        `UPDATE after_sales_cases
         SET status = ?, version = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND customer_id = ? AND status = ? AND version = ?`,
        ['cancelled', nextVersion, caseId, customerId, 'submitted', expectedVersion]
      );
      if (!update || update.changes !== 1) {
        throw new BusinessError(
          '售后申请已被并发更新',
          409,
          'AFTER_SALES_VERSION_CONFLICT'
        );
      }
      await tx.run(
        `INSERT INTO after_sales_history
           (case_id, from_status, to_status, actor_type, actor_id, note, version)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          caseId,
          'submitted',
          'cancelled',
          'customer',
          customerId,
          '顾客取消售后申请',
          nextVersion,
        ]
      );
      const updated = await tx.get('SELECT * FROM after_sales_cases WHERE id = ?', [caseId]);
      return normalizeCase(updated);
    });
  }
}

module.exports = AfterSalesService;
