import fallbackItems from '@/data/items-slim.json';
import fallbackApi from '@/data/maps-api.json';
import { ApiMap, mergeMaps } from '@/data/mergeMaps';
import { resolveLootLoose, SlimItem } from '@/data/resolveLoot';
import fallbackTasks from '@/data/tasks-api.json';
import { transformJsonMaps } from '@/data/transformMaps';
import type { MapTask } from '@/data/transformTasks';
import { transformTasks } from '@/data/transformTasks';

const JSON_API_BASE = import.meta.env.DEV ? '/tarkov-json' : 'https://json.tarkov.dev';

const fetchJson = async (path: string) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(`${JSON_API_BASE}${path}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`${path} ${res.status}`);
    }
    return res.json();
  } finally {
    window.clearTimeout(timer);
  }
};

const withLoot = (
  maps: InteractiveMap.Data[],
  items: Record<string, SlimItem> = fallbackItems as Record<string, SlimItem>,
) => {
  return maps.map((map) => ({
    ...map,
    lootLoose: resolveLootLoose(map.lootLoose || [], items),
  }));
};

export const loadInteractiveMaps = (): InteractiveMap.Data[] => {
  return withLoot(mergeMaps(fallbackApi as ApiMap[]));
};

export const loadMapTasks = (): MapTask[] => {
  return (fallbackTasks as MapTask[]) || [];
};

export const refreshInteractiveMaps = async (): Promise<InteractiveMap.Data[] | null> => {
  try {
    const [payload, zhPayload] = await Promise.all([
      fetchJson('/regular/maps'),
      fetchJson('/regular/maps_zh'),
    ]);
    const maps = transformJsonMaps(payload, zhPayload.data || {});
    return withLoot(mergeMaps(maps));
  } catch (err) {
    console.warn('Live map refresh failed, using bundled snapshot.', err);
    return null;
  }
};

export const refreshMapTasks = async (): Promise<MapTask[] | null> => {
  try {
    const [payload, zhPayload] = await Promise.all([
      fetchJson('/regular/tasks'),
      fetchJson('/regular/tasks_zh'),
    ]);
    return transformTasks(payload, zhPayload.data || {});
  } catch (err) {
    console.warn('Live task refresh failed, using bundled snapshot.', err);
    return null;
  }
};
