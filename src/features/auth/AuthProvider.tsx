import { type ReactNode, useEffect, useRef } from 'react';

import { useSetRecoilState } from 'recoil';

import { authApi } from '@/features/auth/services/authApi';
import {
  getAccessToken,
  setAccessToken,
  subscribeAccessToken,
} from '@/features/auth/services/tokenStore';
import authState from '@/store/authState';

/**
 * 会话恢复只应该发生一次。
 *
 * 之前的实现把恢复逻辑放在 useAuth 的 useEffect 里，而 useAuth 被四五个组件同时调用，
 * 于是每次进页面都会并发打出多次 /api/auth/refresh；在服务端启用 refresh token 轮转后
 * 这种并发还会被误判成 token 重放。这里把副作用收敛到全局唯一的 Provider。
 */
const AuthProvider = ({ children }: { children: ReactNode }) => {
  const setState = useSetRecoilState(authState);
  const bootstrappedRef = useRef(false);

  // tokenStore 是 token 的唯一持有者，recoil 只做镜像供 UI 读取。
  useEffect(() => {
    const unsubscribe = subscribeAccessToken((token) => {
      setState((prev) => ({
        ...prev,
        accessToken: token,
        // token 被清空意味着会话结束（例如刷新失败），用户态必须一起清掉。
        user: token ? prev.user : null,
      }));
    });
    return unsubscribe;
  }, [setState]);

  useEffect(() => {
    // React.StrictMode 下 effect 会执行两次，用 ref 保证只恢复一次会话。
    if (bootstrappedRef.current) {
      return;
    }
    bootstrappedRef.current = true;

    let cancelled = false;

    const restore = async () => {
      // 客户端壳注入的 token 优先（window.clientAccessToken 由外部客户端提供）。
      const injected = window.clientAccessToken;
      if (injected) {
        setAccessToken(injected);
        try {
          const { user } = await authApi.me();
          if (!cancelled) {
            setState({ user, accessToken: getAccessToken(), isLoading: false });
          }
          return;
        } catch {
          setAccessToken(null);
        }
      }
      try {
        const session = await authApi.refresh();
        setAccessToken(session.accessToken);
        if (!cancelled) {
          setState({ user: session.user, accessToken: session.accessToken, isLoading: false });
        }
      } catch {
        if (!cancelled) {
          setState({ user: null, accessToken: null, isLoading: false });
        }
      }
    };

    restore();
    return () => {
      cancelled = true;
    };
  }, [setState]);

  return <>{children}</>;
};

export default AuthProvider;
