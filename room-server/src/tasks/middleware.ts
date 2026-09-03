import type { RequestHandler } from 'express';

import config from '../config.js';
import { serviceUnavailable, tooManyRequests } from '../http/errors.js';
import { consumeImageSearchQuota } from '../quota/store.js';

/**
 * 没配密钥就别往下走。
 *
 * 放在扣额度之前是有意的：服务端自己没配好，不该消耗掉用户当天的额度
 * （默认只有 1 次，被这么吃掉一次相当于整天不能用）。
 */
export const requireImageSearchEnabled: RequestHandler = (_req, _res, next) => {
  if (!config.zhipu.apiKey) {
    next(serviceUnavailable('按图识别服务未配置，请联系管理员设置 ZHIPU_API_KEY'));
    return;
  }
  next();
};

/**
 * 扣一次每日额度。
 *
 * 额度按用户计而不是按 IP：同一 WiFi 下的朋友不该互相挤占，换个网络也不该重置。
 * 上限默认取 config.zhipu.dailyLimit，管理后台可以给单个用户另行分配。
 * 用量存在 sqlite 里，服务重启不会把额度重新发一轮。
 *
 * 必须挂在 requireAuth 之后（要 userId），以及请求体校验之后
 * （格式不对的请求根本不会调用大模型，不该扣额度）。
 */
export const consumeImageSearchQuotaMiddleware: RequestHandler = (req, res, next) => {
  const userId = req.auth!.sub;
  const quota = consumeImageSearchQuota(userId);
  if (!quota.ok) {
    if (quota.limit <= 0) {
      next(tooManyRequests('你的账号暂未开通按图搜索额度，请联系管理员'));
      return;
    }
    next(tooManyRequests(`按图搜索每天最多使用 ${quota.limit} 次，请明天再试或联系管理员提额`));
    return;
  }
  // 识别成功后随响应回带，前端可以提示「今日剩余 n 次」。
  res.locals.quota = quota;
  next();
};
