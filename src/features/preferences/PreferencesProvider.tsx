import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';

import { useSetRecoilState } from 'recoil';

import useAuth from '@/features/auth/hooks/useAuth';
import {
  PREFERENCES_STORAGE_KEY,
  sanitizePreferences,
} from '@/features/preferences/services/localStore';
import { prefsApi } from '@/features/preferences/services/prefsApi';
import {
  getPreferences,
  setPreferences,
  subscribePreferences,
} from '@/features/preferences/services/prefsStore';
import {
  configureSync,
  flushSync,
  pushInitial,
  setSyncEnabled,
} from '@/features/preferences/services/syncQueue';
import type { PreferencesEnvelope } from '@/features/preferences/types';
import preferencesState from '@/store/preferencesState';

/**
 * 偏好的唯一副作用持有者：负责云端拉取、登录时的合并、以及页面隐藏前的 flush。
 *
 * 和 AuthProvider 同样的理由 —— usePreferences 会被多个组件调用，
 * 把拉取逻辑放进 hook 会导致每次进页面并发打出多个 GET。
 */
const PreferencesProvider = ({ children }: { children: ReactNode }) => {
  const setState = useSetRecoilState(preferencesState);
  const { user, isLoading } = useAuth();

  /** 已经完成过合并的用户 id，用于识别「换账号登录」。 */
  const syncedUserRef = useRef<string | null>(null);

  // prefsStore 是唯一持有者，recoil 只做镜像。
  useEffect(() => {
    const unsubscribe = subscribePreferences((prefs) => {
      setState((prev) => ({ ...prev, prefs }));
    });
    return unsubscribe;
  }, [setState]);

  const applyRemote = useCallback(
    (envelope: PreferencesEnvelope) => {
      // 云端拉下来的值不能再推回云端，否则会和别的设备来回打。
      setPreferences(sanitizePreferences(envelope.payload), { persist: true, sync: false });
      setState((prev) => ({ ...prev, status: 'synced', hydrated: true }));
    },
    [setState],
  );

  useEffect(() => {
    configureSync({
      onRemote: applyRemote,
      onStatus: (syncing) => {
        setState((prev) => {
          // 未登录时不改状态，避免把 'local' 覆盖成 'synced'。
          if (!prev.hydrated) {
            return prev;
          }
          return { ...prev, status: syncing ? 'syncing' : 'synced' };
        });
      },
    });
  }, [applyRemote, setState]);

  useEffect(() => {
    // 会话恢复还没结束，先不动，否则会误判成「未登录」而关掉同步。
    if (isLoading) {
      return;
    }

    if (!user) {
      // 登出：停止同步，但保留本地偏好。换账号登录时会被新账号的云端值覆盖。
      if (syncedUserRef.current) {
        syncedUserRef.current = null;
        setSyncEnabled(false);
        setState((prev) => ({ ...prev, status: 'local', hydrated: false }));
      }
      return;
    }

    if (syncedUserRef.current === user.id) {
      return;
    }
    syncedUserRef.current = user.id;

    let cancelled = false;
    const merge = async () => {
      // 换账号时上一个账号可能还有待写入的内容，先丢掉，避免写进新账号。
      setSyncEnabled(false);
      try {
        const envelope = await prefsApi.get();
        if (cancelled) {
          return;
        }
        if (envelope) {
          // 服务端优先：登录这个动作本身就表达了「我要拿回我的配置」。
          applyRemote(envelope);
          setSyncEnabled(true, envelope.version);
          toast.info('已恢复你的云端设置');
        } else {
          // 云端首次记录：把匿名期间的设置整体推上去，不让一次登录清空用户的调整。
          const created = await pushInitial(getPreferences());
          if (cancelled) {
            return;
          }
          setState((prev) => ({ ...prev, status: 'synced', hydrated: true }));
          setSyncEnabled(true, created.version);
        }
      } catch (err) {
        if (!cancelled) {
          // 拉取失败不影响使用，继续用本地偏好，只是这次不同步。
          // 清掉标记，下次登录态变化时还会再试一次。
          console.warn('[preferences] 拉取云端设置失败，继续使用本地设置：', err);
          setState((prev) => ({ ...prev, status: 'local', hydrated: false }));
          syncedUserRef.current = null;
        }
      }
    };
    merge();

    return () => {
      cancelled = true;
    };
  }, [user, isLoading, applyRemote, setState]);

  // 页面隐藏 / 关闭前把 debounce 中的改动写出去，避免丢掉最后一次调整。
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushSync();
      }
    };
    const onPageHide = () => {
      flushSync();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  // 多标签页：另一个标签改了偏好，这边同步过来，避免互相覆盖。
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== PREFERENCES_STORAGE_KEY || !e.newValue) {
        return;
      }
      try {
        const parsed = JSON.parse(e.newValue) as { payload?: unknown };
        // 值已经在存储里了，也不需要再推一次云端（写入方那边已经推了）。
        setPreferences(sanitizePreferences(parsed.payload), { persist: false, sync: false });
      } catch {
        // 别的标签写了非法内容，忽略。
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [setState]);

  return <>{children}</>;
};

export default PreferencesProvider;
