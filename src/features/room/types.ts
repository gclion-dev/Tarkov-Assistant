export interface PlayerLocation {
  mapId: string;
  x: number;
  y: number;
  z: number;
  quaternion?: number[];
  updatedAt: number;
}

/**
 * 玩家手动标记的地图坐标。
 *
 * 只有平面的 x / z：标记来自鼠标右键，拿不到高度，因此和玩家箭头一样不参与楼层过滤。
 * id 由添加方生成，本地标记与同步到房间的标记共用同一个 id。
 */
export interface MapMark {
  id: string;
  mapId: string;
  x: number;
  z: number;
  createdAt: number;
}

/** 每人的标记上限，与服务端 MAX_MARKS_PER_MEMBER 保持一致。 */
export const MAX_MAP_MARKS = 20;

/**
 * 未进房间时自己的位置箭头与坐标标记用的颜色。
 * 与服务端 MEMBER_COLORS[0] 一致，这样单人使用和进房间后的观感是连续的。
 */
export const DEFAULT_SELF_COLOR = '#00ff88';

export interface RoomMember {
  userId: string;
  nickname: string;
  color: string;
  location?: PlayerLocation;
  /** 老版本服务端不会下发这个字段，读取方必须容忍 undefined。 */
  marks?: MapMark[];
}

export interface RoomState {
  id: string;
  hostId: string;
  members: RoomMember[];
}

export interface LocationUpdatedPayload {
  userId: string;
  location: PlayerLocation;
}
