import { atom } from 'recoil';

import type { AuthUser } from '@/features/auth/types';

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  /** 首次会话恢复完成前为 true，用于避免闪一下未登录的界面。 */
  isLoading: boolean;
}

const authState = atom<AuthState>({
  key: 'authState',
  default: {
    user: null,
    accessToken: null,
    isLoading: true,
  },
});

export default authState;
