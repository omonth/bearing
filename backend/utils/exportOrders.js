const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// 导出订单为Excel
const exportOrdersToExcel = async (orders, orderItems) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('订单列表');

  // 设置列
  worksheet.columns = [
    { header: '订单ID', key: 'id', width: 10 },
    { header: '客户姓名', key: 'customer_name', width: 15 },
    { header: '联系电话', key: 'customer_phone', width: 15 },
    { header: '省份', key: 'province', width: 10 },
    { header: '城市', key: 'city', width: 10 },
    { header: '区/县', key: 'district', width: 10 },
    { header: '详细地址', key: 'address_detail', width: 30 },
    { header: '订单金额', key: 'total_price', width: 12 },
    { header: '订单状态', key: 'status', width: 12 },
    { header: '物流单号', key: 'tracking_number', width: 20 },
    { header: '创建时间', key: 'created_at', width: 20 }
  ];

  // 添加数据
  orders.forEach(order => {
    worksheet.addRow({
      id: order.id,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      province: order.province || '',
      city: order.city || '',
      district: order.district || '',
      address_detail: order.address_detail || '',
      total_price: `¥${order.total_price}`,
      status: getStatusText(order.status),
      tracking_number: order.tracking_number || '-',
      created_at: order.created_at
    });
  });

  // 样式设置
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  return workbook;
};

// 导出单个订单为PDF
const exportOrderToPDF = async (order, items) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // 标题
    doc.fontSize(20).text('订单详情', { align: 'center' });
    doc.moveDown();

    // 订单信息
    doc.fontSize(12);
    doc.text(`订单编号: ${order.id}`);
    doc.text(`客户姓名: ${order.customer_name}`);
    doc.text(`联系电话: ${order.customer_phone}`);
    doc.text(`收货地址: ${[order.province, order.city, order.district, order.address_detail].filter(Boolean).join(' ')}`);
    doc.text(`订单状态: ${getStatusText(order.status)}`);
    if (order.tracking_number) {
      doc.text(`物流单号: ${order.tracking_number}`);
    }
    doc.text(`创建时间: ${order.created_at}`);
    doc.moveDown();

    // 订单项目
    doc.fontSize(14).text('订单明细:', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(10);
    items.forEach((item, index) => {
      doc.text(`${index + 1}. ${item.name} (${item.model})`);
      doc.text(`   数量: ${item.quantity}  单价: ¥${item.price}  小计: ¥${item.quantity * item.price}`);
      doc.moveDown(0.5);
    });

    // 总计
    doc.moveDown();
    doc.fontSize(14).text(`订单总额: ¥${order.total_price}`, { align: 'right' });

    doc.end();
  });
};

// 状态文本映射
const getStatusText = (status) => {
  const statusMap = {
    'pending': '待付款',
    'paid': '已付款',
    'shipped': '已发货',
    'completed': '已完成',
    'cancelled': '已取消'
  };
  return statusMap[status] || status;
};

module.exports = {
  exportOrdersToExcel,
  exportOrderToPDF
};
