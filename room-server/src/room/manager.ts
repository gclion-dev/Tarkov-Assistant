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

export interface RoomMember {
  userId: string;
  nickname: string;
  color: string;
  /** 同一个账号可能开多个标签页，成员在最后一个连接断开后才算离开房间。 */
  sockets: Set<string>;
  location?: PlayerLocation;
}

export interface Room {
  id: string;
  hostId: string;
  members: Map<string, RoomMember>;
  createdAt: number;
  lastActivityAt: number;
}

export interface SyncMember {
  userId: string;
  nickname: string;
  color: string;
  location?: PlayerLocation;
}

// 去掉了容易混淆的 0/O/1/I。
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;

const MEMBER_COLORS = ['#00ff88', '#ff6b6b', '#4ecdc4', '#ffe66d', '#a78bfa', '#fb923c'];

const rooms = new Map<string, Room>();

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
  members: Array.from(room.members.values()).map<SyncMember>((member) => ({
    userId: member.userId,
    nickname: member.nickname,
    color: member.color,
    location: member.location,
  })),
});

export const memberToSync = (member: RoomMember): SyncMember => ({
  userId: member.userId,
  nickname: member.nickname,
  color: member.color,
  location: member.location,
});

export const findRoomByUserId = (userId: string) => {
  for (const room of rooms.values()) {
    if (room.members.has(userId)) {
      return room;
    }
  }
  return null;
};

export const createRoom = (userId: string, nickname: string, socketId: string): Room => {
  let id = generateRoomId();
  while (rooms.has(id)) {
    id = generateRoomId();
  }
  const now = Date.now();
  const room: Room = {
    id,
    hostId: userId,
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
  });
  return room;
};

export const joinRoom = (
  roomId: string,
  userId: string,
  nickname: string,
  socketId: string,
): { room: Room; member: RoomMember; isNewMember: boolean } | { error: string } => {
  const room = getRoom(roomId);
  if (!room) {
    return { error: '房间不存在' };
  }
  const existing = room.members.get(userId);
  if (!existing && room.members.size >= config.room.maxMembers) {
    return { error: '房间已满' };
  }
  room.lastActivityAt = Date.now();
  if (existing) {
    // 重连或多标签页：保留已有的颜色与位置，只追加连接。
    existing.sockets.add(socketId);
    existing.nickname = nickname;
    return { room, member: existing, isNewMember: false };
  }
  const member: RoomMember = {
    userId,
    nickname,
    color: pickColor(room, userId),
    sockets: new Set([socketId]),
  };
  room.members.set(userId, member);
  return { room, member, isNewMember: true };
};

const removeMember = (room: Room, userId: string) => {
  room.members.delete(userId);
  if (room.members.size === 0) {
    rooms.delete(room.id);
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
 * 单个连接断开。只有当该账号在此房间已无任何连接时才算真正离开，
 * 否则多开一个标签页再关掉就会把自己踢出房间。
 */
export const leaveSocket = (roomId: string, userId: string, socketId: string) => {
  const room = getRoom(roomId);
  const member = room?.members.get(userId);
  if (!room || !member) {
    return { removed: false, room: null };
  }
  member.sockets.delete(socketId);
  if (member.sockets.size > 0) {
    return { removed: false, room };
  }
  return { removed: true, room: removeMember(room, userId) };
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

export const cleanupExpiredRooms = () => {
  const now = Date.now();
  for (const [id, room] of rooms.entries()) {
    if (now - room.lastActivityAt > config.room.ttlMs) {
      rooms.delete(id);
    }
  }
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
