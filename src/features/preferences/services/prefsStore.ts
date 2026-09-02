import {
  loadLocalPreferences,
  sanitizePreferences,
  saveLocalPreferences,
} from '@/features/preferences/services/localStore';
import { scheduleSync } from '@/features/preferences/services/syncQueue';
import type { UserPreferences } from '@/features/preferences/types';

/**
 * 偏好的唯一持有者，recoil 只做镜像供 UI 读取
 * （与 auth 的 tokenStore 同一套约定）。
 *
 * 不把「写 localStorage / 触发同步」放进 recoil 的 setState 更新函数里：
 * 更新函数必须是纯的，StrictMode 下会被调用两次，副作用也会跟着重复。
 * 放在这里还能让 patch 拿到同步的最新值，连续两次 patch 不会丢掉第一次。
 */

let current: UserPreferences = loadLocalPreferences();

type Listener = (prefs: UserPreferences) => void;
const listeners = new Set<Listener>();

export const getPreferences = () => current;

export const subscribePreferences = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

interface SetOptions {
  /** 写入 localStorage。来自别的标签页的变更已经在存储里了，无需回写。 */
  persist?: boolean;
  /** 推送到云端。云端拉下来的值不能再推回去。 */
  sync?: boolean;
}

export const setPreferences = (next: UserPreferences, options: SetOptions = {}) => {
  const { persist = true, sync = false } = options;
  current = sanitizePreferences(next);
  if (persist) {
    saveLocalPreferences(current);
  }
  if (sync) {
    scheduleSync(current);
  }
  listeners.forEach((listener) => listener(current));
  return current;
};

/** 用户改动偏好的入口：本地立即生效（乐观更新），云端由 syncQueue 去 debounce。 */
export const patchPreferences = (partial: Partial<UserPreferences>) =>
  setPreferences({ ...current, ...partial }, { persist: true, sync: true });
