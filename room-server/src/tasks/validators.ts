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
