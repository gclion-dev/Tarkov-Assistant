import { atom } from 'recoil';

import type { RoomState } from '@/features/room/types';

export interface RoomClientState {
  /** socket 是否处于已连接状态。 */
  connected: boolean;
  /** 正在创建 / 加入房间。 */
  pending: boolean;
  room: RoomState | null;
  /**
   * 期望所在的房间号。与 room 分开保存，是为了在断线后仍然记得该回到哪个房间，
   * 网络恢复时自动重新加入，而不是把用户静默踢出协作。
   */
  desiredRoomId: string | null;
  error: string | null;
}

export const initialRoomState: RoomClientState = {
  connected: false,
  pending: false,
  room: null,
  desiredRoomId: null,
  error: null,
};

const roomState = atom<RoomClientState>({
  key: 'roomState',
  default: initialRoomState,
});

export default roomState;
