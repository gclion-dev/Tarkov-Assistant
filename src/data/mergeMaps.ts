import mapsMeta from '@/data/maps.json';

export interface ApiMap {
  id: string;
  tarkovDataId?: string | null;
  name: string;
  normalizedName: string;
  nameId?: string | null;
  wiki?: string | null;
  description?: string | null;
  enemies?: string[] | null;
  raidDuration?: number | null;
  players?: string | null;
  bosses?: InteractiveMap.Boss[];
  spawns?: InteractiveMap.Spawn[];
  extracts?: InteractiveMap.Extract[];
  locks?: InteractiveMap.Lock[];
  hazards?: InteractiveMap.Hazard[];
  lootContainers?: InteractiveMap.LootContainer[];
  stationaryWeapons?: InteractiveMap.StationaryWeapon[];
  lootLoose?: Array<{
    position: InteractiveMap.Position;
    itemIds?: string[];
    items?: InteractiveMap.LootItem[];
  }>;
}

interface MapImageMeta {
  key: string;
  altMaps?: string[];
  projection: string;
  tileSize?: number;
  minZoom?: number;
  maxZoom?: number;
  transform?: number[];
  coordinateRotation?: number;
  bounds?: number[][];
  heightRange?: number[];
  author?: string;
  authorLink?: string;
  svgPath?: string;
  svgLayer?: string;
  svgBounds?: number[][];
  tilePath?: string;
  layers?: InteractiveMap.Layer[];
  labels?: InteractiveMap.Label[];
}

interface MapGroupMeta {
  normalizedName: string;
  primaryPath?: string;
  maps: MapImageMeta[];
}

const NAME_FALLBACK: Record<string, string> = {
  'streets-of-tarkov': '塔科夫街区',
  'ground-zero': '零号地带',
  'ground-zero-21': '零号地带 21+',
  customs: '海关',
  factory: '工厂',
  'night-factory': '工厂（夜）',
  icebreaker: '破冰者',
  interchange: '立交桥',
  'the-lab': '实验室',
  'the-labyrinth': '迷宫',
  lighthouse: '灯塔',
  reserve: '储备站',
  shoreline: '海岸线',
  terminal: '终点站',
  woods: '森林',
};

const SKIP_GROUPS = new Set(['transits', 'openworld']);

const normalizeFaction = (faction?: string | null): InteractiveMap.Faction => {
  const value = (faction || '').toLowerCase();
  if (value.includes('scav')) return 'scav';
  if (value.includes('shared') || value.includes('all') || value === 'any') return 'shared';
  if (value.includes('pmc') || value === 'usec' || value === 'bear') return 'pmc';
  return 'shared';
};

const buildMap = (
  group: MapGroupMeta,
  image: MapImageMeta,
  api?: ApiMap,
): InteractiveMap.Data => {
  const extracts = (api?.extracts || []).map((extract) => ({
    ...extract,
    faction: normalizeFaction(extract.faction),
    switches: extract.switches || [],
    outline: extract.outline || [],
  }));

  return {
    id: api?.id || image.key,
    tarkovDataId: api?.tarkovDataId || '',
    name: api?.name || NAME_FALLBACK[image.key] || NAME_FALLBACK[group.normalizedName] || image.key,
    normalizedName: api?.normalizedName || group.normalizedName,
    nameId: api?.nameId || undefined,
    wiki: api?.wiki || '',
    description: api?.description || '',
    enemies: api?.enemies || [],
    raidDuration: api?.raidDuration || 0,
    players: api?.players || '',
    bosses: api?.bosses || [],
    spawns: api?.spawns || [],
    extracts,
    locks: (api?.locks || []).filter((lock) => lock?.position),
    hazards: (api?.hazards || []).filter((hazard) => hazard?.position),
    lootContainers: (api?.lootContainers || []).filter(
      (loot) => loot?.position && loot.lootContainer,
    ),
    stationaryWeapons: (api?.stationaryWeapons || []).filter(
      (weapon) => weapon?.position && weapon.stationaryWeapon,
    ),
    lootLoose: (api?.lootLoose || []).filter((loot) => loot?.position),
    key: image.key,
    tileSize: image.tileSize || 256,
    minZoom: image.minZoom || 1,
    maxZoom: image.maxZoom || 5,
    transform: image.transform || [1, 0, 1, 0],
    coordinateRotation: image.coordinateRotation || 180,
    bounds: image.bounds || [
      [0, 0],
      [1, 1],
    ],
    heightRange: image.heightRange || [-1000, 1000],
    author: image.author || '',
    authorLink: image.authorLink || '',
    svgPath: image.svgPath || '',
    svgLayer: image.svgLayer,
    svgBounds: image.svgBounds,
    tilePath: image.tilePath,
    layers: (image.layers || []) as InteractiveMap.Layer[],
    labels: image.labels || [],
  };
};

export const mergeMaps = (apiMaps: ApiMap[] = []): InteractiveMap.Data[] => {
  const byNormalized = new Map(apiMaps.map((map) => [map.normalizedName, map]));
  const result: InteractiveMap.Data[] = [];

  (mapsMeta as MapGroupMeta[]).forEach((group) => {
    if (SKIP_GROUPS.has(group.normalizedName)) {
      return;
    }
    group.maps.forEach((image) => {
      if (image.projection !== 'interactive') {
        return;
      }
      if (!image.svgPath && !image.tilePath) {
        return;
      }
      result.push(buildMap(group, image, byNormalized.get(group.normalizedName)));
      image.altMaps?.forEach((altKey) => {
        const altApi = byNormalized.get(altKey);
        if (!altApi) {
          return;
        }
        result.push(buildMap(group, { ...image, key: altKey, altMaps: undefined }, altApi));
      });
    });
  });

  return result;
};
