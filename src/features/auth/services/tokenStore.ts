/**
 * access token 的唯一持有者。
 *
 * 刻意只放在内存里，不落 localStorage：持久化由 httpOnly 的 refresh cookie 负责，
 * 这样即使页面被 XSS 也拿不到长期凭证。
 * 由本模块（而不是某个 React hook）持有，是为了让 axios 拦截器和 socket 握手
 * 能在 React 渲染周期之外同步读到最新值，避免闭包读到过期的 token。
 */
type Listener = (token: string | null) => void;

let accessToken: string | null = null;
const listeners = new Set<Listener>();

export const getAccessToken = () => accessToken;

export const setAccessToken = (token: string | null) => {
  if (accessToken === token) {
    return;
  }
  accessToken = token;
  listeners.forEach((listener) => listener(token));
};

export const subscribeAccessToken = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
