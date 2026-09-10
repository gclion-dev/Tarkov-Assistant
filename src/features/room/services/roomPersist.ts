const STORAGE_KEY = 'im-desired-room';

interface StoredDesiredRoom {
  userId: string;
  roomId: string;
}

const isRoomId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9]{6}$/.test(value);

/**
 * 把「期望所在的房间号」按账号记到 localStorage。
 *
 * Recoil 刷新即丢，不落盘的话 F5 之后本地不知道该回哪个房间，
 * 即使服务端还保留着席位，页面也会表现成已经退出。
 */
export const loadDesiredRoomId = (userId: string): string | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredDesiredRoom;
    if (parsed?.userId === userId && isRoomId(parsed.roomId)) {
      return parsed.roomId.toUpperCase();
    }
    return null;
  } catch {
    return null;
  }
};

export const saveDesiredRoomId = (userId: string, roomId: string | null) => {
  try {
    if (!roomId) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const payload: StoredDesiredRoom = { userId, roomId };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 配额写满或隐私模式：丢了下次刷新会退房间，不该打断当前使用。
  }
};
