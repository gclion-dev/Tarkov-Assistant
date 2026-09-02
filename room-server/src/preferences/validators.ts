import { z } from 'zod';

/**
 * 偏好 payload 的白名单校验。
 *
 * 这是用户可写接口，不能把请求体原样落库 —— 否则这张表就变成了免费的用户可控存储。
 * 刻意不用 .strict()：前端先于服务端发版时，多出来的新字段会被静默剔除而不是整体 400，
 * 灰度期间不会把用户的保存直接打挂。
 */

const faction = z.enum(['pmc', 'scav', 'shared']);

/** 这些数组存的都是固定的图层 key，不是用户输入，长度和元素都可以卡得很紧。 */
const keyList = (max: number) => z.array(z.string().min(1).max(64)).max(max);

const mapId = z.string().min(1).max(64);

export const preferencesPayloadSchema = z.object({
  activeMapId: mapId.optional(),
  activeLayerName: z.string().min(1).max(64).optional(),
  activeLayerMapId: mapId.optional(),

  extracts: z.array(faction).max(3),
  locks: keyList(32),
  lootKeys: keyList(64),
  spawns: keyList(32),
  hazards: keyList(32),
  stationaryWeapons: keyList(32),
  taskKeys: keyList(64),
  lootLooseKeys: keyList(64),

  mapInfoActive: z.boolean(),
  locationScale: z.boolean(),

  strokeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'strokeColor 格式不正确'),
  strokeWidth: z.number().int().min(1).max(100),
  eraserWidth: z.number().int().min(1).max(100),
});

export type PreferencesPayload = z.infer<typeof preferencesPayloadSchema>;

export const updatePreferencesSchema = z.object({
  payload: preferencesPayloadSchema,
  /**
   * 客户端本次修改所基于的版本号。首次写入传 0。
   * 与库中版本不一致说明别的设备已经改过，返回 409 让客户端决定（当前策略是服务端优先）。
   */
  baseVersion: z.number().int().min(0),
});
