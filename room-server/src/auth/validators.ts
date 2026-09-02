import { z } from 'zod';

import { badRequest } from '../http/errors.js';

export const NICKNAME_MAX = 20;
export const PASSWORD_MIN = 8;

// 昵称会被广播给同房间的其他玩家并渲染到地图上，这里剔除控制字符并限制长度，
// 前端渲染时另有 HTML 转义，两侧都不信任对方。
const nickname = z
  .string({ required_error: '请填写昵称' })
  .trim()
  .min(1, '请填写昵称')
  .max(NICKNAME_MAX, `昵称最多 ${NICKNAME_MAX} 个字符`)
  // eslint-disable-next-line no-control-regex
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), '昵称包含非法字符');

// 是否必填由服务端配置决定（config.invite.required），所以 schema 层只做长度兜底，
// 不在这里写 min(1)：否则关闭邀请码时前端不传该字段也会被拒。
const inviteCode = z.string().trim().max(64, '邀请码过长').optional();

const email = z
  .string({ required_error: '请填写邮箱' })
  .trim()
  .min(1, '请填写邮箱')
  .max(254, '邮箱过长')
  .email('邮箱格式不正确')
  .transform((value) => value.toLowerCase());

const password = z
  .string({ required_error: '请填写密码' })
  .min(PASSWORD_MIN, `密码至少 ${PASSWORD_MIN} 位`)
  .max(128, '密码最多 128 位');

export const registerSchema = z.object({ email, password, nickname, inviteCode });

export const loginSchema = z.object({
  email,
  password: z.string({ required_error: '请填写密码' }).min(1, '请填写密码'),
});

/** 解析请求体，失败时抛出携带首个校验错误信息的 400。 */
export const parseBody = <T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> => {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw badRequest(result.error.issues[0]?.message || '参数不合法');
  }
  return result.data;
};
