# 轴承销售系统 - 生产环境部署文档

## 目录
1. [系统要求](#系统要求)
2. [安装步骤](#安装步骤)
3. [配置说明](#配置说明)
4. [启动服务](#启动服务)
5. [维护操作](#维护操作)
6. [故障排查](#故障排查)
7. [安全建议](#安全建议)

---

## 系统要求

### 硬件要求
- CPU: 2核心或以上
- 内存: 2GB RAM 或以上
- 硬盘: 10GB 可用空间

### 软件要求
- 操作系统: Linux (Ubuntu 20.04+) / Windows Server 2016+ / macOS
- Node.js: v14.0.0 或更高版本
- npm: v6.0.0 或更高版本
- PM2: v5.0.0 或更高版本（生产环境推荐）

---

## 安装步骤

### 1. 安装 Node.js

**Ubuntu/Debian:**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Windows:**
从 https://nodejs.org/ 下载并安装 LTS 版本

**验证安装:**
```bash
node --version
npm --version
```

### 2. 安装 PM2（生产环境）

```bash
npm install -g pm2
```

### 3. 下载项目代码

```bash
# 如果使用 Git
git clone <repository-url>
cd bearing-sales

# 或者直接解压项目压缩包
unzip bearing-sales.zip
cd bearing-sales
```

### 4. 安装依赖

**后端依赖:**
```bash
cd backend
npm install --production
cd ..
```

**前端依赖:**
```bash
npm install
```

---

## 配置说明

### 1. 后端配置

复制环境配置文件:
```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env` 文件:
```env
# 服务器配置
PORT=3001
NODE_ENV=production

# 数据库配置
DB_PATH=./bearings.db

# CORS配置（设置为前端域名或服务器IP）
CORS_ORIGIN=http://your-domain.com

# 日志配置
LOG_LEVEL=info
LOG_DIR=./logs

# 备份配置
BACKUP_DIR=./backups
BACKUP_INTERVAL=86400000
```

### 2. 前端配置

复制环境配置文件:
```bash
cp .env.example .env
```

编辑 `.env` 文件:
```env
# API配置（设置为后端服务器地址）
REACT_APP_API_URL=http://your-domain.com:3001/api
```

### 3. 初始化数据库

```bash
cd backend
npm run init-db
cd ..
```

---

## 启动服务

### 开发环境

**方式1: 使用启动脚本（推荐）**

Linux/macOS:
```bash
chmod +x start.sh
./start.sh
```

Windows:
```bash
start.bat
```

**方式2: 手动启动**

终端1 - 启动后端:
```bash
cd backend
npm start
```

终端2 - 启动前端:
```bash
npm start
```

访问地址:
- 前端: http://localhost:3000
- 后端API: http://localhost:3001
- 管理后台: http://localhost:3001/admin.html

### 生产环境

**方式1: 使用PM2（推荐）**

```bash
chmod +x start-prod.sh
./start-prod.sh
```

**方式2: 手动部署**

1. 构建前端:
```bash
npm run build
```

2. 复制构建文件到后端:
```bash
cp -r build backend/public
```

3. 使用PM2启动后端:
```bash
pm2 start ecosystem.config.json
pm2 save
pm2 startup
```

访问地址:
- 生产环境: http://your-domain.com:3001
- 管理后台: http://your-domain.com:3001/admin.html

---

## 维护操作

### PM2 常用命令

```bash
# 查看服务状态
pm2 status

# 查看日志
pm2 logs

# 重启服务
pm2 restart bearing-sales-backend

# 停止服务
pm2 stop bearing-sales-backend

# 删除服务
pm2 delete bearing-sales-backend

# 监控服务
pm2 monit
```

### 数据库备份

**手动备份:**
```bash
cd backend
npm run backup
```

**自动备份（使用 cron）:**

编辑 crontab:
```bash
crontab -e
```

添加每天凌晨3点自动备份:
```cron
0 3 * * * cd /path/to/bearing-sales/backend && npm run backup
```

**恢复备份:**
```bash
cd backend
cp backups/bearings_backup_YYYY-MM-DDTHH-mm-ss.db bearings.db
pm2 restart bearing-sales-backend
```

### 日志管理

日志文件位置:
- 应用日志: `backend/logs/combined.log`
- 错误日志: `backend/logs/error.log`
- PM2日志: `backend/logs/pm2-*.log`

清理旧日志:
```bash
cd backend/logs
find . -name "*.log" -mtime +30 -delete
```

---

## 故障排查

### 问题1: 端口被占用

**错误信息:**
```
Error: listen EADDRINUSE: address already in use :::3001
```

**解决方案:**

Linux/macOS:
```bash
# 查找占用端口的进程
lsof -i :3001

# 终止进程
kill -9 <PID>
```

Windows:
```bash
# 查找占用端口的进程
netstat -ano | findstr :3001

# 终止进程
taskkill /PID <PID> /F
```

或修改 `backend/.env` 中的 PORT 配置。

### 问题2: 数据库文件不存在

**错误信息:**
```
Error: SQLITE_CANTOPEN: unable to open database file
```

**解决方案:**
```bash
cd backend
npm run init-db
```

### 问题3: CORS 错误

**错误信息:**
```
Access to fetch at 'http://...' from origin 'http://...' has been blocked by CORS policy
```

**解决方案:**

修改 `backend/.env` 中的 CORS_ORIGIN:
```env
CORS_ORIGIN=http://your-frontend-domain.com
```

然后重启服务:
```bash
pm2 restart bearing-sales-backend
```

### 问题4: 前端无法连接后端

**检查步骤:**

1. 确认后端服务正在运行:
```bash
pm2 status
# 或
curl http://localhost:3001/api/bearings
```

2. 检查前端 `.env` 配置:
```env
REACT_APP_API_URL=http://correct-backend-url:3001/api
```

3. 重新构建前端:
```bash
npm run build
cp -r build backend/public
pm2 restart bearing-sales-backend
```

---

## 安全建议

### 1. 使用反向代理

推荐使用 Nginx 作为反向代理:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 2. 启用 HTTPS

使用 Let's Encrypt 获取免费 SSL 证书:
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 3. 配置防火墙

```bash
# Ubuntu/Debian
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 4. 定期更新依赖

```bash
cd backend
npm audit
npm audit fix

cd ..
npm audit
npm audit fix
```

### 5. 数据库安全

- 定期备份数据库
- 限制数据库文件访问权限:
```bash
chmod 600 backend/bearings.db
```

### 6. 环境变量保护

确保 `.env` 文件不被提交到版本控制:
```bash
# .gitignore 中应包含:
.env
backend/.env
```

---

## 性能优化

### 1. 启用 PM2 集群模式

编辑 `ecosystem.config.json`:
```json
{
  "apps": [{
    "instances": "max",
    "exec_mode": "cluster"
  }]
}
```

### 2. 配置 Nginx 缓存

```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### 3. 数据库优化

定期执行 VACUUM 清理数据库:
```bash
sqlite3 backend/bearings.db "VACUUM;"
```

---

## 监控和告警

### 使用 PM2 Plus（可选）

1. 注册 PM2 Plus 账号: https://pm2.io/
2. 连接服务器:
```bash
pm2 link <secret_key> <public_key>
```

### 自定义健康检查

创建健康检查脚本 `backend/health-check.sh`:
```bash
#!/bin/bash
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/bearings)
if [ $response != "200" ]; then
    echo "服务异常，HTTP状态码: $response"
    pm2 restart bearing-sales-backend
fi
```

添加到 crontab（每5分钟检查一次）:
```cron
*/5 * * * * /path/to/backend/health-check.sh
```

---

## 联系支持

如有问题，请联系技术支持团队。

**文档版本:** 1.0.0  
**最后更新:** 2026-05-01
