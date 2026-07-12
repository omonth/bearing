# 轴承销售系统生产部署

## 支持的部署路径

完整生产栈以 Docker Compose 为受支持的部署路径。它启动 PostgreSQL、Redis、后端、Next.js 前端、向量服务和 Nginx。`render.yaml` 仅描述后端服务，适合由平台提供持久磁盘且前端/HTTPS 另行托管的场景；它不替代完整栈的 Redis、向量服务和反向代理配置。

独立的 `admin/` Vite 管理后台不在 Compose 或 Kubernetes 清单中。若生产需要该界面，应把它作为单独、版本化的静态应用部署在受控 HTTPS 域名，并验证其 API 地址、管理员认证和访问边界；不要误以为它已随商城前端发布。

`start-prod.sh` 及其旧 PM2/`build/` 复制流程已经弃用：Next.js 的构建产物不是 Create React App 的 `build/` 目录，旧脚本还会删除 `backend/public`，可能导致上传文件丢失。不要使用它，也不要把前端构建产物复制到后端静态目录。

Kubernetes 清单是基础设施参考，不是替代本指南的一键部署方案；使用它前必须自行完成镜像、Secret、数据库初始化、迁移和 TLS 的发布流程。

## 前置条件

- 已安装 Docker Engine 和 Docker Compose v2（使用 `docker compose`）。
- 已有公网域名与受管 TLS/HTTPS 终止层。仓库中的 Nginx 仅监听 HTTP 80，适合部署在该层之后。
- 已为 PostgreSQL 数据、Redis 数据、上传文件和备份规划持久化与异地备份。
- 已选定一个真实支付提供方，并能提供其生产凭据、回调地址和证书。没有完成支付验签配置时，不得开放支付入口。

## 1. 创建私有生产配置

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

编辑 `.env.production`，填写每个空值。它已被 Git 忽略，仍不得通过聊天、工单、镜像层、日志或版本库分享。可以用下面的命令生成密钥：

```bash
openssl rand -base64 48
```

以下变量会被 Compose 强制要求，缺失或为空时部署会停止，而不会使用公开默认值：

| 变量 | 要求 |
| --- | --- |
| `DB_PASSWORD` | PostgreSQL 的强随机密码 |
| `REDIS_PASSWORD` | Redis 的强随机密码 |
| `JWT_SECRET` | 主 JWT 密钥，至少 32 个随机字符 |
| `AI_JWT_SECRET` | 独立的 AI JWT 密钥，不能复用主密钥 |
| `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` | 首次主管理员账户，仅用于引导；首次使用后轮换密码 |
| `AI_BOOTSTRAP_USERNAME` / `AI_BOOTSTRAP_PASSWORD` | 首次 AI 管理员账户，仅用于引导；首次使用后轮换密码 |
| `CORS_ORIGIN` | 商城的实际 HTTPS 源，例如 `https://shop.example.com`，不带尾随斜杠 |
| `PAYMENT_MODE` | 必须显式设为 `production` |

仅启用实际使用的支付提供方，并在同一私有文件中填写相应 `ALIPAY_*`、`WECHAT_*` 或 `UNIONPAY_*` 变量以及可从公网访问的 HTTPS 回调地址。`ALIPAY_MODE` 和 `UNIONPAY_MODE` 必须保持 `production`。私钥和证书文件不得复制进镜像；应由受管 Secret/只读挂载提供，并将对应路径变量指向挂载路径。

## 2. 部署和验证

先在不启动容器的情况下验证 Compose 插值：

```bash
docker compose --env-file .env.production config --quiet
```

首次部署或从源构建时：

```bash
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=100 backend
curl --fail http://127.0.0.1/health
```

`/health` 返回成功只说明进程可响应；上线前还要用专用测试账号验证登录、商品查询、下单、真实支付回调、退款、库存恢复和管理员授权。不要在生产环境调用任何沙箱支付模拟接口。

首次创建 PostgreSQL 数据卷时，Compose 会执行 `backend/db/*.sql` 的初始化脚本。已有数据卷不会再次执行这些脚本；生产升级必须使用经评审、可回滚的数据库迁移，不能依赖重建容器或删除卷。上传文件单独持久化在 `backend_uploads` 卷的 `/app/public/images`，不会遮蔽镜像内的其他静态资源。

## 3. 日志、备份和恢复

查看服务状态和日志：

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=200 backend
docker compose --env-file .env.production logs --tail=200 nginx
```

备份 PostgreSQL（将备份保存到受控、加密的位置）：

```bash
mkdir -p backups
docker compose --env-file .env.production exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "backups/bearing-sales-$(date +%F-%H%M%S).sql"
```

恢复前必须先在隔离环境演练，并停止写入流量。恢复示例：

```bash
docker compose --env-file .env.production exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backups/approved-restore.sql
```

不要将 `docker compose down -v` 用于生产环境；它会删除数据库、Redis 和上传文件卷。

## 4. 升级和回滚

1. 记录当前 Git 提交和镜像标签，先完成数据库备份。
2. 审核迁移、配置变更与 `docker compose --env-file .env.production config --quiet` 的结果。
3. 发布新版本并检查各服务健康状态与关键业务流程。
4. 若应用回滚，检出上一个已验证版本并重新执行 Compose。数据库回滚必须按该版本的迁移回滚计划执行，绝不能用删除卷代替。

使用 CI 推送的镜像时，应使用不可变的提交 SHA 或镜像摘要，而不是 `latest`。部署主机上的 `.env.production` 只保存运行时密钥，不应保存到 Git 仓库。

## 5. 安全核对

- 确认 `.env.production`、支付私钥、证书、数据库、备份和日志没有被 Git 跟踪或进入 Docker 镜像。
- 确认生产前端可通过 HTTPS 访问，`CORS_ORIGIN` 与实际源完全匹配。
- 确认 `PAYMENT_MODE=production`，真实支付回调验签和幂等性已经用测试商户验证。
- 轮换首次管理员密码、JWT 密钥和第三方密钥，并限制数据库与 Redis 端口只对内部网络开放。
- 为数据库备份、镜像回滚、告警值班和安全事件建立实际负责人及演练记录。

## Render 后端部署

`render.yaml` 使用 `npm ci`、持久化 SQLite 磁盘和 `/health` 检查。Render 控制台必须显式填写标记为 `sync: false` 的 `CORS_ORIGIN`、`INITIAL_ADMIN_*` 与 `AI_BOOTSTRAP_*`，并确认自动生成的 `JWT_SECRET` 和 `AI_JWT_SECRET` 已轮换或妥善保管。它固定 `PAYMENT_MODE=production`，因此必须先配置真实支付提供方凭据和回调地址；没有配置时不得开放支付。

Render 服务只部署 API。将商城前端部署到独立 HTTPS 域名后，把该确切源填入 `CORS_ORIGIN`；不要把 SQLite、日志或上传目录当作可替代的异地备份。
