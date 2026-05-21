# 订单地址字段升级说明

## 变更内容

订单表的收货地址字段已从单一的 `customer_address` 字段拆分为更详细的地址结构：

### 旧字段
- `customer_address` - 完整地址（已废弃）

### 新字段
- `province` - 省份（如：北京市、广东省）
- `city` - 城市（如：北京市、深圳市）
- `district` - 区/县（如：朝阳区、南山区）
- `address_detail` - 详细地址（如：某某街道123号）

---

## 数据库升级

### 1. 运行升级脚本

```bash
cd backend
node scripts/upgradeOrderAddress.js
```

该脚本会：
- ✅ 创建新的订单表结构
- ✅ 自动迁移现有订单数据
- ✅ 尝试解析旧地址格式
- ✅ 删除旧表并重命名新表

### 2. 验证升级结果

```bash
sqlite3 bearings.db "PRAGMA table_info(orders);"
```

应该看到新的字段：
- province
- city
- district
- address_detail

---

## API 变更

### 创建订单 API

**旧格式**:
```json
POST /api/orders
{
  "customerName": "张三",
  "customerPhone": "13800138000",
  "customerAddress": "北京市朝阳区某某街道123号",
  "items": [...]
}
```

**新格式**:
```json
POST /api/orders
{
  "customerName": "张三",
  "customerPhone": "13800138000",
  "province": "北京市",
  "city": "北京市",
  "district": "朝阳区",
  "addressDetail": "某某街道123号",
  "items": [...]
}
```

### 字段验证规则

- `province` - 必填，不能为空
- `city` - 必填，不能为空
- `district` - 必填，不能为空
- `addressDetail` - 必填，不能为空

---

## 前端集成示例

### React 表单示例

```jsx
import { Form, Input, Button, Cascader } from 'antd';
import { useState } from 'react';

// 省市区数据（可以使用 china-division 库）
const addressOptions = [
  {
    value: '北京市',
    label: '北京市',
    children: [
      {
        value: '北京市',
        label: '北京市',
        children: [
          { value: '朝阳区', label: '朝阳区' },
          { value: '海淀区', label: '海淀区' },
          { value: '丰台区', label: '丰台区' },
        ]
      }
    ]
  },
  {
    value: '广东省',
    label: '广东省',
    children: [
      {
        value: '深圳市',
        label: '深圳市',
        children: [
          { value: '南山区', label: '南山区' },
          { value: '福田区', label: '福田区' },
        ]
      },
      {
        value: '广州市',
        label: '广州市',
        children: [
          { value: '天河区', label: '天河区' },
          { value: '越秀区', label: '越秀区' },
        ]
      }
    ]
  }
];

function OrderForm() {
  const [form] = Form.useForm();
  const [address, setAddress] = useState([]);

  const onFinish = (values) => {
    const orderData = {
      customerName: values.customerName,
      customerPhone: values.customerPhone,
      province: address[0],
      city: address[1],
      district: address[2],
      addressDetail: values.addressDetail,
      items: values.items
    };

    // 提交订单
    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });
  };

  return (
    <Form form={form} onFinish={onFinish}>
      <Form.Item
        label="姓名"
        name="customerName"
        rules={[{ required: true, message: '请输入姓名' }]}
      >
        <Input placeholder="请输入收货人姓名" />
      </Form.Item>

      <Form.Item
        label="手机号"
        name="customerPhone"
        rules={[
          { required: true, message: '请输入手机号' },
          { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确' }
        ]}
      >
        <Input placeholder="请输入手机号" />
      </Form.Item>

      <Form.Item
        label="省市区"
        name="address"
        rules={[{ required: true, message: '请选择省市区' }]}
      >
        <Cascader
          options={addressOptions}
          onChange={setAddress}
          placeholder="请选择省/市/区"
        />
      </Form.Item>

      <Form.Item
        label="详细地址"
        name="addressDetail"
        rules={[{ required: true, message: '请输入详细地址' }]}
      >
        <Input.TextArea
          rows={3}
          placeholder="请输入详细地址，如街道、门牌号、楼栋单元等"
        />
      </Form.Item>

      <Form.Item>
        <Button type="primary" htmlType="submit">
          提交订单
        </Button>
      </Form.Item>
    </Form>
  );
}
```

### 显示完整地址

```jsx
function OrderDetail({ order }) {
  const fullAddress = `${order.province}${order.city}${order.district}${order.address_detail}`;

  return (
    <div>
      <p><strong>收货人：</strong>{order.customer_name}</p>
      <p><strong>手机号：</strong>{order.customer_phone}</p>
      <p><strong>收货地址：</strong>{fullAddress}</p>
    </div>
  );
}
```

---

## 省市区数据源

推荐使用以下库获取中国省市区数据：

### 1. china-division

```bash
npm install china-division
```

```javascript
import { provinces, cities, areas } from 'china-division';

// 获取所有省份
console.log(provinces);

// 获取某省的城市
const guangdongCities = cities.filter(city => city.provinceCode === '440000');

// 获取某市的区县
const shenzhenAreas = areas.filter(area => area.cityCode === '440300');
```

### 2. element-china-area-data

```bash
npm install element-china-area-data
```

```javascript
import { provinceAndCityData, regionData, CodeToText } from 'element-china-area-data';

// 省市数据
console.log(provinceAndCityData);

// 省市区数据
console.log(regionData);

// 根据code获取名称
console.log(CodeToText['110000']); // 北京市
```

---

## 导出功能更新

订单导出（Excel/PDF）已自动更新，会显示完整的地址信息：

```
收货地址：北京市北京市朝阳区某某街道123号
```

---

## 注意事项

1. **旧数据迁移**：升级脚本会尝试自动解析旧地址，但可能不够准确，建议手动检查重要订单的地址信息

2. **前端兼容**：需要更新前端代码以支持新的地址字段格式

3. **API兼容**：旧的 `customerAddress` 字段已不再使用，所有API调用需要更新

4. **数据验证**：新增了省市区的必填验证，确保地址信息完整

5. **备份数据**：升级前建议备份数据库：
   ```bash
   cp bearings.db bearings.db.backup
   ```

---

## 回滚方案

如果需要回滚到旧版本：

```bash
# 恢复备份
cp bearings.db.backup bearings.db

# 或者手动创建旧表结构
sqlite3 bearings.db "
CREATE TABLE orders_old (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  total_price REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
"
```

---

## 总结

地址字段拆分后的优势：

- ✅ 更规范的地址管理
- ✅ 便于地区统计分析
- ✅ 支持按省市区筛选订单
- ✅ 更好的数据质量
- ✅ 便于物流系统集成

升级完成后，系统将具备更专业的地址管理能力。
