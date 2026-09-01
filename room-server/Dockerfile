# syntax=docker/dockerfile:1

# better-sqlite3 是原生模块，官方预编译产物不覆盖 musl（alpine），
# 在 alpine 上会回落到 node-gyp 源码编译并因为缺少编译工具而失败。
# 因此这里统一使用 glibc 的 slim 镜像，并在构建阶段准备好编译工具。
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
# 有锁文件时用 npm ci 保证可复现；没有锁文件（例如被 gitignore 掉了）时回落到 npm install
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM deps AS builder
WORKDIR /app
COPY tsconfig.json ./
COPY src ./src
# 先编译成 JS，再裁掉 devDependencies，运行阶段不再需要 tsx / typescript
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/data/room.db

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# sqlite 数据文件所在目录需要可写；以非 root 用户运行
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3001

# 用 node 自带的 fetch 做健康检查，避免为此安装 curl/wget
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 直接用 node 启动，进程即 PID 1，能收到 docker stop 发出的 SIGTERM 走优雅退出
CMD ["node", "dist/index.js"]
