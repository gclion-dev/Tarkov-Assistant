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
  /** 按图搜索的当天额度。 */
  imageSearch: AdminImageSearchQuota;
}

export interface AdminImageSearchQuota {
  /** 当天可用次数上限。 */
  limit: number;
  /** 当天已用次数。 */
  used: number;
  remaining: number;
  /** true 表示管理员为这个用户单独分配过额度；false 表示跟随全局默认值。 */
  custom: boolean;
}

export interface AdminStats {
  userTotal: number;
  userActive: number;
  userDisabled: number;
  /** 最近 7 天新注册。 */
  userRecent: number;
  activeSessions: number;
  rooms: number;
  /** 注册是否要求邀请码。为 true 且可用余量为 0 时，等于注册已关闭。 */
  inviteRequired: boolean;
  /** 未停用、未用完、未过期的邀请码数量。 */
  inviteAvailable: number;
  /** 今天全站的按图搜索调用次数。 */
  imageSearchToday: number;
  /** 未单独分配额度的用户按这个上限算。 */
  imageSearchDefaultLimit: number;
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

/** available：还能用；used：名额用完；expired：已过期；disabled：被管理员停用。 */
export type AdminInviteStatus = 'available' | 'used' | 'expired' | 'disabled';

export interface AdminInviteUse {
  /** 注册时使用的邮箱。用户被删除后这条记录依然保留。 */
  email: string;
  /** 对应用户已被删除时为 null。 */
  userId: string | null;
  usedAt: number;
}

export interface AdminInviteCode {
  id: string;
  code: string;
  note: string | null;
  maxUses: number;
  usedCount: number;
  /** null 表示永不过期。 */
  expiresAt: number | null;
  disabled: boolean;
  status: AdminInviteStatus;
  createdBy: string;
  createdAt: number;
  lastUsedAt: number | null;
  uses: AdminInviteUse[];
}

export interface AdminInvitePage {
  total: number;
  page: number;
  pageSize: number;
  items: AdminInviteCode[];
  inviteRequired: boolean;
}

export interface AdminInviteQuery {
  search?: string;
  status: 'all' | AdminInviteStatus;
  page: number;
  pageSize: number;
}

export interface AdminInviteCreateInput {
  count: number;
  maxUses: number;
  /** 0 表示永不过期；不传则用服务端默认有效期。 */
  expiresInDays?: number;
  note?: string;
}
