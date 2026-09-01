import { useCallback } from 'react';

import { useRecoilValue, useSetRecoilState } from 'recoil';

import { authApi } from '@/features/auth/services/authApi';
import { setAccessToken } from '@/features/auth/services/tokenStore';
import type { AuthSession } from '@/features/auth/types';
import authState from '@/store/authState';

/**
 * 纯读取 + 动作的 hook，不包含任何副作用。
 * 会话恢复由全局唯一的 AuthProvider 负责，所以本 hook 可以被任意多个组件安全调用。
 */
const useAuth = () => {
  const state = useRecoilValue(authState);
  const setState = useSetRecoilState(authState);

  const applySession = useCallback(
    (session: AuthSession) => {
      setAccessToken(session.accessToken);
      setState({ user: session.user, accessToken: session.accessToken, isLoading: false });
      return session.user;
    },
    [setState],
  );

  const login = useCallback(
    async (email: string, password: string) => applySession(await authApi.login(email, password)),
    [applySession],
  );

  const register = useCallback(
    async (email: string, password: string, nickname: string) =>
      applySession(await authApi.register(email, password, nickname)),
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // 无论后端是否成功，本地一定要退出登录态。
      setAccessToken(null);
      setState({ user: null, accessToken: null, isLoading: false });
    }
  }, [setState]);

  return {
    user: state.user,
    accessToken: state.accessToken,
    isLoading: state.isLoading,
    isAuthenticated: !!state.accessToken && !!state.user,
    login,
    register,
    logout,
  };
};

export default useAuth;
