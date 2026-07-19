const bcrypt = require('bcryptjs');
const logger = require('../logger');
const { generateCustomerToken } = require('../middleware/auth');
const {
  ValidationError,
  UnauthorizedError,
  ConflictError,
  NotFoundError,
} = require('../utils/errors');
const CustomerSecurityService = require('./customerSecurityService');

const PROFILE_FIELDS = new Set(['name', 'email', 'company']);
const GENERIC_LOGIN_ERROR = '手机号或密码错误';
const DUMMY_PASSWORD_HASH = '$2b$10$C84RtBLD5qZjINso0ykEbublUglHL0uBNezsXPrv5TEg0UiC6eOUW';

class CustomerSelfService {
  constructor({
    db,
    customerService,
    couponService,
    orderService,
    addressBookService,
    securityService,
    tokenFactory = generateCustomerToken,
  }) {
    this.db = db;
    this.customerService = customerService;
    this.couponService = couponService;
    this.orderService = orderService;
    this.addressBookService = addressBookService;
    this.securityService = securityService || new CustomerSecurityService({ db });
    this.tokenFactory = tokenFactory;
  }

  async register({ name, phone, password }) {
    if (!phone || !password) {
      throw new ValidationError('手机号和密码不能为空');
    }

    const normalizedPhone = CustomerSecurityService.normalizePhone(phone);
    if (!normalizedPhone) throw new ValidationError('手机号格式无效', 'phone');

    const existing = await this.db.get('SELECT id FROM customers WHERE phone = ?', [normalizedPhone]);
    if (existing) throw new ConflictError('该手机号已注册');

    CustomerSecurityService.validatePassword(password);
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (normalizedName.length > 80) throw new ValidationError('姓名不能超过 80 个字符', 'name');

    const publicName = normalizedName || normalizedPhone;
    const hashed = await bcrypt.hash(password, 10);
    const result = await this.db.run(
      'INSERT INTO customers (name, phone, password) VALUES (?, ?, ?)',
      [publicName, normalizedPhone, hashed]
    );

    const token = this.tokenFactory(result.lastID, publicName, hashed);
    logger.info('顾客注册成功', { id: result.lastID });
    return {
      token,
      user: {
        id: result.lastID,
        phone: normalizedPhone,
        name: publicName,
        level: 'bronze',
        points: 0,
      },
    };
  }

  async login({ phone, password }) {
    if (!phone || !password) {
      throw new ValidationError('手机号和密码不能为空');
    }

    const normalizedPhone = CustomerSecurityService.normalizePhone(phone);
    const customer = normalizedPhone
      ? await this.db.get('SELECT * FROM customers WHERE phone = ?', [normalizedPhone])
      : null;
    const valid = await bcrypt.compare(password, customer?.password || DUMMY_PASSWORD_HASH);
    if (!customer || customer.status !== 'active' || !customer.password || !valid) {
      throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
    }

    const token = this.tokenFactory(customer.id, customer.name || normalizedPhone, customer.password);
    logger.info('顾客登录成功', { id: customer.id });
    return {
      token,
      user: {
        id: customer.id,
        phone: normalizedPhone,
        name: customer.name,
        level: customer.level,
        points: customer.points,
      },
    };
  }

  async getMe(customerId) {
    const customer = await this.db.get(
      `SELECT id, name, phone, email, company, level, points, total_spent,
              total_orders, status, created_at, updated_at
       FROM customers WHERE id = ?`,
      [customerId]
    );
    if (!customer) throw new NotFoundError('顾客');
    return customer;
  }

  async updateProfile(customerId, input) {
    const fields = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const unknownFields = Object.keys(fields).filter((field) => !PROFILE_FIELDS.has(field));
    if (unknownFields.length > 0) {
      throw new ValidationError(`不允许修改字段：${unknownFields.join(', ')}`);
    }

    const updates = [];
    const params = [];
    if (Object.prototype.hasOwnProperty.call(fields, 'name')) {
      const name = typeof fields.name === 'string' ? fields.name.trim() : '';
      if (!name || name.length > 80) throw new ValidationError('姓名长度必须为 1 至 80 个字符', 'name');
      updates.push('name = ?');
      params.push(name);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'email')) {
      const email = typeof fields.email === 'string' ? fields.email.trim().toLowerCase() : '';
      if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        throw new ValidationError('邮箱格式无效', 'email');
      }
      updates.push('email = ?');
      params.push(email || null);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'company')) {
      const company = typeof fields.company === 'string' ? fields.company.trim() : '';
      if (company.length > 120) throw new ValidationError('公司名称不能超过 120 个字符', 'company');
      updates.push('company = ?');
      params.push(company || null);
    }
    if (updates.length === 0) throw new ValidationError('没有可更新的资料字段');

    updates.push('updated_at = CURRENT_TIMESTAMP');
    const result = await this.db.run(
      `UPDATE customers SET ${updates.join(', ')} WHERE id = ? AND status = ?`,
      [...params, customerId, 'active']
    );
    if (!result || result.changes !== 1) {
      throw new NotFoundError('顾客');
    }
    const customer = await this.db.get(
      `SELECT id, name, phone, email, company, level, points, created_at, updated_at
       FROM customers WHERE id = ?`,
      [customerId]
    );
    logger.info('顾客资料已更新', { customerId, fields: Object.keys(fields) });
    return customer;
  }

  async requestPasswordReset(input) {
    return this.securityService.requestPasswordReset(input || {});
  }

  async resetPassword(input) {
    return this.securityService.resetPassword(input || {});
  }

  async requestPhoneVerification(customerId) {
    return this.securityService.requestPhoneVerification(customerId);
  }

  async confirmPhoneVerification(customerId, code) {
    return this.securityService.confirmPhoneVerification(customerId, code);
  }

  async listOrders(customerId) {
    return this.orderService.listForCustomer(customerId);
  }

  async getOrder(customerId, orderId) {
    return this.orderService.getForCustomer(customerId, orderId);
  }

  async cancelOrder(customerId, orderId) {
    return this.orderService.cancelForCustomer(customerId, orderId);
  }

  async listCoupons(customerId) {
    return this.couponService.listForCustomer(customerId);
  }

  async useCoupon({ customerId, code, orderId }) {
    if (!code || !orderId) {
      throw new ValidationError('请提供优惠券代码和订单ID');
    }
    return this.couponService.use({ code, customerId, orderId });
  }

  async listAddresses(customerId) {
    return this.addressBookService.list(customerId);
  }

  async createAddress(customerId, input) {
    return this.addressBookService.create(customerId, input);
  }

  async updateAddress(customerId, addressId, input) {
    return this.addressBookService.update(customerId, addressId, input);
  }

  async deleteAddress(customerId, addressId) {
    return this.addressBookService.delete(customerId, addressId);
  }
}

module.exports = CustomerSelfService;
