import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';

import { getAccessToken, setAccessToken } from './tokenStore';

/**
 * 房间服务专用的 axios 实例。
 *
 * 刻意不使用全局的 axios 单例：全局拦截器会给项目里所有 axios 请求
 * （包括将来可能出现的第三方接口调用）都带上 Authorization 头，等于把凭证外发。
 */
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export interface ApiEnvelope<T> {
  code?: number;
  data: T;
  errorMessage?: string;
  extra?: string;
}

/** 统一的错误类型：全项目只抛 Error，避免出现 reject(string) 与 reject(Error) 混用。 */
export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RetriableConfig extends AxiosRequestConfig {
  /** 标记已经为 401 重试过一次，防止无限重试。 */
  __retried?: boolean;
}

const http = axios.create({
  baseURL: API_BASE,
  // refresh token 放在 httpOnly cookie 里，所有请求都要带上。
  withCredentials: true,
  timeout: 15000,
});

const isAuthEndpoint = (url?: string) => String(url || '').includes('/api/auth/');

http.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;

/**
 * 单飞刷新：并发的多个 401 只会触发一次 /refresh，其余请求复用同一个 promise。
 * 这一点在服务端启用 refresh token 轮转后尤其重要，否则并发刷新会被判成 token 重放。
 */
export const refreshAccessToken = () => {
  if (!refreshPromise) {
    refreshPromise = http
      .post<ApiEnvelope<{ accessToken: string }>>('/api/auth/refresh')
      .then((res) => {
        const token = res.data?.data?.accessToken;
        if (!token) {
          throw new ApiError('刷新登录状态失败');
        }
        setAccessToken(token);
        return token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

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

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<{ errorMessage?: string; extra?: string }>) => {
    const config = error.config as RetriableConfig | undefined;
    const retriable =
      error.response?.status === 401 &&
      !!config &&
      !config.__retried &&
      !isAuthEndpoint(config.url);
    if (retriable && config) {
      config.__retried = true;
      try {
        const token = await refreshAccessToken();
        config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
        return http.request(config);
      } catch {
        // 刷新失败即会话结束。清空 token 后 AuthProvider 会同步清掉用户态。
        setAccessToken(null);
      }
    }
    throw toApiError(error);
  },
);

/** 解包 `{ code, data, errorMessage }` 信封，只把业务数据交给调用方。 */
export const request = async <T>(config: AxiosRequestConfig): Promise<T> => {
  const res = await http.request<ApiEnvelope<T>>(config);
  const body = res.data;
  if (!body || typeof body !== 'object') {
    throw new ApiError('接口返回格式异常');
  }
  if (body.code !== undefined && body.code !== 200) {
    throw new ApiError(body.errorMessage || body.extra || '请求失败', body.code);
  }
  return body.data;
};

/** 把任意异常转成可以直接展示给用户的文案。 */
export const getErrorMessage = (error: unknown, fallback = '操作失败') => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return fallback;
};

export default http;
