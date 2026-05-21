# Docker 部署指南

## 快速开始

### 1. 使用 Docker Compose（推荐）

```bash
# 克隆项目
git clone <repository-url>
cd bearing-sales

# 配置环境变量
cp .env.production.example .env.production
# 编辑 .env.production 文件，设置安全的密码和密钥

# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 2. 单独构建镜像

```bash
# 构建后端镜像
cd backend
docker build -t bearing-sales-backend .

# 构建前端镜像
cd ..
docker build -t bearing-sales-frontend .

# 运行容器
docker run -d -p 3001:3001 --name backend bearing-sales-backend
docker run -d -p 80:80 --name frontend bearing-sales-frontend
```

## Kubernetes 部署

### 前置条件

- Kubernetes 集群（v1.24+）
- kubectl 已配置
- Helm 3.x（可选）

### 部署步骤

```bash
# 创建命名空间
kubectl create namespace production

# 应用配置
kubectl apply -f k8s/deployment.yaml

# 查看部署状态
kubectl get pods -n production
kubectl get services -n production

# 查看日志
kubectl logs -f deployment/backend -n production
```

### 扩容

```bash
# 扩展后端副本数
kubectl scale deployment backend --replicas=5 -n production

# 自动扩缩容
kubectl autoscale deployment backend --cpu-percent=70 --min=3 --max=10 -n production
```

## 监控和日志

### Prometheus + Grafana

```bash
# 安装 Prometheus Operator
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack -n monitoring --create-namespace

# 访问 Grafana
kubectl port-forward svc/prometheus-grafana 3000:80 -n monitoring
# 默认用户名: admin, 密码: prom-operator
```

### ELK Stack（日志聚合）

```bash
# 安装 Elasticsearch
helm repo add elastic https://helm.elastic.co
helm install elasticsearch elastic/elasticsearch -n logging --create-namespace

# 安装 Kibana
helm install kibana elastic/kibana -n logging

# 安装 Filebeat
helm install filebeat elastic/filebeat -n logging
```

## 备份和恢复

### 数据库备份

```bash
# 备份 PostgreSQL
kubectl exec -it postgres-0 -n production -- pg_dump -U bearing_admin bearing_sales > backup.sql

# 恢复
kubectl exec -i postgres-0 -n production -- psql -U bearing_admin bearing_sales < backup.sql
```

### 持久化卷备份

```bash
# 使用 Velero 备份
velero backup create bearing-sales-backup --include-namespaces production
```

## 故障排查

### 查看 Pod 状态

```bash
kubectl get pods -n production
kubectl describe pod <pod-name> -n production
kubectl logs <pod-name> -n production
```

### 进入容器调试

```bash
kubectl exec -it <pod-name> -n production -- /bin/sh
```

### 常见问题

1. **Pod 无法启动**
   - 检查镜像是否正确
   - 查看 Pod 事件: `kubectl describe pod <pod-name>`
   - 检查资源限制

2. **数据库连接失败**
   - 确认 Service 名称正确
   - 检查网络策略
   - 验证密码配置

3. **Redis 连接问题**
   - 检查 Redis 密码
   - 确认 Service 端口

## 性能优化

### 资源配置

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

### 水平扩展

```bash
# 根据 CPU 使用率自动扩展
kubectl autoscale deployment backend --cpu-percent=70 --min=3 --max=10
```

### 缓存优化

- 启用 Redis 缓存
- 配置 CDN 加速静态资源
- 使用 Nginx 缓存

## 安全建议

1. **使用 Secrets 管理敏感信息**
2. **启用 RBAC 权限控制**
3. **配置网络策略**
4. **定期更新镜像**
5. **启用 Pod Security Policies**
6. **使用 HTTPS/TLS**

## CI/CD 集成

项目已配置 GitHub Actions，推送到 main 分支会自动：

1. 运行测试
2. 构建 Docker 镜像
3. 推送到 Docker Hub
4. 部署到生产环境

### 配置 Secrets

在 GitHub 仓库设置中添加：

- `DOCKER_USERNAME`: Docker Hub 用户名
- `DOCKER_PASSWORD`: Docker Hub 密码
- `DEPLOY_HOST`: 部署服务器地址
- `DEPLOY_USER`: SSH 用户名
- `DEPLOY_KEY`: SSH 私钥

## 更新部署

```bash
# 更新镜像
kubectl set image deployment/backend backend=your-registry/bearing-sales-backend:v2.0 -n production

# 滚动更新
kubectl rollout status deployment/backend -n production

# 回滚
kubectl rollout undo deployment/backend -n production
```

## 健康检查

系统提供以下健康检查端点：

- `GET /` - 基本健康检查
- `GET /api/bearings` - API 可用性检查

## 联系支持

如有问题，请联系技术支持团队或提交 Issue。
