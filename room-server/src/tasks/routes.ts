import { Router, type RequestHandler } from 'express';

import { requireAuth } from '../auth/middleware.js';
import { parseBody } from '../auth/validators.js';
import { asyncHandler } from '../http/errors.js';
import type { ConsumeResult } from '../quota/store.js';
import { consumeImageSearchQuotaMiddleware, requireImageSearchEnabled } from './middleware.js';
import { recognizeTasksFromImages } from './zhipu.js';
import { imageSearchSchema } from './validators.js';

const router = Router();

/**
 * 校验刻意放在扣额度之前：格式不对的请求根本不会调用大模型，
 * 不该占用用户当天的识别额度。校验结果挂到 res.locals 供后续处理器复用。
 */
const validateImageSearch: RequestHandler = (req, res, next) => {
  res.locals.images = parseBody(imageSearchSchema, req.body).images;
  next();
};

// 仅登录用户可用：这个接口直接消耗大模型额度，不能对匿名请求开放。
// 中间件顺序即「越便宜的拒绝越靠前」：鉴权 → 服务是否可用 → 请求体校验 → 扣额度 → 真正调用。
router.post(
  '/image-search',
  requireAuth,
  requireImageSearchEnabled,
  validateImageSearch,
  consumeImageSearchQuotaMiddleware,
  asyncHandler(async (_req, res) => {
    // 任务目录由服务端持有，请求体里只有图片。
    const result = await recognizeTasksFromImages(res.locals.images as string[]);
    const quota = res.locals.quota as ConsumeResult;
    res.json({
      code: 200,
      data: { ...result, quota: { limit: quota.limit, used: quota.used, remaining: quota.remaining } },
    });
  }),
);

export default router;
