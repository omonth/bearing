# 多语言支持（i18n）文档

## 概述

轴承销售系统已集成完整的国际化（i18n）支持，目前支持：

- ✅ **中文（简体）** - zh
- ✅ **英文** - en

可以轻松扩展到其他语言。

---

## 后端配置

### 1. 安装依赖

```bash
npm install i18next i18next-fs-backend i18next-http-middleware
```

### 2. 配置文件

`backend/config/i18n.js`：

```javascript
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const middleware = require('i18next-http-middleware');

i18next
  .use(Backend)
  .use(middleware.LanguageDetector)
  .init({
    fallbackLng: 'zh',
    supportedLngs: ['zh', 'en'],
    // ... 其他配置
  });
```

### 3. 语言文件结构

```
backend/locales/
├── zh/
│   ├── common.json      # 通用翻译
│   ├── errors.json      # 错误消息
│   └── emails.json      # 邮件模板
└── en/
    ├── common.json
    ├── errors.json
    └── emails.json
```

---

## 使用方法

### 1. 在Express中使用

```javascript
const { i18next, middleware } = require('./config/i18n');

app.use(middleware.handle(i18next));

// 在路由中使用
app.get('/api/test', (req, res) => {
  res.json({
    message: req.t('common:app.welcome')
  });
});
```

### 2. 语言检测

系统会按以下顺序检测语言：

1. **查询参数**: `?lang=en`
2. **Cookie**: `i18next=en`
3. **HTTP Header**: `Accept-Language: en-US,en;q=0.9`

示例：

```bash
# 使用查询参数
curl http://localhost:3001/api/bearings?lang=en

# 使用Header
curl -H "Accept-Language: en" http://localhost:3001/api/bearings
```

### 3. 在代码中使用

```javascript
// 基本翻译
req.t('common:auth.loginSuccess')
// 输出: "登录成功" (中文) 或 "Login successful" (英文)

// 带参数的翻译
req.t('errors:business.insufficientStock', { stock: 10 })
// 输出: "库存不足，当前库存：10"

// 使用命名空间
req.t('common:product.name')
req.t('errors:validation.required', { field: '用户名' })
```

---

## 翻译键结构

### common.json - 通用翻译

```json
{
  "app": {
    "name": "轴承销售系统",
    "welcome": "欢迎使用"
  },
  "auth": {
    "login": "登录",
    "logout": "登出"
  },
  "product": {
    "name": "产品名称",
    "price": "价格"
  }
}
```

### errors.json - 错误消息

```json
{
  "validation": {
    "required": "{{field}}不能为空",
    "invalid": "{{field}}格式不正确"
  },
  "api": {
    "rateLimitExceeded": "请求过于频繁"
  }
}
```

---

## API响应国际化

### 示例：产品列表API

```javascript
app.get('/api/bearings', (req, res) => {
  db.all('SELECT * FROM bearings', [], (err, rows) => {
    if (err) {
      return res.status(500).json({
        error: req.t('errors:database.queryFailed')
      });
    }

    res.json({
      message: req.t('common:success'),
      data: rows
    });
  });
});
```

### 响应示例

**中文 (zh)**:
```json
{
  "message": "操作成功",
  "data": [...]
}
```

**英文 (en)**:
```json
{
  "message": "Success",
  "data": [...]
}
```

---

## 前端集成

### React 示例

安装依赖：

```bash
npm install react-i18next i18next i18next-http-backend
```

配置 `src/i18n.js`：

```javascript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    fallbackLng: 'zh',
    supportedLngs: ['zh', 'en'],
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json'
    }
  });

export default i18n;
```

在组件中使用：

```jsx
import { useTranslation } from 'react-i18next';

function ProductList() {
  const { t, i18n } = useTranslation();

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div>
      <h1>{t('product.name')}</h1>
      <button onClick={() => changeLanguage('en')}>English</button>
      <button onClick={() => changeLanguage('zh')}>中文</button>
    </div>
  );
}
```

---

## 邮件模板国际化

### 创建邮件翻译文件

`backend/locales/zh/emails.json`：

```json
{
  "orderConfirmation": {
    "subject": "订单确认 - 订单号 {{orderId}}",
    "greeting": "尊敬的 {{customerName}}，",
    "thankYou": "感谢您的订单！",
    "orderInfo": "订单信息",
    "orderId": "订单编号",
    "totalAmount": "订单总额"
  }
}
```

`backend/locales/en/emails.json`：

```json
{
  "orderConfirmation": {
    "subject": "Order Confirmation - Order #{{orderId}}",
    "greeting": "Dear {{customerName}},",
    "thankYou": "Thank you for your order!",
    "orderInfo": "Order Information",
    "orderId": "Order ID",
    "totalAmount": "Total Amount"
  }
}
```

### 使用示例

```javascript
const sendOrderEmail = (order, language = 'zh') => {
  const t = i18next.getFixedT(language, 'emails');

  const subject = t('orderConfirmation.subject', { orderId: order.id });
  const greeting = t('orderConfirmation.greeting', { customerName: order.customer_name });

  // 发送邮件...
};
```

---

## 添加新语言

### 1. 创建语言文件

```bash
mkdir -p backend/locales/ja
cp backend/locales/zh/common.json backend/locales/ja/common.json
# 翻译内容...
```

### 2. 更新配置

```javascript
i18next.init({
  supportedLngs: ['zh', 'en', 'ja'],  // 添加日语
  preload: ['zh', 'en', 'ja']
});
```

### 3. 测试

```bash
curl http://localhost:3001/api/bearings?lang=ja
```

---

## 最佳实践

### 1. 翻译键命名

- 使用点号分隔命名空间：`common:product.name`
- 使用驼峰命名：`customerName` 而不是 `customer_name`
- 保持一致性

### 2. 参数化翻译

```json
{
  "welcome": "欢迎，{{name}}！",
  "itemCount": "共 {{count}} 件商品"
}
```

```javascript
t('welcome', { name: 'John' })
// 输出: "欢迎，John！"
```

### 3. 复数形式

```json
{
  "item": "{{count}} 件商品",
  "item_plural": "{{count}} 件商品"
}
```

### 4. 上下文翻译

```json
{
  "friend": "朋友",
  "friend_male": "男性朋友",
  "friend_female": "女性朋友"
}
```

---

## 性能优化

### 1. 预加载语言

```javascript
i18next.init({
  preload: ['zh', 'en']  // 启动时加载
});
```

### 2. 缓存翻译

```javascript
const cache = new Map();

function getCachedTranslation(key, lng) {
  const cacheKey = `${lng}:${key}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  const translation = i18next.t(key, { lng });
  cache.set(cacheKey, translation);
  return translation;
}
```

### 3. 按需加载

```javascript
i18next.init({
  backend: {
    loadPath: '/locales/{{lng}}/{{ns}}.json'
  },
  ns: ['common'],  // 只加载需要的命名空间
  defaultNS: 'common'
});
```

---

## 测试

### 单元测试

```javascript
const i18next = require('i18next');

describe('i18n', () => {
  it('should translate to Chinese', () => {
    const result = i18next.t('common:auth.login', { lng: 'zh' });
    expect(result).toBe('登录');
  });

  it('should translate to English', () => {
    const result = i18next.t('common:auth.login', { lng: 'en' });
    expect(result).toBe('Login');
  });
});
```

---

## 故障排查

### 翻译未生效

1. 检查语言文件路径是否正确
2. 确认语言代码是否在 `supportedLngs` 中
3. 查看控制台是否有加载错误

### 参数未替换

```javascript
// 错误
t('welcome', 'John')

// 正确
t('welcome', { name: 'John' })
```

### 命名空间问题

```javascript
// 使用完整路径
t('common:auth.login')

// 或设置默认命名空间
t('auth.login', { ns: 'common' })
```

---

## 工具推荐

### 1. 翻译管理平台

- **Lokalise** - https://lokalise.com/
- **Crowdin** - https://crowdin.com/
- **POEditor** - https://poeditor.com/

### 2. 自动翻译

```javascript
const translate = require('@vitalets/google-translate-api');

async function autoTranslate(text, to) {
  const result = await translate(text, { to });
  return result.text;
}
```

### 3. 翻译检查

```bash
# 检查缺失的翻译键
npm install -g i18next-scanner
i18next-scanner --config i18next-scanner.config.js
```

---

## 总结

多语言支持已完整集成，包括：

- ✅ 后端API国际化
- ✅ 错误消息翻译
- ✅ 邮件模板翻译
- ✅ 中英文支持
- ✅ 自动语言检测
- ✅ 参数化翻译

可根据需求轻松扩展到其他语言。
