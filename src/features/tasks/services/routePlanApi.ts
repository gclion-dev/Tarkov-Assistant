import { request } from '@/features/auth/services/http';

export interface RoutePlanLocationInput {
  key: string;
  taskId: string;
  type: string;
  description: string;
  x: number;
  y: number;
  z: number;
}

export interface RoutePlanNode {
  key: string;
  taskId: string;
  taskName: string;
  type: string;
  description: string;
  action: string;
  bring: string[];
  x: number;
  y: number;
  z: number;
}

export interface GeneratedRoutePlan {
  mapId: string;
  mapName: string;
  summary: string;
  bring: string[];
  weapons: string[];
  notes: string;
  nodes: RoutePlanNode[];
  quota?: { limit: number; used: number; remaining: number };
}

interface GeneratePlanResponse {
  mapName: string;
  summary: string;
  bring: string[];
  weapons: string[];
  notes: string;
  nodes: RoutePlanNode[];
  quota: { limit: number; used: number; remaining: number };
}

export const generateTaskRoutePlan = (payload: {
  mapName: string;
  taskIds: string[];
  locations: RoutePlanLocationInput[];
}) =>
  request<GeneratePlanResponse>({
    method: 'POST',
    url: '/api/tasks/generate-plan',
    data: payload,
    // 服务端对上游的超时是 180s（zhipu.ts 的 REQUEST_TIMEOUT_MS），这里留一点余量，
    // 让服务端先超时并回中文提示，而不是前端自己先断开。
    timeout: 200_000,
  });
