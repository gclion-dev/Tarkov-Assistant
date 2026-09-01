import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** 业务错误：会被全局错误处理器转成 { code, errorMessage } 响应体。 */
export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const unauthorized = (message: string) => new HttpError(401, message);
export const conflict = (message: string) => new HttpError(409, message);

/** 包裹 async 处理器，把 rejected promise 交给 express 的错误处理链，避免请求悬挂。 */
export const asyncHandler =
  (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ code: err.status, errorMessage: err.message });
    return;
  }
  console.error('[http] 未捕获的服务端错误：', err);
  res.status(500).json({ code: 500, errorMessage: '服务器内部错误' });
};
