# PostgreSQL 备份与恢复运行手册

## 目标与保证

生产备份执行链路为：`pg_dump` custom format 标准输出 → AES-256-GCM 流式认证加密 → 本地密文与清单 → S3 兼容异地存储 → 本地和远端保留清理 → webhook 告警。`pg_dump` 明文不会写入磁盘。导出、加密、上传、清理或告警任何一步失败，`backend/backup.js` 都以非零状态退出。

恢复在启动 `pg_restore` 前会先读取并认证整个 GCM 密文；认证成功后，再次流式解密到 `pg_restore` 标准输入。恢复使用 `--single-transaction --exit-on-error`，中途错误应由 PostgreSQL 原子回滚。

## 生产前提

- 安装与服务器 PostgreSQL 主版本兼容或更新的 `pg_dump`、`pg_restore`。
- 安装 AWS CLI v2；S3 兼容服务必须支持 `s3 cp` 与 `s3api list-objects-v2/delete-object`。
- 使用独立数据库备份账号，最小化为读取全部业务 schema 所需权限；恢复使用独立恢复账号。
- 异地 bucket 应位于不同账号或地域，并另外启用版本控制、Object Lock 或服务端不可变保留策略。应用侧保留清理不能替代防勒索不可变策略。
- webhook 接收端应独立于本应用，并对备份成功缺失、备份失败和恢复操作建立值班告警。

生产必须配置：

```text
NODE_ENV=production
DB_TYPE=postgres
DB_HOST=postgres.example.internal
DB_PORT=5432
DB_NAME=bearing_sales
DB_USER=bearing_backup
DB_PASSWORD=<secret>
BACKUP_DIR=/var/lib/bearing-sales/backups
BACKUP_ENCRYPTION_KEY_FILE=/run/secrets/backup_aes_key_base64
BACKUP_RETENTION_DAYS=30
BACKUP_S3_BUCKET=bearing-sales-backups-offsite
BACKUP_S3_PREFIX=bearing-sales/postgres
BACKUP_S3_REGION=cn-north-1
BACKUP_S3_ENDPOINT=https://s3.example.com
BACKUP_ALERT_WEBHOOK_URL=https://alerts.example.com/hooks/database-backup
```

`BACKUP_ENCRYPTION_KEY_FILE` 内容必须是 32 个随机字节的规范 base64 表示。优先通过 Docker/Kubernetes secret 或宿主机 `0600` 文件挂载；兼容变量 `BACKUP_ENCRYPTION_KEY_BASE64` 仅用于受控运行环境，禁止写入 Git、镜像或日志。AWS 凭据使用工作负载角色或标准 `AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY` secret 注入。

生成新密钥示例（输出应直接进入秘密管理器，不能提交）：

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

## 定时备份

手工执行一次并检查退出码：

```bash
cd /opt/bearing-sales
docker compose --env-file /etc/bearing-sales/backup.env --profile ops run --rm --no-deps backup
```

systemd 模板位于 `ops/backup/systemd/`。复制后按实际安装路径调整，只给备份账号读取 `/etc/bearing-sales/backup.env` 与写入备份目录的权限：

```bash
sudo cp ops/backup/systemd/bearing-postgres-backup.* /etc/systemd/system/
sudo install -m 0755 ops/backup/systemd/notify-backup-failure.sh \
  /opt/bearing-sales/ops/backup/systemd/notify-backup-failure.sh
sudo systemctl daemon-reload
sudo systemctl enable --now bearing-postgres-backup.timer
sudo systemctl start bearing-postgres-backup.service
sudo systemctl status bearing-postgres-backup.service
```

`bearing-postgres-backup.service` uses a separate systemd `OnFailure` unit, so
Docker/Compose/image/secret failures that happen before `backend/backup.js`
starts still call the external HTTPS alert webhook. Configure the monitoring
receiver to raise a dead-man alert when no `postgres_backup_succeeded` event is
received for 26 hours; an application-side failure webhook alone cannot detect
a stopped host, timer, or network.

The systemd runner resolves `BACKEND_IMAGE` from the currently running backend
container and refuses mutable/local tags. This keeps scheduled backup tooling on
the same immutable Git SHA (or image digest) as the deployed application; a
missing or mutable image reference fails the unit and triggers `OnFailure`.

默认每日 02:15 执行并带 15 分钟随机延迟；`Persistent=true` 会在主机错过计划后补跑。调度器必须以进程退出码判断成功，不得仅搜索日志文本。

## 恢复流程

1. 在隔离的恢复环境创建空目标库，确认目标不接受生产流量。
2. 设置数据库、加密密钥与 S3 变量；将 `RESTORE_TARGET_ENV=drill`。
3. 从异地对象直接下载并恢复（下载的仍是密文，结束后自动删除临时副本）：

   ```bash
   docker compose --env-file /etc/bearing-sales/backup.env --profile ops run --rm --no-deps \
     --entrypoint node backup scripts/backup/restore-postgres.js \
     --s3-key=bearing-sales/postgres/bearing_sales_2026-07-19T02-15-00-000Z.dump.enc
   ```

4. 或恢复已有本地密文：

   ```bash
   docker compose --env-file /etc/bearing-sales/backup.env --profile ops run --rm --no-deps \
     -v /secure:/restore:ro --entrypoint node backup \
     scripts/backup/restore-postgres.js --file=/restore/backup.dump.enc
   ```

5. 检查订单、支付、退款、库存等核心表的行数、外键、迁移版本和抽样业务聚合；运行只读应用冒烟测试。
6. 记录 RTO（开始下载到完整性检查结束）和该备份时间对应的 RPO。

`RESTORE_TARGET_ENV` 缺失时按 `production` 处理并拒绝执行。生产灾难恢复需要双重显式确认：

```bash
export RESTORE_TARGET_ENV=production
export ALLOW_PRODUCTION_RESTORE=true
docker compose --env-file /etc/bearing-sales/backup.env --profile ops run --rm --no-deps \
  --entrypoint node backup scripts/backup/restore-postgres.js \
  --s3-key=<key> --confirm-production=RESTORE_BEARING_SALES
```

生产恢复还必须经过事故指挥人审批、停止所有写流量并确认当前快照可回退；命令本身的确认开关不能替代变更审批。

## 本地恢复演练记录

| 日期 | 范围 | 结果 | 恢复耗时 | 完整性检查 | 限制 |
|---|---|---|---:|---|---|
| 2026-07-19 | 假 `pg_dump` / `pg_restore` / S3 CLI，流式加密、异地上传下载、保留清理、webhook | 通过 | 0.910 秒（备份至恢复端到端测试） | 恢复输入与导出内容逐字节相等；篡改认证标签时恢复程序未启动 | 未连接真实 PostgreSQL/S3，未覆盖生产数据量、网络带宽、IAM、TLS、Object Lock 与真实 schema 约束 |

验证命令与结果：

```text
backend/node_modules/.bin/vitest.cmd run test/backupRestore.test.ts --no-cache --reporter=verbose
1 file passed, 5 tests passed, suite duration 2.22s
```

上线前仍需在独立 PostgreSQL 实例和真实异地 bucket 上完成一次全量恢复演练，记录真实 RTO/RPO，并对核心表执行行数、外键和业务金额对账。只有该演练通过后，才能宣称生产灾备已验证。
