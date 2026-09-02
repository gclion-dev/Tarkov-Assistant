import { z } from 'zod';

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
