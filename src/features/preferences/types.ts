/**
 * 用户偏好：所有「刷新 / 换设备后应该还在」的界面选择。
 *
 * 这里只放与账号相关、可跨设备同步的数据。
 * 本机绑定的数据（截图目录 / 游戏目录句柄）在 utils/fsHandleStore.ts，走 IndexedDB，
 * 因为 FileSystemDirectoryHandle 无法序列化，也不该跨设备。
 */

/** payload 结构版本号。字段语义发生不兼容变更时 +1，并在 localStore 里补迁移。 */
export const PREFERENCES_VERSION = 1;

/**
 * 「当前任务」的数量上限。
 *
 * 不设上限的话用户能把整个任务表塞进偏好，payload 会顶到服务端的 8KB 限制，
 * 从那一刻起所有偏好都同步不上去。同一个常量也用于服务端校验（room-server 侧另有一份）。
 */
export const MAX_CURRENT_TASKS = 50;

export interface UserPreferences {
  /** 当前地图 id。可能指向已下线的地图，读取方必须做存在性校验。 */
  activeMapId?: string;
  /**
   * 当前楼层名。只存名字不存 Layer 对象：
   * Layer 里的 svgPath / extents 来自远端数据，存下来会过期。
   */
  activeLayerName?: string;
  /** activeLayerName 属于哪张地图。防止切图后楼层串到别的地图上。 */
  activeLayerMapId?: string;

  extracts: InteractiveMap.Faction[];
  locks: string[];
  lootKeys: string[];
  spawns: string[];
  hazards: string[];
  stationaryWeapons: string[];
  taskKeys: string[];
  lootLooseKeys: string[];

  /**
   * 用户手动挑出来的「当前任务」id 列表，按添加顺序。
   *
   * 与 activeMapId 同理：可能指向已从任务表下线的任务，读取方必须做存在性校验。
   * 校验结果只用于渲染，不要回写这里 —— 远端任务表临时缺数据时回写会把用户的选择永久删掉。
   */
  currentTaskIds: string[];

  mapInfoActive: boolean;
  locationScale: boolean;

  strokeColor: string;
  strokeWidth: number;
  eraserWidth: number;
}

/** 与改造前各 useLocalStorageState 的 defaultValue 保持一致，避免老用户观感变化。 */
export const DEFAULT_PREFERENCES: UserPreferences = {
  activeMapId: undefined,
  activeLayerName: undefined,
  activeLayerMapId: undefined,

  extracts: ['pmc', 'scav', 'shared', 'transit'],
  locks: ['lock'],
  lootKeys: ['safe', 'jacket', 'pc-block', 'cache', 'medcase', 'plastic-suitcase'],
  spawns: ['scav', 'sniper_scav', 'boss'],
  hazards: ['hazard'],
  stationaryWeapons: [],
  taskKeys: [],
  lootLooseKeys: [],
  currentTaskIds: [],

  mapInfoActive: true,
  locationScale: true,

  strokeColor: '#9a8866',
  strokeWidth: 1,
  eraserWidth: 5,
};

/** 云端同步状态，用于 UI 上给一点反馈。 */
export type PreferencesSyncStatus =
  /** 仅本地（未登录，或云端还没拉到） */
  | 'local'
  /** 正在写入云端 */
  | 'syncing'
  /** 已与云端一致 */
  | 'synced';

export interface PreferencesEnvelope {
  payload: UserPreferences;
  version: number;
  updatedAt: number;
}
