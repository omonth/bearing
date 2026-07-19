# 后端Dockerfile
FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS dependencies

WORKDIR /app

# sqlite3's downloaded binary may target a newer glibc than Bookworm. Build
# native dependencies in the same distro as the runtime image to prevent a
# container that builds successfully but fails during module loading.
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    g++ \
    make \
    python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm_config_build_from_source=true npm ci --omit=dev

FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3

WORKDIR /app

# PostgreSQL custom dumps are not guaranteed to restore with a newer client
# against an older server (for example, pg_dump 18 emits settings unknown to
# PostgreSQL 15). Keep the runtime tooling on the same major as the production
# database image so backup drills exercise a supported restore path.
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    awscli \
    ca-certificates \
    gosu \
    postgresql-client-15 \
  && rm -rf /var/lib/apt/lists/*

# 复制package文件
COPY package*.json ./

# 安装依赖
COPY --from=dependencies /app/node_modules ./node_modules

# 复制应用代码
COPY --chown=node:node . .

# 创建必要的目录
RUN mkdir -p logs backups public/images \
  && chown -R node:node logs backups public/images \
  && chmod 0755 docker-entrypoint.sh

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3001/ready', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# 启动应用
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "start"]
