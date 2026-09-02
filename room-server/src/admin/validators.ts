import { z } from 'zod';

import { BATCH_LIMIT, MAX_USES_LIMIT, NOTE_MAX } from '../invites/store.js';

export const adminLoginSchema = z.object({
  username: z
    .string({ required_error: '请填写用户名' })
    .trim()
    .min(1, '请填写用户名')
    .max(64, '用户名过长'),
  password: z
    .string({ required_error: '请填写密码' })
    .min(1, '请填写密码')
    .max(200, '密码过长'),
});

export const userStatusSchema = z.object({
  status: z.enum(['active', 'disabled'], { errorMap: () => ({ message: '状态取值不合法' }) }),
});

export const userListQuerySchema = z.object({
  /** 按邮箱或昵称模糊搜索。 */
  search: z.string().trim().max(64).optional(),
  status: z.enum(['all', 'active', 'disabled']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  // 上限 100，避免一次把整库拉出来。
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const userIdSchema = z.object({
  id: z.string().uuid('用户 id 不合法'),
});

export const inviteCodeIdSchema = z.object({
  id: z.string().uuid('邀请码 id 不合法'),
});

export const inviteCodeListQuerySchema = z.object({
  /** 按码本身或备注模糊搜索。 */
  search: z.string().trim().max(64).optional(),
  status: z.enum(['all', 'available', 'used', 'expired', 'disabled']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const inviteCodeCreateSchema = z.object({
  /** 一次生成几个。批量发给不同的人时比逐个点按钮省事。 */
  count: z.coerce
    .number({ invalid_type_error: '生成数量不合法' })
    .int('生成数量必须是整数')
    .min(1, '至少生成 1 个')
    .max(BATCH_LIMIT, `一次最多生成 ${BATCH_LIMIT} 个`)
    .default(1),
  /** 每个码可用几次。1 即一次性邀请。 */
  maxUses: z.coerce
    .number({ invalid_type_error: '可用次数不合法' })
    .int('可用次数必须是整数')
    .min(1, '可用次数至少为 1')
    .max(MAX_USES_LIMIT, `可用次数最多 ${MAX_USES_LIMIT}`)
    .default(1),
  /** 有效天数，0 或不传表示永不过期。 */
  expiresInDays: z.coerce
    .number({ invalid_type_error: '有效天数不合法' })
    .int('有效天数必须是整数')
    .min(0, '有效天数不能为负')
    .max(3650, '有效天数最多 3650 天')
    .optional(),
  note: z
    .string()
    .trim()
    .max(NOTE_MAX, `备注最多 ${NOTE_MAX} 个字符`)
    // eslint-disable-next-line no-control-regex
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), '备注包含非法字符')
    .optional(),
});

export const inviteCodeStatusSchema = z.object({
  disabled: z.boolean({ required_error: '缺少 disabled 参数' }),
});
