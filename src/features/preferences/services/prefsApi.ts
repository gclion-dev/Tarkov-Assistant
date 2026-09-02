import { request } from '@/features/auth/services/http';
import type { PreferencesEnvelope, UserPreferences } from '@/features/preferences/types';

/**
 * 复用 auth 的 axios 实例：自动带 Authorization、401 时单飞刷新并重试。
 * 不要新建实例，否则 token 刷新逻辑要写两遍。
 */
export const prefsApi = {
  /** 云端没有记录时返回 null（首次登录的用户）。 */
  get: () => request<PreferencesEnvelope | null>({ url: '/api/preferences', method: 'GET' }),

  put: (payload: UserPreferences, baseVersion: number) =>
    request<PreferencesEnvelope>({
      url: '/api/preferences',
      method: 'PUT',
      data: { payload, baseVersion },
    }),
};

export default prefsApi;
