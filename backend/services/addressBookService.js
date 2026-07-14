const { NotFoundError, ValidationError } = require('../utils/errors');

const PHONE_PATTERN = /^1\d{10}$/;

function requiredText(value, field, maximumLength) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field}不能为空`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new ValidationError(`${field}不能为空`);
  }
  if (normalized.length > maximumLength) {
    throw new ValidationError(`${field}不能超过${maximumLength}个字符`);
  }
  return normalized;
}

function optionalText(value, field, maximumLength) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return requiredText(value, field, maximumLength);
}

function addressFromRow(row) {
  return {
    id: Number(row.id),
    customerId: Number(row.customer_id),
    recipientName: row.recipient_name,
    recipientPhone: row.recipient_phone,
    province: row.province,
    city: row.city,
    district: row.district,
    addressDetail: row.address_detail,
    postalCode: row.postal_code,
    isDefault: Number(row.is_default) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class AddressBookService {
  constructor(db) {
    this.db = db;
  }

  validateAddress(input) {
    const recipientPhone = requiredText(input.recipientPhone, '收货人手机号', 20);
    if (!PHONE_PATTERN.test(recipientPhone)) {
      throw new ValidationError('收货人手机号格式不正确');
    }

    return {
      recipientName: requiredText(input.recipientName, '收货人姓名', 80),
      recipientPhone,
      province: requiredText(input.province, '省份', 80),
      city: requiredText(input.city, '城市', 80),
      district: requiredText(input.district, '区县', 80),
      addressDetail: requiredText(input.addressDetail, '详细地址', 200),
      postalCode: optionalText(input.postalCode, '邮政编码', 20),
      isDefault: input.isDefault === true,
    };
  }

  async lockCustomer(tx, customerId) {
    if (this.db.type === 'postgres') {
      await tx.get('SELECT id FROM customers WHERE id = ? FOR UPDATE', [customerId]);
    }
  }

  async getOwnedAddress(executor, customerId, addressId) {
    const address = await executor.get(
      'SELECT * FROM customer_addresses WHERE id = ? AND customer_id = ?',
      [addressId, customerId]
    );
    if (!address) {
      throw new NotFoundError('收货地址');
    }
    return address;
  }

  async list(customerId) {
    const addresses = await this.db.all(
      `SELECT * FROM customer_addresses
       WHERE customer_id = ?
       ORDER BY is_default DESC, updated_at DESC, id DESC`,
      [customerId]
    );
    return addresses.map(addressFromRow);
  }

  async create(customerId, input) {
    const address = this.validateAddress(input);
    return this.db.transaction(async (tx) => {
      await this.lockCustomer(tx, customerId);
      const defaultAddress = await tx.get(
        'SELECT id FROM customer_addresses WHERE customer_id = ? AND is_default = 1',
        [customerId]
      );
      const isDefault = address.isDefault || !defaultAddress;

      if (isDefault) {
        await tx.run('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?', [customerId]);
      }

      const result = await tx.run(
        `INSERT INTO customer_addresses (
          customer_id, recipient_name, recipient_phone, province, city, district,
          address_detail, postal_code, is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerId,
          address.recipientName,
          address.recipientPhone,
          address.province,
          address.city,
          address.district,
          address.addressDetail,
          address.postalCode,
          isDefault ? 1 : 0,
        ]
      );
      const created = await this.getOwnedAddress(tx, customerId, result.lastID);
      return addressFromRow(created);
    });
  }

  async update(customerId, addressId, input) {
    if (!Number.isInteger(addressId) || addressId <= 0) {
      throw new ValidationError('收货地址ID无效');
    }
    const address = this.validateAddress(input);
    return this.db.transaction(async (tx) => {
      await this.lockCustomer(tx, customerId);
      const current = await this.getOwnedAddress(tx, customerId, addressId);
      const otherDefault = await tx.get(
        `SELECT id FROM customer_addresses
         WHERE customer_id = ? AND id != ? AND is_default = 1`,
        [customerId, addressId]
      );
      const isDefault = address.isDefault || (Number(current.is_default) === 1 && !otherDefault);

      if (isDefault) {
        await tx.run(
          'UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ? AND id != ?',
          [customerId, addressId]
        );
      }

      await tx.run(
        `UPDATE customer_addresses
         SET recipient_name = ?, recipient_phone = ?, province = ?, city = ?, district = ?,
             address_detail = ?, postal_code = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND customer_id = ?`,
        [
          address.recipientName,
          address.recipientPhone,
          address.province,
          address.city,
          address.district,
          address.addressDetail,
          address.postalCode,
          isDefault ? 1 : 0,
          addressId,
          customerId,
        ]
      );
      const updated = await this.getOwnedAddress(tx, customerId, addressId);
      return addressFromRow(updated);
    });
  }

  async delete(customerId, addressId) {
    if (!Number.isInteger(addressId) || addressId <= 0) {
      throw new ValidationError('收货地址ID无效');
    }
    return this.db.transaction(async (tx) => {
      await this.lockCustomer(tx, customerId);
      const current = await this.getOwnedAddress(tx, customerId, addressId);
      await tx.run('DELETE FROM customer_addresses WHERE id = ? AND customer_id = ?', [addressId, customerId]);

      if (Number(current.is_default) === 1) {
        const nextDefault = await tx.get(
          `SELECT id FROM customer_addresses
           WHERE customer_id = ?
           ORDER BY updated_at DESC, id DESC
           LIMIT 1`,
          [customerId]
        );
        if (nextDefault) {
          await tx.run('UPDATE customer_addresses SET is_default = 1 WHERE id = ?', [nextDefault.id]);
        }
      }

      return { id: addressId };
    });
  }
}

module.exports = AddressBookService;
