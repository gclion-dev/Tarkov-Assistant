import type { AuthConfig, AuthSession, AuthUser } from '@/features/auth/types';

import { request } from './http';

export const authApi = {
  config: () => request<AuthConfig>({ url: '/api/auth/config', method: 'GET' }),

  register: (email: string, password: string, nickname: string, inviteCode?: string) =>
    request<AuthSession>({
      url: '/api/auth/register',
      method: 'POST',
      // 服务端未开启邀请码时不要传空串，避免落进「邀请码格式不正确」的分支。
      data: { email, password, nickname, inviteCode: inviteCode || undefined },
    }),

  login: (email: string, password: string) =>
    request<AuthSession>({ url: '/api/auth/login', method: 'POST', data: { email, password } }),

  refresh: () => request<AuthSession>({ url: '/api/auth/refresh', method: 'POST' }),

  logout: () => request<null>({ url: '/api/auth/logout', method: 'POST' }),

  me: () => request<{ user: AuthUser }>({ url: '/api/auth/me', method: 'GET' }),
};

export default authApi;
