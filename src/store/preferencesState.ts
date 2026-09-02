import { atom } from 'recoil';

import { getPreferences } from '@/features/preferences/services/prefsStore';
import type { PreferencesSyncStatus, UserPreferences } from '@/features/preferences/types';

export interface PreferencesState {
  prefs: UserPreferences;
  status: PreferencesSyncStatus;
  /** 云端是否已经拉取过一次。用于区分「未登录」和「登录了但还没拉到」。 */
  hydrated: boolean;
}

const preferencesState = atom<PreferencesState>({
  key: 'preferencesState',
  // prefsStore 在模块加载时就同步读好了 localStorage，
  // 首屏直接是用户上次的选择，不会先闪一下默认地图。
  default: {
    prefs: getPreferences(),
    status: 'local',
    hydrated: false,
  },
});

export default preferencesState;
