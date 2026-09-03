import { io, type Socket } from 'socket.io-client';

import { getAccessToken } from '@/features/auth/services/tokenStore';
import type { MapMark, PlayerLocation, RoomState } from '@/features/room/types';

type AckResponse<T> = { ok: true; data: T } | { ok: false; error: string };

const ACK_TIMEOUT_MS = 10000;

let socket: Socket | null = null;

const getSocket = () => {
  if (!socket) {
    socket = io({
      path: '/ws',
      autoConnect: false,
      // 保留 polling 兜底：部分代理与企业网络会阻断 WebSocket。
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      /**
       * 必须用「回调」形式而不是返回值形式。
       * socket.io-client 对函数型 auth 的约定是调用 cb(data)，写成 `() => ({ token })`
       * 既不会发出 CONNECT 包，也无法在自动重连时重新取值。
       * 用回调形式后，每次（包括断线重连）都会读到最新的 access token。
       */
      auth: (cb: (data: { token: string | null }) => void) => {
        cb({ token: getAccessToken() });
      },
    });
  }
  return socket;
};

export const getRoomSocket = getSocket;

export const connectRoomSocket = () => {
  const instance = getSocket();
  // active 为 true 表示正在连接或正在自动重连中，不要重复触发。
  if (!instance.connected && !instance.active) {
    instance.connect();
  }
  return instance;
};

/**
 * 强制重新建立连接。
 * socket.io 把握手中间件抛出的错误当成致命错误，不会自动重连，
 * 因此 token 过期导致握手失败后必须由调用方在刷新 token 后手动重连。
 */
export const reconnectRoomSocket = () => {
  const instance = getSocket();
  if (instance.connected) {
    return instance;
  }
  instance.connect();
  return instance;
};

export const disconnectRoomSocket = () => {
  socket?.disconnect();
};

/** 带超时的 ack 调用，避免服务端不回包时 promise 永远悬挂。 */
const emitWithAck = <T>(event: string, payload?: unknown) =>
  new Promise<T>((resolve, reject) => {
    const instance = connectRoomSocket();
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('房间服务响应超时'));
      }
    }, ACK_TIMEOUT_MS);

    const onAck = (res: AckResponse<T>) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      if (res?.ok) {
        resolve(res.data);
      } else {
        reject(new Error(res?.error || '房间操作失败'));
      }
    };

    if (payload === undefined) {
      instance.emit(event, onAck);
    } else {
      instance.emit(event, payload, onAck);
    }
  });

export const createRoom = () => emitWithAck<{ roomId: string; room: RoomState }>('room:create');

export const joinRoom = (roomId: string) =>
  emitWithAck<{ room: RoomState }>('room:join', { roomId }).then((res) => res.room);

export const leaveRoom = async () => {
  const instance = getSocket();
  if (!instance.connected) {
    return;
  }
  await emitWithAck<null>('room:leave');
};

export const updateRoomLocation = (location: PlayerLocation) => {
  const instance = getSocket();
  if (instance.connected) {
    instance.emit('location:update', location);
  }
};

/**
 * 标记同步。
 *
 * 都用带 ack 的形式：标记是低频操作，且服务端会因为超出上限而拒绝，
 * 调用方需要知道结果才能把本地那一份回滚掉。未连接时直接当作纯本地操作，不报错。
 */
export const addRoomMark = (mark: Omit<MapMark, 'createdAt'>) => {
  if (!getSocket().connected) {
    return Promise.resolve();
  }
  return emitWithAck<null>('mark:add', mark).then(() => undefined);
};

export const removeRoomMark = (id: string) => {
  if (!getSocket().connected) {
    return Promise.resolve();
  }
  return emitWithAck<null>('mark:remove', { id }).then(() => undefined);
};

export const clearRoomMarks = (mapId?: string) => {
  if (!getSocket().connected) {
    return Promise.resolve();
  }
  return emitWithAck<null>('mark:clear', { mapId }).then(() => undefined);
};

export const onRoomEvent = <T>(event: string, handler: (payload: T) => void) => {
  const instance = getSocket();
  instance.on(event, handler as (...args: unknown[]) => void);
  return () => {
    instance.off(event, handler as (...args: unknown[]) => void);
  };
};
