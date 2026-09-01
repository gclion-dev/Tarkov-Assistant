# 逃离塔科夫助手 <small>[Escape From Tarkov Assistant]</small>

一个《逃离塔科夫》的交互式地图与任务查询工具。读取游戏截图与日志，自动识别当前地图并
在地图上标出你的实时位置；登录后还可以开房间，和队友互相看到彼此的位置。

技术栈：React + Vite + Leaflet（前端），Express + socket.io + SQLite（房间服务）。

### 更新日志 <small>[Updates]</small>

```
Version 1.0.1

1. 新增实时坐标方向计算。
2. 新增选择塔科夫游戏目录功能，实现自动切换地图。
3. 新增账号体系与「协作房间」：同一房间内的队友位置实时同步到地图上。

1. Add location quaternion.
2. Add map auto-switch, you should select your Tarkov game path to enable this feature.
3. Add accounts and co-op rooms: teammates' positions are synced onto the map in real time.
```

### 项目结构 <small>[Project Structure]</small>

```
.
├── src/                 前端（React + Vite）
│   ├── features/        按功能垂直切分的模块（auth / room）
│   ├── pages/           页面
│   ├── store/           recoil atoms
│   └── ...
├── room-server/         房间服务（Express + socket.io + SQLite），独立的 Node 服务
├── docker/nginx.conf    前端镜像的 nginx 配置，同时反代 /api 与 /ws
└── docker-compose.yml   web + room-server 编排
```

前端是纯静态站点，除「协作房间」外的所有功能都不依赖房间服务，可以单独部署。

### 安装脚本 <small>[Installation Scripts]</small>

```
$ npm i --registry=https://registry.npmmirror.com

# 如需使用协作房间功能，另装房间服务的依赖
$ npm i --prefix room-server --registry=https://registry.npmmirror.com
```

### 开发模式 <small>[Development Mode]</small>

```
# 前端，默认 http://localhost:8001
$ npm run dev

# 房间服务，默认 http://localhost:3001（另开一个终端）
$ npm run dev:server
```

Vite 已配置好 `/api` 与 `/ws` 的代理，前端直接用同源相对路径访问房间服务，无需处理跨域。

首次启动房间服务前，复制一份环境变量文件：

```
$ cp room-server/.env.example room-server/.env
```

开发环境即使不填 `JWT_SECRET` 也能启动（会打印告警并使用固定的开发密钥），但**生产环境必须填写**，否则服务会拒绝启动。

### 构建脚本 <small>[Build Scripts]</small>

```
# 前端
$ npm run build

# 房间服务（编译到 room-server/dist）
$ npm run build --prefix room-server
```

### 协作房间 <small>[Co-op Rooms]</small>

登录后可以创建一个 6 位房间号，队友输入房间号即可加入（默认上限 6 人）。加入后，
各自通过游戏内截图触发的坐标会实时同步到同一张地图上，队友的位置以不同颜色的箭头显示。

设计上的几个约定：

- 房间状态只存在内存中，**房间服务重启后所有房间都会消失**（账号数据存在 SQLite 里，不受影响）。
- 一个账号同时只能在一个房间里；在别处切换房间时，其他标签页会自动同步退出。
- 断线后会自动重连并重新加入原房间，网络抖动不会把人踢出协作。
- 位置上报客户端节流 500ms、服务端兜底节流 200ms。

房间服务的可配置项见 `room-server/.env.example`。

### Docker 部署 <small>[Docker Deployment]</small>

```
$ cp .env.example .env
# 编辑 .env，至少要填 JWT_SECRET：
$ openssl rand -hex 32

$ docker compose up -d --build
```

`docker compose` 会起两个容器：

| 服务 | 说明 | 端口 |
| --- | --- | --- |
| `web` | nginx，托管前端静态产物，并把 `/api` 与 `/ws` 反代给 `room-server` | 映射到宿主机 `${PORT}`（默认 8080） |
| `room-server` | 房间服务 | 仅容器网络内可见，不映射到宿主机 |

也就是说，**对外只有一个端口**。前端、认证接口、WebSocket 全部同源，不存在跨域问题，
也不需要给房间服务单独配一个域名。

数据落在 `room-data` 这个 named volume 里（`/app/data/room.db`），容器重建不会丢账号。

### 配合 nginx-proxy-manager 做 HTTPS <small>[HTTPS via nginx-proxy-manager]</small>

HTTPS 由外层的 nginx-proxy-manager（下称 NPM）终止，容器内部保持明文 HTTP。
在 NPM 里新建一个 Proxy Host：

- **Domain Names**：你的域名
- **Scheme**：`http`
- **Forward Hostname / IP** 与 **Forward Port**：二选一
  - 走宿主机端口：填宿主机地址 + `8080`（即 `.env` 里的 `PORT`）
  - NPM 与本项目在同一个 docker 网络：填 `tarkov-assistant` + `80`（容器内端口，
    此时 `docker-compose.yml` 里的端口映射可以直接删掉）
- **Websockets Support**：**必须打开**，否则协作房间连不上
- **Block Common Exploits**：可以打开
- **SSL** 标签页：申请 / 选择证书，建议同时打开 `Force SSL` 与 `HTTP/2 Support`

只需要配置这一个 Proxy Host，`/api` 与 `/ws` 会由容器内的 nginx 继续转发，不用在 NPM 里
额外加 location。

几个容易踩的点：

- **`COOKIE_SECURE` 保持 `true`**。refresh token 存在 `HttpOnly` + `Secure` 的 Cookie 里，
  浏览器侧是 https，所以必须带 `Secure`。如果你在纯 HTTP 环境下自测且登录态无法保持，
  才需要临时改成 `false`。
- **`TRUST_PROXY_HOPS` 保持 `1`**。容器内的 nginx 已经用 `set_real_ip_from` +
  `real_ip_recursive off` 把 `X-Forwarded-For` 归一化成单一的真实客户端 IP，外层再套
  多少级反代都不需要改这个值。把它调大反而会让客户端可以通过伪造 `X-Forwarded-For`
  绕过登录接口的限流。
- 如果宿主机开着防火墙，`${PORT}` 只需要对 NPM 开放，不必对公网开放。想更保险可以把
  `docker-compose.yml` 里的端口映射改成 `"127.0.0.1:${PORT:-8080}:80"`。

### 安全说明 <small>[Security Notes]</small>

- `JWT_SECRET` 是签发登录凭证的密钥。请勿提交到版本库（`.env` 已被 gitignore），
  泄露后需要更换，更换会使所有人的登录态失效。
- access token 只存在浏览器内存中（30 分钟有效期），refresh token 存在 `HttpOnly` Cookie 里
  并在每次刷新时轮转，检测到重放会立即作废该条登录链。
- 登录、注册、会话刷新接口都有基于客户端 IP 的限流。
- 房间服务只暴露注册 / 登录 / 会话相关的接口，不涉及任何游戏账号信息。

### 开源协议 & GPL v3 <small>[Opensource & GPL v3]</small>

本项目以 GPL v3 协议开源，衍生自 [tiltysola/tarkov-tilty-frontend-opensource](https://github.com/tiltysola/tarkov-tilty-frontend-opensource)，
在其基础上做了修改（详见 git 提交历史）。

原始代码 Copyright 2022-2024, TiltySola.

GPL v3 要求衍生作品保留原始版权声明、继续以 GPL v3 分发，并注明已被修改，
因此上面这两行请勿删除。完整协议见 [LICENSE](./LICENSE)。

This project is licensed under GPL v3. It is a modified derivative of
[tiltysola/tarkov-tilty-frontend-opensource](https://github.com/tiltysola/tarkov-tilty-frontend-opensource).
Original code Copyright 2022-2024, TiltySola.
