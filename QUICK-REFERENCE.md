# 轴承销售系统 - 快速参考指南

## 一键安装

```bash
# Linux/macOS
chmod +x install.sh && ./install.sh

# Windows
install.bat
```

## 一键启动

### 开发环境
```bash
# Linux/macOS
./start.sh

# Windows
start.bat
```

### 生产环境
```bash
# 首次部署
npm install -g pm2
chmod +x start-prod.sh
./start-prod.sh

# 后续启动
pm2 start bearing-sales-backend
```

## 访问地址

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端商城 | http://localhost:3000 | 客户购物界面 |
| 后端API | http://localhost:3001 | RESTful API |
| 管理后台 | http://localhost:3001/admin.html | 产品/订单管理 |

## 常用命令

### 数据库操作
```bash
# 初始化数据库
cd backend && npm run init-db

# 备份数据库
cd backend && npm run backup

# 恢复数据库
cp backend/backups/bearings_backup_*.db backend/bearings.db
```

### PM2 操作
```bash
pm2 status                    # 查看状态
pm2 logs                      # 查看日志
pm2 restart bearing-sales-backend  # 重启
pm2 stop bearing-sales-backend     # 停止
pm2 delete bearing-sales-backend   # 删除
pm2 monit                     # 监控
```

### 日志查看
```bash
# 应用日志
tail -f backend/logs/combined.log
tail -f backend/logs/error.log

# PM2日志
pm2 logs bearing-sales-backend
```

## API接口

### 产品接口
```bash
# 获取所有产品
GET /api/bearings

# 获取单个产品
GET /api/bearings/:id

# 获取分类
GET /api/categories

# 添加产品
POST /api/bearings

# 删除产品
DELETE /api/bearings/:id

# 更新库存
PUT /api/bearings/:id/stock
```

### 订单接口
```bash
# 获取所有订单
GET /api/orders

# 获取订单详情
GET /api/orders/:id/items

# 创建订单
POST /api/orders
```

## 配置文件

### 后端配置 (backend/.env)
```env
PORT=3001
NODE_ENV=production
DB_PATH=./bearings.db
CORS_ORIGIN=http://your-domain.com
LOG_LEVEL=info
LOG_DIR=./logs
BACKUP_DIR=./backups
```

### 前端配置 (.env)
```env
REACT_APP_API_URL=http://your-domain.com:3001/api
```

## 故障排查

### 端口被占用
```bash
# Linux/macOS
lsof -i :3001
kill -9 <PID>

# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

### 数据库错误
```bash
cd backend
rm bearings.db
npm run init-db
```

### CORS错误
修改 `backend/.env` 中的 `CORS_ORIGIN`

### 前端无法连接
检查 `.env` 中的 `REACT_APP_API_URL`

## 安全检查

- [ ] 修改默认端口
- [ ] 配置CORS白名单
- [ ] 启用HTTPS
- [ ] 配置防火墙
- [ ] 设置数据库权限 (chmod 600)
- [ ] 定期备份数据
- [ ] 定期更新依赖

## 性能优化

```bash
# PM2集群模式
pm2 start ecosystem.config.json -i max

# 数据库优化
sqlite3 backend/bearings.db "VACUUM;"

# 清理日志
find backend/logs -name "*.log" -mtime +30 -delete
```

## 监控设置

```bash
# PM2监控
pm2 plus

# 健康检查（cron）
*/5 * * * * curl -f http://localhost:3001/api/bearings || pm2 restart bearing-sales-backend

# 自动备份（cron）
0 3 * * * cd /path/to/backend && npm run backup
```

## 文档链接

- [README.md](./README.md) - 项目说明
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 详细部署文档
- [CHECKLIST.md](./CHECKLIST.md) - 部署检查清单
- [PRODUCTION-READY.md](./PRODUCTION-READY.md) - 改造总结

## 技术栈

**前端:** React 18, CSS3  
**后端:** Node.js, Express, SQLite  
**工具:** PM2, Winston, Express-validator  
**部署:** Nginx (可选), Let's Encrypt (可选)

## 系统要求

- Node.js v14+
- npm v6+
- 2GB RAM
- 10GB 磁盘空间

## 快速测试

```bash
# 测试后端API
curl http://localhost:3001/api/bearings

# 测试管理后台
curl http://localhost:3001/admin.html

# 系统测试
chmod +x test-system.sh
./test-system.sh
```

## 紧急操作

### 服务崩溃
```bash
pm2 restart bearing-sales-backend
```

### 数据库损坏
```bash
cp backend/backups/bearings_backup_latest.db backend/bearings.db
pm2 restart bearing-sales-backend
```

### 磁盘空间不足
```bash
# 清理日志
rm backend/logs/*.log
# 清理旧备份
rm backend/backups/bearings_backup_old*.db
```

---

**提示:** 首次使用请先阅读 [README.md](./README.md) 和 [DEPLOYMENT.md](./DEPLOYMENT.md)
