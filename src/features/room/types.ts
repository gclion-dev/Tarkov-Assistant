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
  location?: PlayerLocation;
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
