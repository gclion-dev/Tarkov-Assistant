import type { AuthSession, AuthUser } from '@/features/auth/types';

import { request } from './http';

export const authApi = {
  register: (email: string, password: string, nickname: string) =>
    request<AuthSession>({
      url: '/api/auth/register',
      method: 'POST',
      data: { email, password, nickname },
    }),

  login: (email: string, password: string) =>
    request<AuthSession>({ url: '/api/auth/login', method: 'POST', data: { email, password } }),

  refresh: () => request<AuthSession>({ url: '/api/auth/refresh', method: 'POST' }),

  logout: () => request<null>({ url: '/api/auth/logout', method: 'POST' }),

  me: () => request<{ user: AuthUser }>({ url: '/api/auth/me', method: 'GET' }),
};

export default authApi;
