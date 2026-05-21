# 轴承销售系统 v2.0

一个企业级的轴承销售管理系统，包含前端商城和后端管理功能，适用于实际工厂生产环境。

## ✨ 核心特性

### 🔐 安全性
- **JWT 认证系统** - 管理员登录、Token 管理
- **API 限流保护** - 防止恶意请求
- **密码加密** - bcrypt 加密存储
- **XSS 防护** - helmet 中间件
- **SQL 注入防护** - 参数化查询

### ⚡ 性能优化
- **Redis 缓存** - 热门数据缓存，提升响应速度
- **全文搜索** - SQLite FTS5 引擎，支持中文分词
- **数据库索引** - 优化查询性能
- **自动降级** - Redis 不可用时自动切换

### 📊 数据分析
- **销售趋势分析** - 按天/周/月统计
- **产品销量排行** - 热销产品追踪
- **客户地区分布** - 地域销售分析
- **实时销售监控** - 24小时实时数据
- **库存预警系统** - 低库存提醒、补货建议

### 🤖 智能推荐
- **协同过滤推荐** - 基于用户行为
- **相似产品推荐** - 基于产品属性
- **个性化推荐** - 基于购买历史
- **热销产品推荐** - 实时热销榜单

### 📦 订单管理
- **订单状态流转** - 待付款→已付款→已发货→已完成
- **物流追踪** - 物流单号记录
- **批量操作** - 批量发货、批量取消
- **订单导出** - Excel/PDF 格式导出

### 🔍 高级搜索
- **全文搜索** - 支持产品名称、型号搜索
- **多条件筛选** - 分类、价格、库存筛选
- **搜索建议** - 自动补全功能
- **排序功能** - 价格、库存、名称排序

### 🐳 DevOps
- **Docker 支持** - 容器化部署
- **Kubernetes 配置** - 生产级编排
- **CI/CD 自动化** - GitHub Actions
- **健康检查** - 自动监控和恢复

## 🚀 快速开始

### 开发环境

1. **安装依赖**:
```bash
# 安装前端依赖
npm install

# 安装后端依赖
cd backend
npm install
cd ..
```

2. **初始化数据库**:
```bash
cd backend
node initDatabase.js
node scripts/createAdmin.js
node scripts/createSearchIndex.js
cd ..
```

3. **配置环境变量**:
```bash
# 复制配置文件
cp .env.example .env
cp backend/.env.example backend/.env

# 编辑 backend/.env，设置 JWT_SECRET
```

4. **启动服务**:
```bash
# Linux/macOS
chmod +x start.sh
./start.sh

# Windows
start.bat
```

5. **访问应用**:
- 前端商城: http://localhost:3000
- 后端API: http://localhost:3001
- 管理后台: http://localhost:3001/admin.html

**默认管理员账号**:
- 用户名: `admin`
- 密码: `admin123`
- ⚠️ 登录后请立即修改密码！

### 生产环境（Docker）

```bash
# 配置环境变量
cp .env.production.example .env.production
# 编辑 .env.production，设置安全的密码和密钥

# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

详细部署文档请参考 [DOCKER-DEPLOYMENT.md](./DOCKER-DEPLOYMENT.md)

## 📚 文档

- [API 文档](./API-DOCUMENTATION.md) - 完整的 API 接口文档
- [Docker 部署指南](./DOCKER-DEPLOYMENT.md) - Docker 和 Kubernetes 部署
- [功能清单](./FEATURES.md) - 已实现和计划中的功能
- [部署文档](./DEPLOYMENT.md) - 通用部署指南
- [快速参考](./QUICK-REFERENCE.md) - 常用命令和操作

# 根据需要修改配置
```

3. 初始化数据库:
```bash
cd backend
npm run init-db
cd ..
```

4. 启动服务:
```bash
# Linux/macOS
chmod +x start.sh
./start.sh

# Windows
start.bat
```

5. 访问应用:
- 前端商城: http://localhost:3000
- 后端API: http://localhost:3001
- 管理后台: http://localhost:3001/admin.html

### 生产环境

详细的生产环境部署说明请参考 [DEPLOYMENT.md](./DEPLOYMENT.md)

快速部署:
```bash
chmod +x start-prod.sh
./start-prod.sh
```

## 技术栈

### 前端
- React 18
- CSS3
- Fetch API

### 后端
- Node.js
- Express.js
- SQLite3
- Winston (日志)
- Express-validator (数据验证)

### 部署
- PM2 (进程管理)
- Nginx (反向代理，可选)

## 项目结构

```
bearing-sales/
├── backend/                 # 后端代码
│   ├── server.js           # Express 服务器
│   ├── initDatabase.js     # 数据库初始化
│   ├── backup.js           # 数据库备份
│   ├── logger.js           # 日志配置
│   ├── bearings.db         # SQLite 数据库
│   ├── public/             # 静态文件
│   │   └── admin.html      # 管理后台
│   ├── logs/               # 日志文件
│   └── backups/            # 数据库备份
├── src/                    # 前端源代码
│   ├── components/         # React 组件
│   │   ├── Header.js
│   │   ├── ProductList.js
│   │   ├── ProductDetail.js
│   │   └── Cart.js
│   ├── App.js
│   └── index.js
├── public/                 # 前端静态资源
├── .env                    # 前端环境配置
├── .env.example            # 前端配置示例
├── start.sh                # 开发环境启动脚本
├── start.bat               # Windows 启动脚本
├── start-prod.sh           # 生产环境启动脚本
├── ecosystem.config.json   # PM2 配置
├── package.json
├── README.md
└── DEPLOYMENT.md           # 部署文档
```

## API 接口

### 产品相关
- `GET /api/bearings` - 获取所有产品
- `GET /api/bearings/:id` - 获取单个产品
- `GET /api/categories` - 获取所有分类
- `POST /api/bearings` - 添加产品
- `DELETE /api/bearings/:id` - 删除产品
- `PUT /api/bearings/:id/stock` - 更新库存

### 订单相关
- `GET /api/orders` - 获取所有订单
- `GET /api/orders/:id/items` - 获取订单详情
- `POST /api/orders` - 创建订单

## 数据库结构

### bearings 表（轴承产品）
- id: 主键
- name: 产品名称
- model: 型号
- price: 价格
- image: 图片URL
- category: 分类
- inner_diameter: 内径
- outer_diameter: 外径
- width: 宽度
- stock: 库存
- description: 描述
- created_at: 创建时间
- updated_at: 更新时间

### orders 表（订单）
- id: 主键
- customer_name: 客户姓名
- customer_phone: 联系电话
- customer_address: 收货地址
- total_price: 总价
- status: 订单状态
- created_at: 创建时间

### order_items 表（订单项）
- id: 主键
- order_id: 订单ID
- bearing_id: 产品ID
- quantity: 数量
- price: 单价

## 维护操作

### 数据库备份
```bash
cd backend
npm run backup
```

### 查看日志
```bash
# PM2 日志
pm2 logs

# 应用日志
tail -f backend/logs/combined.log
tail -f backend/logs/error.log
```

### 重启服务
```bash
pm2 restart bearing-sales-backend
```

## 安全建议

1. 修改默认端口
2. 配置 CORS 白名单
3. 使用 HTTPS
4. 定期备份数据库
5. 定期更新依赖包
6. 使用反向代理（Nginx）
7. 配置防火墙

详细安全配置请参考 [DEPLOYMENT.md](./DEPLOYMENT.md)

## 常见问题

### 端口被占用
修改 `backend/.env` 中的 PORT 配置

### 数据库初始化失败
确保有写入权限，手动运行:
```bash
cd backend
node initDatabase.js
```

### 前端无法连接后端
检查 `.env` 中的 `REACT_APP_API_URL` 配置

更多问题请参考 [DEPLOYMENT.md](./DEPLOYMENT.md) 的故障排查章节

## 开发计划

- [ ] 用户认证系统
- [ ] 订单状态流转
- [ ] 支付集成
- [ ] 邮件通知
- [ ] 数据导出功能
- [ ] 移动端优化

## 许可证

MIT License

## 联系方式

如有问题或建议，请联系技术支持团队。
