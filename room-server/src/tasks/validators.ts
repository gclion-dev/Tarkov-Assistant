import { z } from 'zod';

/** 前端会先把截图压到最长边 1600px / JPEG，正常一张在 500KB 以内，这里留足余量。 */
export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const dataUrlPattern = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** base64 每 4 个字符对应 3 字节，据此估算解码后的真实大小。 */
const decodedBytes = (dataUrl: string) => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
};

export const imageSearchSchema = z.object({
  images: z
    .array(
      z
        .string()
        .min(1)
        // 先按字符串长度粗筛，避免对超大字符串跑正则。
        .max(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 64, '图片过大，请压缩后重试')
        .refine((value) => dataUrlPattern.test(value), '图片格式不支持，仅支持 JPG / PNG / WebP')
        .refine((value) => decodedBytes(value) <= MAX_IMAGE_BYTES, '单张图片不能超过 2MB'),
    )
    .min(1, '请至少上传一张图片')
    .max(MAX_IMAGES, `最多上传 ${MAX_IMAGES} 张图片`),
});

/** 与前端当前任务上限一致，一次方案不会超过这个规模。 */
export const MAX_PLAN_TASKS = 50;
export const MAX_PLAN_LOCATIONS = 80;

const planLocationSchema = z.object({
  key: z.string().regex(/^n\d{1,3}$/, '地点编号无效'),
  taskId: z.string().min(1, '任务 id 无效').max(64, '任务 id 过长'),
  type: z.string().max(40).optional(),
  description: z.string().max(160).optional(),
  x: z.number().finite(),
  y: z.number().finite().optional(),
  z: z.number().finite(),
});

export const generatePlanSchema = z.object({
  mapName: z.string().trim().min(1, '请选择地图').max(40, '地图名称过长'),
  taskIds: z
    .array(z.string().min(1).max(64))
    .min(1, '请至少选择一个任务')
    .max(MAX_PLAN_TASKS, `一次最多规划 ${MAX_PLAN_TASKS} 个任务`),
  locations: z
    .array(planLocationSchema)
    .max(MAX_PLAN_LOCATIONS, '地点过多，请减少任务后再试')
    .default([]),
});
