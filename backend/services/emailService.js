const nodemailer = require('nodemailer');
const logger = require('../logger');

// 邮件配置
const emailConfig = {
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
};

// 创建邮件传输器
let transporter = null;

function initEmailService() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    logger.warn('邮件服务未配置，邮件通知功能将不可用');
    return null;
  }

  transporter = nodemailer.createTransport(emailConfig);

  // 验证配置
  transporter.verify((error, success) => {
    if (error) {
      logger.error('邮件服务配置错误', { error: error.message });
    } else {
      logger.info('邮件服务已就绪');
    }
  });

  return transporter;
}

// 发送邮件
async function sendEmail({ to, subject, html, text }) {
  if (!transporter) {
    logger.warn('邮件服务未初始化，跳过发送');
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: `"轴承销售系统" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html
    });

    logger.info('邮件发送成功', { to, subject, messageId: info.messageId });
    return true;
  } catch (error) {
    logger.error('邮件发送失败', { to, subject, error: error.message });
    return false;
  }
}

// 订单确认邮件
async function sendOrderConfirmation(order, items) {
  const itemsHtml = items.map(item => `
    <tr>
      <td>${item.name} (${item.model})</td>
      <td>${item.quantity}</td>
      <td>¥${item.price}</td>
      <td>¥${(item.quantity * item.price).toFixed(2)}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f0f0f0; }
        .total { font-size: 18px; font-weight: bold; text-align: right; margin-top: 20px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>订单确认</h1>
        </div>
        <div class="content">
          <p>尊敬的 ${order.customer_name}，</p>
          <p>感谢您的订单！我们已收到您的订单，正在处理中。</p>

          <h3>订单信息</h3>
          <p><strong>订单编号：</strong>${order.id}</p>
          <p><strong>下单时间：</strong>${order.created_at}</p>
          <p><strong>收货地址：</strong>${[order.province, order.city, order.district, order.address_detail].filter(Boolean).join(' ')}</p>
          <p><strong>联系电话：</strong>${order.customer_phone}</p>

          <h3>订单明细</h3>
          <table>
            <thead>
              <tr>
                <th>产品</th>
                <th>数量</th>
                <th>单价</th>
                <th>小计</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="total">
            订单总额：¥${order.total_price}
          </div>

          <p>我们会尽快为您安排发货，请保持电话畅通。</p>
        </div>
        <div class="footer">
          <p>此邮件由系统自动发送，请勿回复。</p>
          <p>如有疑问，请联系客服。</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // 如果订单中有邮箱，发送邮件（这里假设从客户信息中获取）
  // 实际应用中需要在订单表中添加email字段
  const customerEmail = order.customer_email || process.env.ADMIN_EMAIL;

  if (customerEmail) {
    return await sendEmail({
      to: customerEmail,
      subject: `订单确认 - 订单号 ${order.id}`,
      html
    });
  }

  return false;
}

// 发货通知邮件
async function sendShippingNotification(order) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2196F3; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .tracking { background: #fff; padding: 15px; border-left: 4px solid #2196F3; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>订单已发货</h1>
        </div>
        <div class="content">
          <p>尊敬的 ${order.customer_name}，</p>
          <p>您的订单已发货！</p>

          <h3>订单信息</h3>
          <p><strong>订单编号：</strong>${order.id}</p>
          <p><strong>发货时间：</strong>${order.shipped_at}</p>

          ${order.tracking_number ? `
          <div class="tracking">
            <h3>物流信息</h3>
            <p><strong>物流单号：</strong>${order.tracking_number}</p>
            <p>您可以使用此单号查询物流信息。</p>
          </div>
          ` : ''}

          <p>预计3-5个工作日送达，请注意查收。</p>
        </div>
        <div class="footer">
          <p>此邮件由系统自动发送，请勿回复。</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const customerEmail = order.customer_email || process.env.ADMIN_EMAIL;

  if (customerEmail) {
    return await sendEmail({
      to: customerEmail,
      subject: `订单已发货 - 订单号 ${order.id}`,
      html
    });
  }

  return false;
}

// 低库存预警邮件
async function sendLowStockAlert(products) {
  const productsHtml = products.map(p => `
    <tr>
      <td>${p.name}</td>
      <td>${p.model}</td>
      <td style="color: red; font-weight: bold;">${p.stock}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #FF9800; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f0f0f0; }
        .warning { background: #fff3cd; padding: 15px; border-left: 4px solid #FF9800; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⚠️ 库存预警</h1>
        </div>
        <div class="content">
          <div class="warning">
            <strong>注意：</strong>以下产品库存不足，请及时补货！
          </div>

          <table>
            <thead>
              <tr>
                <th>产品名称</th>
                <th>型号</th>
                <th>当前库存</th>
              </tr>
            </thead>
            <tbody>
              ${productsHtml}
            </tbody>
          </table>

          <p>请尽快安排补货，避免影响销售。</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const adminEmail = process.env.ADMIN_EMAIL;

  if (adminEmail) {
    return await sendEmail({
      to: adminEmail,
      subject: '⚠️ 库存预警通知',
      html
    });
  }

  return false;
}

module.exports = {
  initEmailService,
  sendEmail,
  sendOrderConfirmation,
  sendShippingNotification,
  sendLowStockAlert
};
