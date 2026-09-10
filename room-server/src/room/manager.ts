import crypto from 'crypto';

import config from '../config.js';

export interface PlayerLocation {
  mapId: string;
  x: number;
  y: number;
  z: number;
  quaternion?: number[];
  updatedAt: number;
}

/**
 * 玩家手动标记的一个地图坐标。
 *
 * 只有平面的 x / z：标记来自鼠标右键，拿不到高度，所以不参与楼层过滤。
 * id 由客户端生成并原样保留 —— 标记在未进房间时也能用，
 * 让两边共用同一个 id 才能用同一套删除逻辑处理本地标记和房间标记。
 * id 只在「同一个成员的标记列表」内使用，伪造它最多只能影响自己的标记。
 */
export interface MapMark {
  id: string;
  mapId: string;
  x: number;
  z: number;
  createdAt: number;
}

/** 每个成员的标记上限。标记常驻内存并随房间状态广播，必须有界。 */
export const MAX_MARKS_PER_MEMBER = 20;

export interface RoomMember {
  userId: string;
  nickname: string;
  color: string;
  /** 同一个账号可能开多个标签页，成员在最后一个连接断开后才算离开房间。 */
  sockets: Set<string>;
  /**
   * 最后一个连接断开的时间。有值且 sockets 为空时，成员仍留在房间里等待重连
   * （F5 / 网络抖动），超过宽限后才真正移除。
   */
  disconnectedAt?: number;
  location?: PlayerLocation;
  marks: MapMark[];
}

export interface Room {
  id: string;
  hostId: string;
  /** 房主当前选定的地图。加入者与房主切图时都跟这份走。 */
  mapId?: string;
  members: Map<string, RoomMember>;
  createdAt: number;
  lastActivityAt: number;
}

export interface SyncMember {
  userId: string;
  nickname: string;
  color: string;
  /** false 表示还在房间里但暂时没有连接（刷新 / 断线宽限中）。 */
  connected: boolean;
  location?: PlayerLocation;
  marks: MapMark[];
}

// 去掉了容易混淆的 0/O/1/I。
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;

const MEMBER_COLORS = ['#00ff88', '#ff6b6b', '#4ecdc4', '#ffe66d', '#a78bfa', '#fb923c'];

const rooms = new Map<string, Room>();

/**
 * 被踢出的账号在各房间的记录（roomId -> 被踢的 userId 集合）。
 *
 * 只用来拦截「自动重连」的静默加入：账号被踢时可能正处于断线宽限期，
 * 完全收不到 room:kicked 通知，本地缓存的房间号会在下次重连时自动把他带回来，
 * 等于踢人形同虚设。手动重新输入房间号加入则视为用户的主动选择，允许通过，
 * 并借这次机会清掉记录。
 * 房间彻底消失时（解散 / 空置 / 过期）一并清理，避免无限增长。
 */
const kickedMembers = new Map<string, Set<string>>();

const markKicked = (roomId: string, userId: string) => {
  let set = kickedMembers.get(roomId);
  if (!set) {
    set = new Set();
    kickedMembers.set(roomId, set);
  }
  set.add(userId);
};

const isKicked = (roomId: string, userId: string) =>
  kickedMembers.get(roomId)?.has(userId) ?? false;

const clearKicked = (roomId: string, userId: string) => {
  kickedMembers.get(roomId)?.delete(userId);
};

const forgetRoomKicks = (roomId: string) => {
  kickedMembers.delete(roomId);
};

/** 同一房间内颜色尽量不重复：先按已占用颜色挑选，挑不到再回落到按 userId 散列。 */
const pickColor = (room: Room, userId: string) => {
  const used = new Set(Array.from(room.members.values()).map((member) => member.color));
  const available = MEMBER_COLORS.find((color) => !used.has(color));
  if (available) {
    return available;
  }
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return MEMBER_COLORS[hash % MEMBER_COLORS.length];
};

// 房间号是访问房间的唯一凭证，必须用密码学安全的随机源，Math.random 可被预测。
const generateRoomId = () => {
  let id = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    id += ROOM_CHARS[crypto.randomInt(ROOM_CHARS.length)];
  }
  return id;
};

const normalizeRoomId = (roomId: string) => roomId.trim().toUpperCase();

export const getRoom = (roomId: string) => rooms.get(normalizeRoomId(roomId));

export const roomToSync = (room: Room) => ({
  id: room.id,
  hostId: room.hostId,
  mapId: room.mapId,
  members: Array.from(room.members.values()).map<SyncMember>((member) => ({
    userId: member.userId,
    nickname: member.nickname,
    color: member.color,
    connected: member.sockets.size > 0,
    location: member.location,
    marks: member.marks,
  })),
});

export const memberToSync = (member: RoomMember): SyncMember => ({
  userId: member.userId,
  nickname: member.nickname,
  color: member.color,
  connected: member.sockets.size > 0,
  location: member.location,
  marks: member.marks,
});

export const findRoomByUserId = (userId: string) => {
  for (const room of rooms.values()) {
    if (room.members.has(userId)) {
      return room;
    }
  }
  return null;
};

export const createRoom = (
  userId: string,
  nickname: string,
  socketId: string,
  mapId?: string,
): Room => {
  let id = generateRoomId();
  while (rooms.has(id)) {
    id = generateRoomId();
  }
  const now = Date.now();
  const room: Room = {
    id,
    hostId: userId,
    mapId,
    members: new Map(),
    createdAt: now,
    lastActivityAt: now,
  };
  rooms.set(id, room);
  room.members.set(userId, {
    userId,
    nickname,
    color: pickColor(room, userId),
    sockets: new Set([socketId]),
    marks: [],
  });
  return room;
};

export const joinRoom = (
  roomId: string,
  userId: string,
  nickname: string,
  socketId: string,
  /** true 表示这次加入是客户端断线/刷新后自动发起的，不是用户主动点击。 */
  auto = false,
): { room: Room; member: RoomMember; isNewMember: boolean } | { error: string } => {
  const room = getRoom(roomId);
  if (!room) {
    return { error: '房间不存在' };
  }
  const existing = room.members.get(userId);
  // 只在「即将新建成员」时才需要判断踢出记录：已经在成员列表里的人
  // （多标签页 / 宽限期内重连）不可能是被踢的人，那种情况走不到这里。
  if (!existing) {
    if (auto && isKicked(room.id, userId)) {
      return { error: '你已被踢出该房间' };
    }
    clearKicked(room.id, userId);
  }
  if (!existing && room.members.size >= config.room.maxMembers) {
    return { error: '房间已满' };
  }
  room.lastActivityAt = Date.now();
  if (existing) {
    // 重连或多标签页：保留已有的颜色与位置，只追加连接。
    existing.sockets.add(socketId);
    existing.nickname = nickname;
    existing.disconnectedAt = undefined;
    return { room, member: existing, isNewMember: false };
  }
  const member: RoomMember = {
    userId,
    nickname,
    color: pickColor(room, userId),
    sockets: new Set([socketId]),
    marks: [],
  };
  room.members.set(userId, member);
  return { room, member, isNewMember: true };
};

const removeMember = (room: Room, userId: string) => {
  room.members.delete(userId);
  if (room.members.size === 0) {
    rooms.delete(room.id);
    forgetRoomKicks(room.id);
    return null;
  }
  if (room.hostId === userId) {
    const next = room.members.values().next().value;
    if (next) {
      room.hostId = next.userId;
    }
  }
  room.lastActivityAt = Date.now();
  return room;
};

/** 主动离开房间：无论该账号还有多少连接，一律移出。 */
export const leaveRoom = (roomId: string, userId: string) => {
  const room = getRoom(roomId);
  if (!room || !room.members.has(userId)) {
    return { removed: false, room: null };
  }
  return { removed: true, room: removeMember(room, userId) };
};

/**
 * 单个连接断开。
 *
 * 该账号还有别的标签页连着：只摘掉这一路。
 * 已经是最后一个连接：先进入重连宽限，人还留在房间里，避免 F5 刷新把人踢出去。
 * 真正移除由 sweepStaleMembers 在宽限过期后做。
 */
export const leaveSocket = (roomId: string, userId: string, socketId: string) => {
  const room = getRoom(roomId);
  const member = room?.members.get(userId);
  if (!room || !member) {
    return { removed: false, wentOffline: false, room: null };
  }
  member.sockets.delete(socketId);
  if (member.sockets.size > 0) {
    return { removed: false, wentOffline: false, room };
  }
  member.disconnectedAt = Date.now();
  room.lastActivityAt = Date.now();
  return { removed: false, wentOffline: true, room };
};

/** 只有房主能改房间地图。mapId 未变化时视为幂等成功。 */
export const setRoomMap = (
  roomId: string,
  userId: string,
  mapId: string,
): { room: Room; unchanged: boolean } | { error: string } => {
  const room = getRoom(roomId);
  if (!room || !room.members.has(userId)) {
    return { error: '尚未加入房间' };
  }
  if (room.hostId !== userId) {
    return { error: '只有房主可以切换房间地图' };
  }
  if (room.mapId === mapId) {
    return { room, unchanged: true };
  }
  room.mapId = mapId;
  room.lastActivityAt = Date.now();
  return { room, unchanged: false };
};

/** 房主把房主身份交给房间里的另一个人。 */
export const transferHost = (
  roomId: string,
  hostId: string,
  targetUserId: string,
): { room: Room } | { error: string } => {
  const room = getRoom(roomId);
  if (!room || !room.members.has(hostId)) {
    return { error: '尚未加入房间' };
  }
  if (room.hostId !== hostId) {
    return { error: '只有房主可以转让房主' };
  }
  if (hostId === targetUserId) {
    return { error: '不能转让给自己' };
  }
  if (!room.members.has(targetUserId)) {
    return { error: '目标用户不在房间内' };
  }
  room.hostId = targetUserId;
  room.lastActivityAt = Date.now();
  return { room };
};

/**
 * 房主踢人。不能踢自己；被踢的人手动重新输入房间号仍可以加入——
 * 但断线重连的自动加入会被 joinRoom 里的 kickedMembers 记录拦住，
 * 不会因为对方当时正好离线、收不到 room:kicked 通知就被悄悄带回房间。
 */
export const kickMember = (
  roomId: string,
  hostId: string,
  targetUserId: string,
): { room: Room | null; kickedUserId: string; roomId: string } | { error: string } => {
  const room = getRoom(roomId);
  if (!room || !room.members.has(hostId)) {
    return { error: '尚未加入房间' };
  }
  if (room.hostId !== hostId) {
    return { error: '只有房主可以踢出成员' };
  }
  if (hostId === targetUserId) {
    return { error: '不能踢出自己' };
  }
  if (!room.members.has(targetUserId)) {
    return { error: '目标用户不在房间内' };
  }
  markKicked(room.id, targetUserId);
  return { room: removeMember(room, targetUserId), kickedUserId: targetUserId, roomId: room.id };
};

/** 房主解散房间：所有人退出，房间立即消失。 */
export const dissolveRoom = (
  roomId: string,
  hostId: string,
): { roomId: string; memberIds: string[] } | { error: string } => {
  const room = getRoom(roomId);
  if (!room || !room.members.has(hostId)) {
    return { error: '尚未加入房间' };
  }
  if (room.hostId !== hostId) {
    return { error: '只有房主可以解散房间' };
  }
  const memberIds = Array.from(room.members.keys());
  rooms.delete(room.id);
  forgetRoomKicks(room.id);
  return { roomId: room.id, memberIds };
};

export const updateLocation = (roomId: string, userId: string, location: PlayerLocation) => {
  const room = getRoom(roomId);
  const member = room?.members.get(userId);
  if (!room || !member) {
    return null;
  }
  member.location = location;
  room.lastActivityAt = Date.now();
  return { room, member };
};

/**
 * 新增一个坐标标记。
 *
 * 同 id 视为重复提交（客户端重发 / 多标签页），直接幂等返回而不是追加第二份。
 */
export const addMark = (
  roomId: string,
  userId: string,
  mark: Omit<MapMark, 'createdAt'>,
): { room: Room; member: RoomMember } | { error: string } | null => {
  const room = getRoom(roomId);
  const member = room?.members.get(userId);
  if (!room || !member) {
    return null;
  }
  if (member.marks.some((item) => item.id === mark.id)) {
    return { room, member };
  }
  if (member.marks.length >= MAX_MARKS_PER_MEMBER) {
    return { error: `每人最多只能添加 ${MAX_MARKS_PER_MEMBER} 个标记` };
  }
  member.marks.push({ ...mark, createdAt: Date.now() });
  room.lastActivityAt = Date.now();
  return { room, member };
};

/** 删除自己的一个标记。只能删自己的：markId 是在 member.marks 内查找的。 */
export const removeMark = (roomId: string, userId: string, markId: string) => {
  const room = getRoom(roomId);
  const member = room?.members.get(userId);
  if (!room || !member) {
    return null;
  }
  const next = member.marks.filter((item) => item.id !== markId);
  if (next.length === member.marks.length) {
    return null;
  }
  member.marks = next;
  room.lastActivityAt = Date.now();
  return { room, member };
};

/** 清空自己的标记。传 mapId 时只清该地图的，避免误删其他地图上的标记。 */
export const clearMarks = (roomId: string, userId: string, mapId?: string) => {
  const room = getRoom(roomId);
  const member = room?.members.get(userId);
  if (!room || !member) {
    return null;
  }
  const next = mapId ? member.marks.filter((item) => item.mapId !== mapId) : [];
  if (next.length === member.marks.length) {
    return null;
  }
  member.marks = next;
  room.lastActivityAt = Date.now();
  return { room, member };
};

export const cleanupExpiredRooms = () => {
  const now = Date.now();
  for (const [id, room] of rooms.entries()) {
    if (now - room.lastActivityAt > config.room.ttlMs) {
      rooms.delete(id);
      forgetRoomKicks(id);
    }
  }
};

/**
 * 清掉超过重连宽限仍没有连回来的成员。
 * 返回发生过变更的房间，调用方负责广播；房间被删光时 room 为 null。
 */
export const sweepStaleMembers = (graceMs: number) => {
  const now = Date.now();
  const changed: Array<{ roomId: string; room: ReturnType<typeof roomToSync> | null }> = [];
  for (const room of Array.from(rooms.values())) {
    const staleIds: string[] = [];
    for (const member of room.members.values()) {
      if (member.sockets.size > 0) {
        continue;
      }
      if (!member.disconnectedAt) {
        member.disconnectedAt = now;
        continue;
      }
      if (now - member.disconnectedAt > graceMs) {
        staleIds.push(member.userId);
      }
    }
    if (staleIds.length === 0) {
      continue;
    }
    const roomId = room.id;
    let current: Room | null = room;
    for (const userId of staleIds) {
      if (!current) {
        break;
      }
      current = removeMember(current, userId);
    }
    changed.push({ roomId, room: current ? roomToSync(current) : null });
  }
  return changed;
};

/**
 * 定时清理由调用方显式启动，而不是 import 时的副作用，
 * 这样进程可以干净退出，也便于单独测试 manager。
 */
/** 当前内存中的房间数，供管理后台展示。 */
export const countRooms = () => rooms.size;

export const startRoomCleanup = () => {
  const timer = setInterval(cleanupExpiredRooms, 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
};
