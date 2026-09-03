import { useCallback } from 'react';

import { useRecoilState, useRecoilValue } from 'recoil';

import { addRoomMark, clearRoomMarks, removeRoomMark } from '@/features/room/services/roomSocket';
import { type MapMark, MAX_MAP_MARKS } from '@/features/room/types';
import mapMarkState from '@/store/mapMarkState';
import roomState from '@/store/roomState';

/** 标记 id 只需要在自己的列表内唯一，不需要密码学随机。 */
const createMarkId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * 坐标标记的读写入口。
 *
 * 自己的标记先写本地（必须立刻出现在地图上），再同步给房间；
 * 服务端拒绝（超出上限等）时回滚本地那一份，避免出现只有自己看得见的幽灵标记。
 */
const useMapMarks = () => {
  const [ownMarks, setOwnMarks] = useRecoilState(mapMarkState);
  const { room } = useRecoilValue(roomState);

  /**
   * 是否需要同步给房间。
   *
   * 必须判断「在房间里」而不是「socket 已连接」：已登录但没进房间时 socket 也是连着的，
   * 这时上报会被服务端以「尚未加入房间」拒掉，进而把本地标记误回滚掉。
   */
  const inRoom = !!room;

  const addMark = useCallback(
    (position: { mapId: string; x: number; z: number }) => {
      if (ownMarks.filter((item) => item.mapId === position.mapId).length >= MAX_MAP_MARKS) {
        return { ok: false as const, reason: 'limit' as const };
      }
      const mark: MapMark = { ...position, id: createMarkId(), createdAt: Date.now() };
      setOwnMarks((prev) => [...prev, mark]);
      if (inRoom) {
        // 服务端拒绝（超出上限等）时回滚本地那一份，
        // 否则会留下一个只有自己看得见、队友永远收不到的幽灵标记。
        addRoomMark({ id: mark.id, mapId: mark.mapId, x: mark.x, z: mark.z }).catch(() => {
          setOwnMarks((prev) => prev.filter((item) => item.id !== mark.id));
        });
      }
      return { ok: true as const };
    },
    [inRoom, ownMarks, setOwnMarks],
  );

  const removeMark = useCallback(
    (id: string) => {
      setOwnMarks((prev) => prev.filter((item) => item.id !== id));
      if (inRoom) {
        // 删除失败不回滚：本地已经消失了，再让它冒出来更困扰人。
        removeRoomMark(id).catch(() => undefined);
      }
    },
    [inRoom, setOwnMarks],
  );

  const clearMarks = useCallback(
    (mapId?: string) => {
      setOwnMarks((prev) => (mapId ? prev.filter((item) => item.mapId !== mapId) : []));
      if (inRoom) {
        clearRoomMarks(mapId).catch(() => undefined);
      }
    },
    [inRoom, setOwnMarks],
  );

  return { ownMarks, addMark, removeMark, clearMarks };
};

export default useMapMarks;
