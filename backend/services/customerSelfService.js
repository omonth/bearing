const bcrypt = require('bcryptjs');
const logger = require('../logger');
const { generateToken } = require('../middleware/auth');
const { ValidationError, UnauthorizedError, ConflictError } = require('../utils/errors');

class CustomerSelfService {
  constructor({ db, customerService, couponService, orderService, addressBookService, tokenFactory = generateToken }) {
    this.db = db;
    this.customerService = customerService;
    this.couponService = couponService;
    this.orderService = orderService;
    this.addressBookService = addressBookService;
    this.tokenFactory = tokenFactory;
  }

  async register({ name, phone, password }) {
    if (!phone || !password) {
      throw new ValidationError('手机号和密码不能为空');
    }

    const existing = await this.db.get('SELECT id FROM customers WHERE phone = ?', [phone]);
    if (existing) throw new ConflictError('该手机号已注册');

    const publicName = name || phone;
    const hashed = await bcrypt.hash(password, 10);
    const result = await this.db.run(
      'INSERT INTO customers (name, phone, password) VALUES (?, ?, ?)',
      [publicName, phone, hashed]
    );

    const token = this.tokenFactory(result.lastID, publicName, 'customer');
    logger.info('顾客注册成功', { id: result.lastID, phone });
    return {
      token,
      user: { id: result.lastID, phone, name: publicName, level: 'bronze', points: 0 },
    };
  }

  async login({ phone, password }) {
    if (!phone || !password) {
      throw new ValidationError('手机号和密码不能为空');
    }

    const customer = await this.db.get('SELECT * FROM customers WHERE phone = ?', [phone]);
    if (!customer) throw new UnauthorizedError('手机号未注册');
    if (!customer.password) {
      throw new UnauthorizedError('该账户未设置密码，请先注册');
    }

    const valid = await bcrypt.compare(password, customer.password);
    if (!valid) throw new UnauthorizedError('密码错误');

    const token = this.tokenFactory(customer.id, customer.name || phone, 'customer');
    logger.info('顾客登录成功', { id: customer.id, phone });
    return {
      token,
      user: {
        id: customer.id,
        phone,
        name: customer.name,
        level: customer.level,
        points: customer.points,
      },
    };
  }

  async getMe(customerId) {
    const data = await this.customerService.getById(customerId);
    if (data) delete data.password;
    return data;
  }

  async listOrders(customerId) {
    return this.orderService.listForCustomer(customerId);
  }

  async getOrder(customerId, orderId) {
    return this.orderService.getForCustomer(customerId, orderId);
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
