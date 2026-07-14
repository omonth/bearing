# Docker 与 Kubernetes 部署指南

## Docker Compose（受支持的生产路径）

```bash
git clone <repository-url>
cd bearing-sales
cp .env.production.example .env.production
# 填写所有空值；不要提交该文件
chmod 600 .env.production
docker compose --env-file .env.production config --quiet
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=100 backend
```

`DB_PASSWORD`、`REDIS_PASSWORD`、`JWT_SECRET`、`AI_JWT_SECRET`、`INITIAL_ADMIN_*`、`AI_BOOTSTRAP_*`、`CORS_ORIGIN` 和 `PAYMENT_MODE` 均为必填。缺失时 Compose 会拒绝启动，避免部署到公开默认密码或沙箱支付模式。

不要使用 `start-prod.sh`、`docker-compose up`（未指定生产 env 文件）或旧的 `build/` 复制流程。它们不能安全部署 Next.js，并可能破坏 `backend/public` 上传内容。不要在生产环境使用 `docker compose down -v`，该命令会删除持久化数据。

镜像可以单独构建用于 CI 验证，但不能脱离数据库、Redis、Nginx、生产环境变量和健康检查单独运行：

```bash
docker build -t bearing-sales-backend:local backend
docker build -t bearing-sales-frontend:local .
docker build -t bearing-sales-admin:local admin
```

发布后至少验证 `GET /health`、登录、商品浏览、下单、真实支付回调、退款/库存恢复与管理员授权。Nginx 仅暴露 HTTP；公网入口必须由受管 TLS 或上游 HTTPS 反向代理保护。

## Kubernetes（需自行完成的受控发布）

`k8s/deployment.yaml` 是参考清单，不包含可提交的 Secret、不可变镜像引用或数据库迁移 Job。部署前必须：

1. 将 `registry.example.invalid/...:replace-with-immutable-tag` 替换成已验证的不可变镜像摘要或提交 SHA。
2. 在集群外创建 `bearing-sales-secrets`，不要把真实值写进 YAML 或 Git。它至少需要 `DB_USER`、`DB_PASSWORD`、`REDIS_PASSWORD`、`JWT_SECRET`、`AI_JWT_SECRET`、`INITIAL_ADMIN_USERNAME`、`INITIAL_ADMIN_PASSWORD`、`AI_BOOTSTRAP_USERNAME` 和 `AI_BOOTSTRAP_PASSWORD`。
3. 设置实际的 `CORS_ORIGIN`、域名、TLS Secret 与 Ingress class。
4. 在后端副本接收流量前运行经评审的数据库初始化/迁移 Job。PostgreSQL 的官方镜像不会自动读取仓库中的 `backend/db/*.sql`。已有数据库升级必须使用版本化迁移和回滚计划。

可使用私有文件创建 Secret：

```bash
kubectl create namespace production
kubectl -n production create secret generic bearing-sales-secrets \
  --from-env-file=.env.k8s.secrets
kubectl apply -f k8s/deployment.yaml
```

`kubectl apply` 前先在 CI 或目标集群使用 schema 校验；本地没有集群时不能证明清单可被 API server 接受。数据库、Redis、前端和后端的就绪探针、NetworkPolicy、Pod 安全限制、备份策略与告警须由目标集群基线补全。

## 备份与恢复

Docker Compose 备份与恢复请见 `DEPLOYMENT.md`。Kubernetes 中 Postgres 由 Deployment 创建，Pod 名称不是固定的 `postgres-0`。选择当前 Pod 后再执行备份：

```bash
POSTGRES_POD=$(kubectl get pods -n production -l app=postgres -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n production "$POSTGRES_POD" -- \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > backup.sql
```

恢复前必须先在隔离环境演练，停止写入流量，并由数据库负责人确认恢复点。PVC 快照和数据库逻辑备份都需要跨可用区/跨账户保留。

## CI/CD

GitHub Actions 会在 main 分支验证测试和构建；只有 Docker Hub 与部署 Secret 均配置时才会发布和部署。部署主机必须预先保存权限为 `600` 的 `.env.production`，CI 不应传输或输出运行时密钥。

生产镜像应使用提交 SHA 或摘要部署，禁止以 `latest` 作为回滚依据。每次升级前备份数据库；回滚应用代码后，数据库迁移只能按已审查的回滚计划处理。
