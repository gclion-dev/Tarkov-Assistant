import {
  DEFAULT_PREFERENCES,
  PREFERENCES_VERSION,
  type UserPreferences,
} from '@/features/preferences/types';

/** 新的统一存储键。改造前是十几个独立的 im-* 键，见 LEGACY_KEYS。 */
const STORAGE_KEY = 'im-preferences';

/**
 * 改造前每项偏好各占一个 localStorage 键（ahooks 的 useLocalStorageState）。
 * 老用户的设置必须无感迁移过来，否则升级一次等于被重置一次。
 */
const LEGACY_KEYS: Record<string, keyof UserPreferences> = {
  'im-extracts': 'extracts',
  'im-locks': 'locks',
  'im-lootKeys': 'lootKeys',
  'im-spawns': 'spawns',
  'im-hazards': 'hazards',
  'im-stationaryWeapons': 'stationaryWeapons',
  'im-taskLayers': 'taskKeys',
  'im-lootLooseKeys': 'lootLooseKeys',
  'im-mapInfoActive': 'mapInfoActive',
  'im-locationScale': 'locationScale',
  'im-strokeColor': 'strokeColor',
  'im-strokeWidth': 'strokeWidth',
  'im-eraserWidth': 'eraserWidth',
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * 把任意来源（localStorage / 云端 / 别的标签页）的数据收敛成合法的 UserPreferences。
 *
 * 逐字段校验而不是整体 `{ ...defaults, ...raw }`：后者会让一个类型错误的字段
 * （比如手改 localStorage 把 extracts 写成字符串）一路传到渲染层才炸。
 */
export const sanitizePreferences = (raw: unknown): UserPreferences => {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const next: UserPreferences = { ...DEFAULT_PREFERENCES };

  if (typeof input.activeMapId === 'string' && input.activeMapId) {
    next.activeMapId = input.activeMapId;
  }
  if (typeof input.activeLayerName === 'string' && input.activeLayerName) {
    next.activeLayerName = input.activeLayerName;
  }
  if (typeof input.activeLayerMapId === 'string' && input.activeLayerMapId) {
    next.activeLayerMapId = input.activeLayerMapId;
  }
  // 楼层必须有归属地图，否则一律丢弃，避免楼层串到别的地图上。
  if (!next.activeLayerMapId || next.activeLayerMapId !== next.activeMapId) {
    next.activeLayerName = undefined;
    next.activeLayerMapId = undefined;
  }

  const arrayFields: Array<keyof UserPreferences> = [
    'extracts',
    'locks',
    'lootKeys',
    'spawns',
    'hazards',
    'stationaryWeapons',
    'taskKeys',
    'lootLooseKeys',
  ];
  arrayFields.forEach((field) => {
    const value = input[field];
    if (isStringArray(value)) {
      // extracts 的元素类型比 string 更窄，这里由 sanitize 保证只可能是已知取值。
      (next[field] as string[]) = value;
    }
  });
  next.extracts = next.extracts.filter((item) =>
    (['pmc', 'scav', 'shared'] as string[]).includes(item)) as InteractiveMap.Faction[];

  if (typeof input.mapInfoActive === 'boolean') {
    next.mapInfoActive = input.mapInfoActive;
  }
  if (typeof input.locationScale === 'boolean') {
    next.locationScale = input.locationScale;
  }

  if (typeof input.strokeColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(input.strokeColor)) {
    next.strokeColor = input.strokeColor;
  }
  if (typeof input.strokeWidth === 'number' && Number.isFinite(input.strokeWidth)) {
    next.strokeWidth = Math.min(Math.max(input.strokeWidth, 1), 100);
  }
  if (typeof input.eraserWidth === 'number' && Number.isFinite(input.eraserWidth)) {
    next.eraserWidth = Math.min(Math.max(input.eraserWidth, 1), 100);
  }

  return next;
};

const readJson = (key: string): unknown => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
};

/** 从旧的 im-* 键拼出一份偏好；一个都没有则返回 undefined。 */
const readLegacyPreferences = (): UserPreferences | undefined => {
  const collected: Record<string, unknown> = {};
  let found = false;
  Object.entries(LEGACY_KEYS).forEach(([legacyKey, field]) => {
    const value = readJson(legacyKey);
    if (value !== undefined) {
      collected[field] = value;
      found = true;
    }
  });
  return found ? sanitizePreferences(collected) : undefined;
};

/** 迁移完成后清掉旧键，避免两份数据长期共存。 */
const clearLegacyPreferences = () => {
  Object.keys(LEGACY_KEYS).forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // 隐私模式下 localStorage 可能不可写，忽略即可。
    }
  });
};

export const loadLocalPreferences = (): UserPreferences => {
  const stored = readJson(STORAGE_KEY) as
    | { version?: number; payload?: unknown }
    | undefined;

  if (stored && typeof stored === 'object' && stored.payload) {
    // 目前只有 v1。将来结构变更时在这里按 stored.version 做迁移。
    return sanitizePreferences(stored.payload);
  }

  const legacy = readLegacyPreferences();
  if (legacy) {
    saveLocalPreferences(legacy);
    clearLegacyPreferences();
    return legacy;
  }

  return { ...DEFAULT_PREFERENCES };
};

export const saveLocalPreferences = (prefs: UserPreferences) => {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: PREFERENCES_VERSION, payload: prefs }),
    );
  } catch {
    // 配额写满或隐私模式：偏好丢失是可接受的降级，不该打断使用。
  }
};

export const PREFERENCES_STORAGE_KEY = STORAGE_KEY;
