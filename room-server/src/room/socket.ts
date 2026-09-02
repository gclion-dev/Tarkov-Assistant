import type { Server, Socket } from 'socket.io';
import { z } from 'zod';

import { verifyAccessToken } from '../auth/jwt.js';
import { isUserActive } from '../auth/users.js';
import config from '../config.js';
import {
  createRoom,
  findRoomByUserId,
  joinRoom,
  leaveRoom,
  leaveSocket,
  roomToSync,
  updateLocation,
} from './manager.js';

interface SocketData {
  userId: string;
  nickname: string;
  roomId?: string;
  /** 事件配额，防止单个连接刷事件打爆服务端。 */
  quota: { count: number; windowStart: number };
  lastLocationAt: number;
}

type AckResponse<T> = { ok: true; data: T } | { ok: false; error: string };
type Ack<T> = (res: AckResponse<T>) => void;

type SyncedRoom = ReturnType<typeof roomToSync>;

const roomIdSchema = z.object({
  roomId: z
    .string({ required_error: '请输入房间号' })
    .trim()
    .length(6, '房间号为 6 位')
    .regex(/^[A-Za-z0-9]+$/, '房间号只能包含字母和数字'),
});

// 位置数据会被广播给同房间的其他客户端并直接进入 leaflet 渲染，
// 必须在服务端校验，否则一个恶意客户端可以让同房间所有人的地图报错。
const locationSchema = z.object({
  mapId: z.string().min(1).max(64),
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  quaternion: z.array(z.number().finite()).length(4).optional(),
});

const QUOTA_WINDOW_MS = 10 * 1000;

const getData = (socket: Socket) => socket.data as SocketData;

/**
 * setupRoomSocket 建立的 io 引用，供管理后台强制踢人使用。
 * 不把 io 传进 admin 路由，是为了避免路由层依赖 socket 层的完整实现。
 */
let ioRef: Server | null = null;

/**
 * 断开某个账号的全部连接。管理员停用账号或强制下线时调用。
 *
 * 不需要在这里手动清理房间：断开会触发各 socket 自己的 disconnect 处理，
 * 那里已经有「最后一个连接断开才算离开房间」并广播房间状态的逻辑。
 */
export const disconnectUserSockets = (userId: string, message: string) => {
  if (!ioRef) {
    return 0;
  }
  const sockets = Array.from(ioRef.sockets.sockets.values()).filter(
    (item) => (item.data as SocketData).userId === userId,
  );
  sockets.forEach((socket) => {
    socket.emit('room:error', { message });
    socket.disconnect(true);
  });
  return sockets.length;
};

/** 超出配额直接断开，返回 true 表示本次事件应被丢弃。 */
const exceedsQuota = (socket: Socket) => {
  const data = getData(socket);
  const now = Date.now();
  if (now - data.quota.windowStart > QUOTA_WINDOW_MS) {
    data.quota = { count: 0, windowStart: now };
  }
  data.quota.count += 1;
  if (data.quota.count > config.room.eventBurst) {
    socket.emit('room:error', { message: '操作过于频繁，连接已断开' });
    socket.disconnect(true);
    return true;
  }
  return false;
};

/**
 * socket.io v4 不会捕获事件处理器里抛出的异常，未处理的异常会直接打挂整个进程。
 * 所有业务处理器都必须经过这里包一层。
 */
const handle =
  <T>(socket: Socket, handler: (payload: unknown, ack?: Ack<T>) => void) =>
  (...args: unknown[]) => {
    const ack = args.find((arg) => typeof arg === 'function') as Ack<T> | undefined;
    const payload = args.find((arg) => typeof arg !== 'function');
    if (exceedsQuota(socket)) {
      return;
    }
    try {
      handler(payload, ack);
    } catch (err) {
      console.error('[socket] 事件处理失败：', err);
      ack?.({ ok: false, error: '服务器内部错误' });
    }
  };

export const setupRoomSocket = (io: Server) => {
  ioRef = io;

  const socketsOfUser = (userId: string) =>
    Array.from(io.sockets.sockets.values()).filter(
      (item) => (item.data as SocketData).userId === userId,
    );

  /**
   * 成员变动时广播房间完整状态。
   * 增量事件（加入/离开/换房主）很容易漏发或错序，导致成员列表里残留幽灵成员；
   * 只有高频的位置上报才用增量。
   */
  const emitState = (roomId: string, room: SyncedRoom) => {
    io.to(roomId).emit('room:state', room);
  };

  /** 把该账号的所有连接都移出房间，并通知其他标签页同步清空本地房间状态。 */
  const detachAccount = (userId: string, roomId: string, originSocketId: string) => {
    socketsOfUser(userId).forEach((item) => {
      const itemData = item.data as SocketData;
      if (itemData.roomId === roomId) {
        itemData.roomId = undefined;
      }
      item.leave(roomId);
      if (item.id !== originSocketId) {
        item.emit('room:detached', { roomId });
      }
    });
  };

  /** 主动离开 / 切换房间：整个账号退出。 */
  const leaveCurrentRoom = (socket: Socket, roomId: string) => {
    const data = getData(socket);
    const result = leaveRoom(roomId, data.userId);
    detachAccount(data.userId, roomId, socket.id);
    if (result.removed && result.room) {
      emitState(roomId, roomToSync(result.room));
    }
  };

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error('Unauthorized'));
      return;
    }
    try {
      const payload = verifyAccessToken(token);
      // 被停用的账号不能再建/进房间，也不能继续广播位置。
      if (!isUserActive(payload.sub)) {
        next(new Error('Forbidden'));
        return;
      }
      Object.assign(socket.data as SocketData, {
        userId: payload.sub,
        nickname: payload.nickname,
        quota: { count: 0, windowStart: Date.now() },
        lastLocationAt: 0,
      });
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const data = getData(socket);

    socket.on(
      'room:create',
      handle<{ roomId: string; room: SyncedRoom }>(socket, (_payload, ack) => {
        // 一个账号同时只在一个房间里。离开旧房间时必须通知旧房间的其他人，
        // 否则他们的成员列表里会残留一个永远不会消失的幽灵成员。
        const existing = findRoomByUserId(data.userId);
        if (existing) {
          leaveCurrentRoom(socket, existing.id);
        }
        const room = createRoom(data.userId, data.nickname, socket.id);
        data.roomId = room.id;
        socket.join(room.id);
        ack?.({ ok: true, data: { roomId: room.id, room: roomToSync(room) } });
      }),
    );

    socket.on(
      'room:join',
      handle<{ room: SyncedRoom }>(socket, (payload, ack) => {
        const parsed = roomIdSchema.safeParse(payload ?? {});
        if (!parsed.success) {
          ack?.({ ok: false, error: parsed.error.issues[0]?.message || '房间号不合法' });
          return;
        }
        const targetId = parsed.data.roomId.toUpperCase();

        // 先尝试加入，成功后才离开旧房间。
        // 反过来做的话，输错房间号或目标房间已满都会把人从当前房间里踢出去。
        const existing = findRoomByUserId(data.userId);
        const result = joinRoom(targetId, data.userId, data.nickname, socket.id);
        if ('error' in result) {
          ack?.({ ok: false, error: result.error });
          return;
        }
        if (existing && existing.id !== result.room.id) {
          leaveCurrentRoom(socket, existing.id);
        }
        data.roomId = result.room.id;
        socket.join(result.room.id);
        // 首次加入、多标签页、断线重连都走同一条路径。
        emitState(result.room.id, roomToSync(result.room));
        ack?.({ ok: true, data: { room: roomToSync(result.room) } });
      }),
    );

    socket.on(
      'room:leave',
      handle<null>(socket, (_payload, ack) => {
        if (data.roomId) {
          leaveCurrentRoom(socket, data.roomId);
        }
        ack?.({ ok: true, data: null });
      }),
    );

    socket.on(
      'location:update',
      handle<null>(socket, (payload, ack) => {
        const roomId = data.roomId;
        if (!roomId) {
          ack?.({ ok: false, error: '尚未加入房间' });
          return;
        }
        const now = Date.now();
        // 服务端兜底节流：客户端自己的 500ms 节流不可信。
        if (now - data.lastLocationAt < config.room.locationMinIntervalMs) {
          return;
        }
        const parsed = locationSchema.safeParse(payload);
        if (!parsed.success) {
          ack?.({ ok: false, error: '位置数据不合法' });
          return;
        }
        data.lastLocationAt = now;
        const result = updateLocation(roomId, data.userId, { ...parsed.data, updatedAt: now });
        if (result) {
          socket.to(roomId).emit('location:updated', {
            userId: data.userId,
            location: result.member.location,
          });
        }
        ack?.({ ok: true, data: null });
      }),
    );

    socket.on('disconnect', () => {
      try {
        const roomId = data.roomId;
        if (!roomId) {
          return;
        }
        data.roomId = undefined;
        // 只摘掉当前这一个连接：同一账号的其他标签页仍在房间里时不应该被踢出。
        const result = leaveSocket(roomId, data.userId, socket.id);
        if (result.removed && result.room) {
          emitState(roomId, roomToSync(result.room));
        }
      } catch (err) {
        console.error('[socket] 断开连接清理失败：', err);
      }
    });
  });
};
