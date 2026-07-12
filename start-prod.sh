#!/usr/bin/env bash

set -euo pipefail

cat >&2 <<'EOF'
start-prod.sh 已弃用，且不会执行任何部署操作。

旧脚本会删除 backend/public，并尝试复制 Next.js 不会生成的 build/ 目录；
这可能删除上传文件后使部署失败。生产环境请使用受支持的 Docker Compose 流程：

  cp .env.production.example .env.production
  # 为所有必填变量生成并填写强随机值，然后限制文件权限
  chmod 600 .env.production
  docker compose --env-file .env.production up -d --build

详见 README.md 与 DEPLOYMENT.md。请勿使用本脚本或将 Next.js 构建产物复制到 backend/public。
EOF

exit 1
