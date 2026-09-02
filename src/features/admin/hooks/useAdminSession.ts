import { useCallback, useEffect, useRef, useState } from 'react';

import { adminApi } from '@/features/admin/services/adminApi';
import { ApiError } from '@/features/auth/services/http';

type SessionState =
  /** 正在确认 cookie 里的管理会话是否还有效。 */
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; username: string }
  /** 服务端没配管理员凭据，后台整体停用。 */
  | { status: 'disabled'; message: string };

/**
 * 管理会话。刷新页面后靠 httpOnly cookie 恢复，所以前端不持有任何凭据，
 * 只需要问一次服务端「我还登着吗」。
 */
const useAdminSession = () => {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    // StrictMode 下 effect 会跑两次，这里只探测一次。
    if (bootstrappedRef.current) {
      return;
    }
    bootstrappedRef.current = true;

    let cancelled = false;
    adminApi
      .session()
      .then(({ username }) => {
        if (!cancelled) {
          setState({ status: 'authenticated', username });
        }
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        if (err instanceof ApiError && err.status === 503) {
          setState({ status: 'disabled', message: err.message });
          return;
        }
        setState({ status: 'anonymous' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const session = await adminApi.login(username, password);
    setState({ status: 'authenticated', username: session.username });
  }, []);

  const logout = useCallback(async () => {
    try {
      await adminApi.logout();
    } finally {
      // 无论服务端是否成功，本地一定要退出，避免停在一个已失效的面板上。
      setState({ status: 'anonymous' });
    }
  }, []);

  /** 会话中途过期时，把界面切回登录态。 */
  const markExpired = useCallback(() => {
    setState({ status: 'anonymous' });
  }, []);

  return { state, login, logout, markExpired };
};

export default useAdminSession;
