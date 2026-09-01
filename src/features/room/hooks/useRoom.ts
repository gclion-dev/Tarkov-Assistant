import { useCallback, useRef } from 'react';

import { useRecoilValue, useSetRecoilState } from 'recoil';

import { getErrorMessage } from '@/features/auth/services/http';
import {
  createRoom as createRoomApi,
  joinRoom as joinRoomApi,
  leaveRoom as leaveRoomApi,
  updateRoomLocation,
} from '@/features/room/services/roomSocket';
import type { PlayerLocation } from '@/features/room/types';
import roomState, { initialRoomState } from '@/store/roomState';

/** 客户端上报节流间隔（服务端另有 200ms 的兜底节流）。 */
const LOCATION_SEND_INTERVAL_MS = 500;

/**
 * 纯读取 + 动作的 hook，可被任意多个组件调用。
 * 连接与事件监听由全局唯一的 RoomProvider 负责。
 */
const useRoom = () => {
  const state = useRecoilValue(roomState);
  const setState = useSetRecoilState(roomState);
  const lastSentAtRef = useRef(0);

  const createRoom = useCallback(async () => {
    setState((prev) => ({ ...prev, pending: true, error: null }));
    try {
      const { roomId, room } = await createRoomApi();
      setState((prev) => ({ ...prev, pending: false, room, desiredRoomId: roomId, error: null }));
      return roomId;
    } catch (err) {
      const message = getErrorMessage(err, '创建房间失败');
      setState((prev) => ({ ...prev, pending: false, error: message }));
      throw new Error(message);
    }
  }, [setState]);

  const joinRoom = useCallback(
    async (roomId: string) => {
      setState((prev) => ({ ...prev, pending: true, error: null }));
      try {
        const room = await joinRoomApi(roomId);
        setState((prev) => ({
          ...prev,
          pending: false,
          room,
          desiredRoomId: room.id,
          error: null,
        }));
        return room.id;
      } catch (err) {
        const message = getErrorMessage(err, '加入房间失败');
        setState((prev) => ({ ...prev, pending: false, error: message }));
        throw new Error(message);
      }
    },
    [setState],
  );

  const leaveRoom = useCallback(async () => {
    try {
      await leaveRoomApi();
    } finally {
      // 即使服务端没回包，本地也要退出，否则界面会卡在“已在房间”的状态。
      setState((prev) => ({ ...initialRoomState, connected: prev.connected }));
    }
  }, [setState]);

  /**
   * 上报自己的位置：先本地乐观更新（自己的箭头必须实时跟手），
   * 再按节流间隔发给服务端。
   */
  const reportLocation = useCallback(
    (location: PlayerLocation, userId: string) => {
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
      const now = Date.now();
      if (now - lastSentAtRef.current >= LOCATION_SEND_INTERVAL_MS) {
        lastSentAtRef.current = now;
        updateRoomLocation(location);
      }
    },
    [setState],
  );

  return {
    room: state.room,
    connected: state.connected,
    pending: state.pending,
    error: state.error,
    createRoom,
    joinRoom,
    leaveRoom,
    reportLocation,
  };
};

export default useRoom;
