import { useCallback } from 'react';

import { useRecoilValue } from 'recoil';

import { patchPreferences } from '@/features/preferences/services/prefsStore';
import type { UserPreferences } from '@/features/preferences/types';
import preferencesState from '@/store/preferencesState';

/**
 * 读取 + 修改用户偏好。不含任何拉取/合并副作用，那些都在 PreferencesProvider 里，
 * 所以本 hook 可以被任意多个组件安全调用（与 useAuth 保持同一套约定）。
 */
const usePreferences = () => {
  const state = useRecoilValue(preferencesState);

  const patch = useCallback((partial: Partial<UserPreferences>) => {
    patchPreferences(partial);
  }, []);

  return {
    prefs: state.prefs,
    status: state.status,
    hydrated: state.hydrated,
    isSyncing: state.status === 'syncing',
    patch,
  };
};

export default usePreferences;
