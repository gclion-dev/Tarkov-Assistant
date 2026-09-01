import { type ReactNode, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';

import { useRecoilState } from 'recoil';

import useAuth from '@/features/auth/hooks/useAuth';
import { refreshAccessToken } from '@/features/auth/services/http';
import {
  connectRoomSocket,
  disconnectRoomSocket,
  joinRoom,
  onRoomEvent,
  reconnectRoomSocket,
} from '@/features/room/services/roomSocket';
import type { LocationUpdatedPayload, RoomState } from '@/features/room/types';
import roomState, { initialRoomState } from '@/store/roomState';

/**
 * 房间连接的唯一持有者。
 *
 * socket 本身是模块级单例，如果让每个使用方的 hook 各自注册监听与连接/断开，
 * 同一个事件会被处理多次，某个组件卸载还会顺手把别人的连接断掉。
 * 这里把整个生命周期收敛到一个 Provider，useRoom 只读状态。
 */
const RoomProvider = ({ children }: { children: ReactNode }) => {
  // 只依赖登录态：access token 每 30 分钟会刷新一次，但 socket 握手时会通过
  // tokenStore 现取最新值，没必要因为换 token 就重建监听。
  const { isAuthenticated } = useAuth();
  const [state, setState] = useRecoilState(roomState);

  // 事件回调在 React 渲染周期之外执行，用 ref 读取最新的期望房间号。
  const desiredRoomIdRef = useRef(state.desiredRoomId);
  desiredRoomIdRef.current = state.desiredRoomId;

  /** 因鉴权失败而刷新 token 重连的次数，避免 token 确实失效时无限重连。 */
  const authRetryRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectRoomSocket();
      setState(initialRoomState);
      return undefined;
    }

    const socket = connectRoomSocket();

    const onConnect = () => {
      authRetryRef.current = 0;
      setState((prev) => ({ ...prev, connected: true, error: null }));
      // 断线重连后自动回到原来的房间，否则一次网络抖动就等于被静默踢出协作。
      const roomId = desiredRoomIdRef.current;
      if (roomId) {
        joinRoom(roomId)
          .then((room) => {
            setState((prev) => ({ ...prev, room, desiredRoomId: room.id, error: null }));
          })
          .catch((err: unknown) => {
            // 房间可能在断线期间已经解散，这种情况下清空本地状态并告知用户。
            setState((prev) => ({ ...prev, room: null, desiredRoomId: null }));
            toast.info(err instanceof Error ? err.message : '未能重新加入房间');
          });
      }
    };

    const onDisconnect = () => {
      // 保留 room 以维持界面连续性，只标记为未连接；desiredRoomId 留着用于重连。
      setState((prev) => ({ ...prev, connected: false }));
    };

    const onConnectError = (err: Error) => {
      setState((prev) => ({ ...prev, connected: false, pending: false }));
      // 握手中间件返回的错误是致命的，socket.io 不会自动重连。
      // 挂机超过 access token 有效期后重连必然落到这里，先刷新 token 再手动重连一次。
      if (err?.message === 'Unauthorized' && authRetryRef.current < 1) {
        authRetryRef.current += 1;
        refreshAccessToken()
          .then(() => reconnectRoomSocket())
          .catch(() => {
            setState((prev) => ({ ...prev, error: '登录状态已失效，请重新登录' }));
          });
        return;
      }
      setState((prev) => ({ ...prev, error: '房间服务连接失败' }));
    };

    const unsubscribers = [
      // 成员变动一律由服务端下发完整状态，避免增量事件漏发导致的幽灵成员。
      onRoomEvent<RoomState>('room:state', (room) => {
        setState((prev) => ({ ...prev, room, desiredRoomId: room.id, error: null }));
      }),
      onRoomEvent<LocationUpdatedPayload>('location:updated', ({ userId, location }) => {
        setState((prev) => {
          if (!prev.room) {
            return prev;
          }
          return {
            ...prev,
            room: {
              ...prev.room,
              members: prev.room.members.map((member) =>
                (member.userId === userId ? { ...member, location } : member)),
            },
          };
        });
      }),
      // 同一账号在别处切换了房间，本标签页需要同步清空。
      onRoomEvent<{ roomId: string }>('room:detached', () => {
        setState((prev) => ({ ...prev, room: null, desiredRoomId: null }));
      }),
      onRoomEvent<{ message: string }>('room:error', ({ message }) => {
        setState((prev) => ({ ...prev, error: message }));
        toast.error(message);
      }),
    ];

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [isAuthenticated, setState]);

  return <>{children}</>;
};

export default RoomProvider;
