export type AdminUserStatus = 'active' | 'disabled';

export interface AdminUser {
  id: string;
  email: string;
  nickname: string;
  status: AdminUserStatus;
  createdAt: number;
  /** 最近一次被改状态的时间，从未改过为 null。 */
  statusUpdatedAt: number | null;
  /** 未撤销且未过期的 refresh token 数，约等于该账号当前登录的设备数。 */
  activeSessions: number;
  /** 云端偏好最后一次写入时间，没同步过则为 null。 */
  prefsUpdatedAt: number | null;
}

export interface AdminStats {
  userTotal: number;
  userActive: number;
  userDisabled: number;
  /** 最近 7 天新注册。 */
  userRecent: number;
  activeSessions: number;
  rooms: number;
}

export interface AdminUserPage {
  total: number;
  page: number;
  pageSize: number;
  items: AdminUser[];
}

export interface AdminUserQuery {
  search?: string;
  status: 'all' | AdminUserStatus;
  page: number;
  pageSize: number;
}

export interface AdminSession {
  username: string;
}
