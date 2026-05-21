# PostgreSQL 数据库迁移指南

## 概述

本指南介绍如何将轴承销售系统从 SQLite 迁移到 PostgreSQL 数据库。

## 为什么要迁移到 PostgreSQL？

### SQLite 的限制
- ❌ 不支持高并发写入
- ❌ 缺少高级功能（如全文搜索的中文分词）
- ❌ 不适合生产环境的大规模应用
- ❌ 无法进行读写分离

### PostgreSQL 的优势
- ✅ 支持高并发
- ✅ 强大的全文搜索功能
- ✅ 支持连接池
- ✅ 可以实现读写分离
- ✅ 更好的数据完整性
- ✅ 丰富的扩展功能

---

## 迁移步骤

### 1. 安装 PostgreSQL

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
```

#### macOS
```bash
brew install postgresql
brew services start postgresql
```

#### Windows
下载并安装：https://www.postgresql.org/download/windows/

### 2. 创建数据库和用户

```bash
# 切换到postgres用户
sudo -u postgres psql

# 在psql中执行
CREATE DATABASE bearing_sales;
CREATE USER bearing_admin WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE bearing_sales TO bearing_admin;

# 退出
\q
```

### 3. 初始化数据库结构

```bash
cd backend

# 执行初始化脚本
psql -U bearing_admin -d bearing_sales -f db/init.sql
```

### 4. 配置环境变量

编辑 `backend/.env` 文件：

```bash
# 切换到PostgreSQL
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bearing_sales
DB_USER=bearing_admin
DB_PASSWORD=your_secure_password

# 注释掉SQLite配置
# DB_TYPE=sqlite
# DB_PATH=./bearings.db
```

### 5. 迁移现有数据

```bash
cd backend

# 运行迁移脚本
node scripts/migrateToPostgres.js
```

迁移脚本会自动：
- ✅ 迁移所有产品数据
- ✅ 迁移所有订单数据
- ✅ 迁移订单项数据
- ✅ 迁移管理员账号
- ✅ 迁移订单状态历史
- ✅ 更新序列值

### 6. 验证迁移

```bash
# 连接到PostgreSQL
psql -U bearing_admin -d bearing_sales

# 检查数据
SELECT COUNT(*) FROM bearings;
SELECT COUNT(*) FROM orders;
SELECT COUNT(*) FROM order_items;
SELECT COUNT(*) FROM admins;

# 退出
\q
```

### 7. 重启应用

```bash
# 停止旧服务
pm2 stop bearing-sales-backend

# 启动新服务
pm2 start ecosystem.config.json
pm2 save
```

---

## 连接池配置

PostgreSQL 连接池已在 `backend/db/postgres.js` 中配置：

```javascript
{
  max: 20,              // 最大连接数
  min: 5,               // 最小连接数
  idleTimeoutMillis: 30000,  // 空闲超时
  connectionTimeoutMillis: 2000  // 连接超时
}
```

根据服务器性能调整这些参数。

---

## 性能优化

### 1. 创建索引

数据库初始化脚本已经创建了必要的索引：

```sql
-- 产品表索引
CREATE INDEX idx_bearings_category ON bearings(category);
CREATE INDEX idx_bearings_model ON bearings(model);
CREATE INDEX idx_bearings_price ON bearings(price);
CREATE INDEX idx_bearings_stock ON bearings(stock);

-- 订单表索引
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_customer_phone ON orders(customer_phone);

-- 全文搜索索引
CREATE INDEX idx_bearings_search ON bearings USING GIN(search_vector);
```

### 2. 查询优化

使用 `EXPLAIN ANALYZE` 分析慢查询：

```sql
EXPLAIN ANALYZE
SELECT * FROM bearings WHERE category = '深沟球轴承';
```

### 3. 定期维护

```sql
-- 分析表统计信息
ANALYZE bearings;
ANALYZE orders;

-- 清理死元组
VACUUM bearings;
VACUUM orders;

-- 完全清理和分析
VACUUM FULL ANALYZE;
```

---

## 全文搜索

PostgreSQL 使用 `tsvector` 和 `tsquery` 进行全文搜索：

### 搜索示例

```sql
-- 搜索产品
SELECT * FROM bearings
WHERE search_vector @@ to_tsquery('simple', '轴承 & 深沟');

-- 带排名的搜索
SELECT *, ts_rank(search_vector, query) as rank
FROM bearings, to_tsquery('simple', '轴承') query
WHERE search_vector @@ query
ORDER BY rank DESC;
```

### 中文分词

如需更好的中文支持，可以安装 `zhparser` 扩展：

```bash
# 安装zhparser
git clone https://github.com/amutu/zhparser.git
cd zhparser
make && sudo make install

# 在PostgreSQL中启用
CREATE EXTENSION zhparser;
CREATE TEXT SEARCH CONFIGURATION chinese_zh (PARSER = zhparser);
ALTER TEXT SEARCH CONFIGURATION chinese_zh ADD MAPPING FOR n,v,a,i,e,l WITH simple;
```

---

## 备份和恢复

### 备份数据库

```bash
# 完整备份
pg_dump -U bearing_admin bearing_sales > backup_$(date +%Y%m%d).sql

# 仅备份数据
pg_dump -U bearing_admin --data-only bearing_sales > data_backup.sql

# 仅备份结构
pg_dump -U bearing_admin --schema-only bearing_sales > schema_backup.sql
```

### 恢复数据库

```bash
# 恢复完整备份
psql -U bearing_admin bearing_sales < backup_20260502.sql

# 恢复数据
psql -U bearing_admin bearing_sales < data_backup.sql
```

### 自动备份脚本

创建 `backup.sh`：

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/postgres"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="bearing_sales_$DATE.sql"

mkdir -p $BACKUP_DIR
pg_dump -U bearing_admin bearing_sales > "$BACKUP_DIR/$FILENAME"
gzip "$BACKUP_DIR/$FILENAME"

# 删除7天前的备份
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

echo "备份完成: $FILENAME.gz"
```

添加到 crontab：

```bash
# 每天凌晨2点备份
0 2 * * * /path/to/backup.sh
```

---

## 读写分离（高级）

### 1. 配置主从复制

#### 主服务器配置

编辑 `postgresql.conf`：

```conf
wal_level = replica
max_wal_senders = 3
wal_keep_size = 64
```

编辑 `pg_hba.conf`：

```conf
host replication bearing_admin 192.168.1.0/24 md5
```

#### 从服务器配置

```bash
# 停止从服务器
pg_ctl stop

# 从主服务器复制数据
pg_basebackup -h master_host -D /var/lib/postgresql/data -U bearing_admin -P

# 创建 standby.signal
touch /var/lib/postgresql/data/standby.signal

# 配置 postgresql.conf
primary_conninfo = 'host=master_host port=5432 user=bearing_admin password=xxx'

# 启动从服务器
pg_ctl start
```

### 2. 应用层读写分离

修改 `backend/db/postgres.js`：

```javascript
const masterPool = new Pool({
  host: process.env.DB_MASTER_HOST,
  // ... 其他配置
});

const slavePool = new Pool({
  host: process.env.DB_SLAVE_HOST,
  // ... 其他配置
});

// 读操作使用从库
const queryRead = (sql, params) => slavePool.query(sql, params);

// 写操作使用主库
const queryWrite = (sql, params) => masterPool.query(sql, params);
```

---

## 监控和调优

### 1. 查看连接数

```sql
SELECT count(*) FROM pg_stat_activity;
```

### 2. 查看慢查询

```sql
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

### 3. 查看表大小

```sql
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### 4. 查看索引使用情况

```sql
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

---

## 故障排查

### 连接失败

```bash
# 检查PostgreSQL是否运行
sudo systemctl status postgresql

# 检查端口
sudo netstat -tlnp | grep 5432

# 查看日志
sudo tail -f /var/log/postgresql/postgresql-15-main.log
```

### 性能问题

```sql
-- 查看锁等待
SELECT * FROM pg_locks WHERE NOT granted;

-- 查看活动查询
SELECT pid, query, state, wait_event
FROM pg_stat_activity
WHERE state != 'idle';

-- 终止慢查询
SELECT pg_terminate_backend(pid);
```

---

## Docker 部署

使用 Docker Compose 部署 PostgreSQL：

```yaml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: bearing_sales
      POSTGRES_USER: bearing_admin
      POSTGRES_PASSWORD: your_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backend/db/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"

volumes:
  postgres_data:
```

---

## 回滚到 SQLite

如果需要回滚到 SQLite：

1. 修改 `.env`：
```bash
DB_TYPE=sqlite
DB_PATH=./bearings.db
```

2. 重启应用：
```bash
pm2 restart bearing-sales-backend
```

---

## 总结

PostgreSQL 迁移完成后，系统将获得：

- ✅ 更好的并发性能
- ✅ 更强大的查询能力
- ✅ 更可靠的数据完整性
- ✅ 更好的扩展性

建议在生产环境使用 PostgreSQL，开发环境可以继续使用 SQLite。
