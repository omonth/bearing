const bcrypt = require('bcryptjs');
const logger = require('../logger');
const { generateToken } = require('../middleware/auth');

class CustomerSelfService {
  constructor({ db, customerService, couponService, orderService, tokenFactory = generateToken }) {
    this.db = db;
    this.customerService = customerService;
    this.couponService = couponService;
    this.orderService = orderService;
    this.tokenFactory = tokenFactory;
  }

  async register({ name, phone, password }) {
    try {
      if (!phone || !password) {
        return { data: null, error: '手机号和密码不能为空', status: 400 };
      }

      const existing = await this.db.get('SELECT id FROM customers WHERE phone = ?', [phone]);
      if (existing) return { data: null, error: '该手机号已注册', status: 400 };

      const publicName = name || phone;
      const hashed = await bcrypt.hash(password, 10);
      const result = await this.db.run(
        'INSERT INTO customers (name, phone, password) VALUES (?, ?, ?)',
        [publicName, phone, hashed]
      );

      const token = this.tokenFactory(result.lastID, publicName, 'customer');
      logger.info('顾客注册成功', { id: result.lastID, phone });
      return {
        data: {
          token,
          user: { id: result.lastID, phone, name: publicName, level: 'bronze', points: 0 },
        },
        error: null,
      };
    } catch (error) {
      logger.error('顾客注册失败', { error: error.message });
      return { data: null, error: '注册失败', status: 500 };
    }
  }

  async login({ phone, password }) {
    try {
      if (!phone || !password) {
        return { data: null, error: '手机号和密码不能为空', status: 400 };
      }

      const customer = await this.db.get('SELECT * FROM customers WHERE phone = ?', [phone]);
      if (!customer) return { data: null, error: '手机号未注册', status: 401 };
      if (!customer.password) {
        return { data: null, error: '该账户未设置密码，请先注册', status: 401 };
      }

      const valid = await bcrypt.compare(password, customer.password);
      if (!valid) return { data: null, error: '密码错误', status: 401 };

      const token = this.tokenFactory(customer.id, customer.name || phone, 'customer');
      logger.info('顾客登录成功', { id: customer.id, phone });
      return {
        data: {
          token,
          user: {
            id: customer.id,
            phone,
            name: customer.name,
            level: customer.level,
            points: customer.points,
          },
        },
        error: null,
      };
    } catch (error) {
      logger.error('顾客登录失败', { error: error.message });
      return { data: null, error: '登录失败', status: 500 };
    }
  }

  async getMe(customerId) {
    const result = await this.customerService.getById(customerId);
    if (result.data) delete result.data.password;
    return result;
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
      return { data: null, error: '请提供优惠券代码和订单ID', status: 400 };
    }
    return this.couponService.use({ code, customerId, orderId });
  }
}

module.exports = CustomerSelfService;
