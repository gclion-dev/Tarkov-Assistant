import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';

import type {
  AdminSession,
  AdminStats,
  AdminUserPage,
  AdminUserQuery,
  AdminUserStatus,
} from '@/features/admin/types';
import { type ApiEnvelope, ApiError } from '@/features/auth/services/http';

/**
 * 管理后台专用的 axios 实例。
 *
 * 刻意不复用 auth 的实例：那个会带上普通用户的 Authorization 头，并在 401 时
 * 去刷新用户会话。管理会话与用户会话是两套完全独立的凭据，混在一起会出现
 * 「用管理员身份带着某个用户的 token」这种既说不清也不该发生的请求。
 */
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

const http = axios.create({
  baseURL: `${API_BASE}/api/admin`,
  // 管理会话在 httpOnly cookie 里，请求必须带上。
  withCredentials: true,
  timeout: 15000,
  headers: {
    // 服务端强制要求这个头。跨站请求无法携带自定义头（会触发预检且不会被放行），
    // 所以它同时充当 CSRF 防护，见 room-server/src/admin/middleware.ts。
    'X-Admin-Request': '1',
  },
});

const toApiError = (error: AxiosError<{ errorMessage?: string; extra?: string }>) => {
  const body = error.response?.data;
  const message = body?.errorMessage || body?.extra;
  if (message) {
    return new ApiError(message, error.response?.status);
  }
  if (error.response) {
    return new ApiError(`请求失败（${error.response.status}）`, error.response.status);
  }
  return new ApiError('网络异常，请检查房间服务是否可用');
};

const request = async <T>(config: AxiosRequestConfig): Promise<T> => {
  let res;
  try {
    res = await http.request<ApiEnvelope<T>>(config);
  } catch (err) {
    throw toApiError(err as AxiosError<{ errorMessage?: string }>);
  }
  const body = res.data;
  if (!body || typeof body !== 'object') {
    throw new ApiError('接口返回格式异常');
  }
  if (body.code !== undefined && body.code !== 200) {
    throw new ApiError(body.errorMessage || body.extra || '请求失败', body.code);
  }
  return body.data;
};

export const adminApi = {
  login: (username: string, password: string) =>
    request<AdminSession>({ url: '/login', method: 'POST', data: { username, password } }),

  logout: () => request<null>({ url: '/logout', method: 'POST' }),

  session: () => request<AdminSession>({ url: '/session', method: 'GET' }),

  stats: () => request<AdminStats>({ url: '/stats', method: 'GET' }),

  users: (query: AdminUserQuery) =>
    request<AdminUserPage>({
      url: '/users',
      method: 'GET',
      params: {
        // 空搜索词不要传，否则服务端会当成一次 LIKE '%%' 全表扫描。
        search: query.search || undefined,
        status: query.status,
        page: query.page,
        pageSize: query.pageSize,
      },
    }),

  setUserStatus: (id: string, status: AdminUserStatus) =>
    request<{ id: string; status: AdminUserStatus; disconnected: number }>({
      url: `/users/${id}/status`,
      method: 'PATCH',
      data: { status },
    }),

  forceLogout: (id: string) =>
    request<{ id: string; disconnected: number }>({
      url: `/users/${id}/logout`,
      method: 'POST',
    }),

  deleteUser: (id: string) =>
    request<{ id: string; email: string; disconnected: number }>({
      url: `/users/${id}`,
      method: 'DELETE',
    }),
};

export default adminApi;
