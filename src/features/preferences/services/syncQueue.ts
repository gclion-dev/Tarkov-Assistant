import { ApiError } from '@/features/auth/services/http';
import { prefsApi } from '@/features/preferences/services/prefsApi';
import type { PreferencesEnvelope, UserPreferences } from '@/features/preferences/types';

/**
 * 偏好写入云端的队列。
 *
 * 做成模块单例而不是挂在组件里：patch() 会被多个组件调用，
 * debounce 定时器和 baseVersion 必须全局只有一份，否则拖一次滑块能打出几十个 PUT。
 */

/** 拖动画笔粗细这类连续操作，等停手后再写一次。 */
const DEBOUNCE_MS = 1500;

let enabled = false;
let baseVersion = 0;
let pending: UserPreferences | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;

type RemoteHandler = (envelope: PreferencesEnvelope) => void;
type StatusHandler = (syncing: boolean) => void;

let onRemote: RemoteHandler | null = null;
let onStatus: StatusHandler | null = null;

export const configureSync = (handlers: { onRemote: RemoteHandler; onStatus: StatusHandler }) => {
  onRemote = handlers.onRemote;
  onStatus = handlers.onStatus;
};

const clearTimer = () => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
};

/** 登录成功并完成首次合并后开启；登出时关闭并丢弃未写入的内容。 */
export const setSyncEnabled = (value: boolean, version = 0) => {
  enabled = value;
  baseVersion = version;
  if (!value) {
    clearTimer();
    pending = null;
  }
};

export const setBaseVersion = (version: number) => {
  baseVersion = version;
};

/*
 * await 之后回写 baseVersion 会被 require-atomic-updates 判成竞态。
 * 这里不会发生：doFlush 只通过 runFlush 的 promise 链调用，永远不会有两个实例同时在跑。
 */
/* eslint-disable require-atomic-updates */
const doFlush = async () => {
  if (!enabled || !pending) {
    return;
  }
  const payload = pending;
  pending = null;
  onStatus?.(true);
  try {
    const envelope = await prefsApi.put(payload, baseVersion);
    baseVersion = envelope.version;
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      // 版本冲突：另一个设备/标签页先写了。按既定策略「服务端优先」，
      // 重新拉一次并覆盖本地，而不是把本地内容强推上去。
      try {
        const envelope = await prefsApi.get();
        if (envelope) {
          baseVersion = envelope.version;
          onRemote?.(envelope);
        }
      } catch {
        // 拉取也失败就保持本地状态，下次改动会再试。
      }
    } else if (err instanceof ApiError && err.status === 401) {
      // 会话已失效，停止同步。AuthProvider 那边会把用户态清掉。
      setSyncEnabled(false);
    } else {
      // 网络问题等：偏好在 localStorage 里是安全的，下次改动会重新触发写入。
      console.warn('[preferences] 同步到云端失败：', err);
    }
  } finally {
    onStatus?.(false);
  }
};
/* eslint-enable require-atomic-updates */

/** 串行执行，避免两次 PUT 并发导致 baseVersion 相互覆盖。 */
const runFlush = () => {
  inflight = (inflight ?? Promise.resolve()).then(doFlush);
  return inflight;
};

export const scheduleSync = (prefs: UserPreferences) => {
  if (!enabled) {
    return;
  }
  pending = prefs;
  clearTimer();
  timer = setTimeout(() => {
    timer = null;
    runFlush();
  }, DEBOUNCE_MS);
};

/** 立刻写入待同步内容。用于页面隐藏 / 关闭前，避免丢掉最后一次改动。 */
export const flushSync = () => {
  clearTimer();
  return runFlush();
};

/** 首次登录且云端无记录时，把本地偏好整体推上去。 */
export const pushInitial = async (prefs: UserPreferences) => {
  onStatus?.(true);
  try {
    const envelope = await prefsApi.put(prefs, 0);
    baseVersion = envelope.version;
    return envelope;
  } finally {
    onStatus?.(false);
  }
};
