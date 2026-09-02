/** 压缩后的最长边。游戏截图里的任务文字在 1600px 下依然清晰可辨。 */
const MAX_EDGE = 1600;
/** 依次尝试的 JPEG 质量，直到产出体积落进上限。 */
const QUALITY_STEPS = [0.82, 0.7, 0.55];
/** 与服务端 validators.ts 的 MAX_IMAGE_BYTES 保持一致。 */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
/** 原始文件的上限。压缩在浏览器里做，这里只是拦掉明显不合理的输入。 */
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const ACCEPT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export class ImageCompressError extends Error {}

const loadBitmap = async (file: File) => {
  // createImageBitmap 在主流浏览器上都可用，且不需要把图片挂到 DOM 上。
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // 个别浏览器对 webp / 大图会失败，落到 <img> 方案。
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new ImageCompressError('图片解码失败'));
      img.src = url;
    });
  } finally {
    // 交给 GC 前先释放，长时间持有 blob URL 会漏内存。
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
};

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new ImageCompressError('读取图片失败'));
    reader.readAsDataURL(blob);
  });

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });

/**
 * 把截图压成体积可控的 JPEG data URL。
 *
 * 直传原图会让请求体膨胀到十几 MB，既要放宽 nginx / express 的上限，
 * 也会明显拖慢上传和模型的图片预处理。缩到 1600px 对识别精度基本无损。
 */
export const compressImageToDataUrl = async (file: File): Promise<string> => {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ImageCompressError('图片过大');
  }

  const bitmap = await loadBitmap(file);
  const width = 'width' in bitmap ? bitmap.width : 0;
  const height = 'height' in bitmap ? bitmap.height : 0;
  if (!width || !height) {
    throw new ImageCompressError('图片尺寸异常');
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new ImageCompressError('浏览器不支持图片压缩');
  }
  // JPEG 没有透明通道，先铺白底，免得 PNG 的透明区域压出来是黑块。
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  if ('close' in bitmap && typeof bitmap.close === 'function') {
    bitmap.close();
  }

  for (const quality of QUALITY_STEPS) {
    const blob = await canvasToBlob(canvas, quality);
    if (!blob) {
      throw new ImageCompressError('图片压缩失败');
    }
    if (blob.size <= MAX_UPLOAD_BYTES) {
      return toDataUrl(blob);
    }
  }
  throw new ImageCompressError('图片压缩后仍然过大');
};
