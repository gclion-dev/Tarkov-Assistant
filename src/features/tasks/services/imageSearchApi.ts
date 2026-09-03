import { request } from '@/features/auth/services/http';

export interface ImageSearchResult {
  taskIds: string[];
  summary: string;
  /** 本次调用后的每日额度情况，用来提示还能用几次。 */
  quota: { limit: number; used: number; remaining: number };
}

/**
 * 按图识别任务。
 *
 * 只上传图片：任务目录由 room-server 自己持有，既省带宽，
 * 也避免调用方通过目录内容影响服务端拼出的 prompt。
 */
export const searchTasksByImages = (images: string[]) =>
  request<ImageSearchResult>({
    method: 'POST',
    url: '/api/tasks/image-search',
    data: { images },
    // 服务端对上游的超时是 120s，这里留一点余量。
    timeout: 130_000,
  });
