import fallbackItems from '@/data/items-slim.json';
import type { SlimItem } from '@/data/resolveLoot';
import fallbackCatalog from '@/data/tasks-catalog.json';

export interface CatalogRewardItem {
  id: string;
  name: string;
  count: number;
  image: string;
}

export interface CatalogObjective {
  id: string;
  type: string;
  description: string;
  optional: boolean;
  count?: number;
  foundInRaid?: boolean;
  mapNames: string[];
}

export interface CatalogTask {
  id: string;
  name: string;
  normalizedName: string;
  traderId: string;
  traderName: string;
  traderImage: string;
  wikiLink: string;
  image: string;
  minPlayerLevel: number;
  experience: number;
  kappaRequired: boolean;
  lightkeeperRequired: boolean;
  factionName: string;
  mapIds: string[];
  mapNames: string[];
  taskRequirements: Array<{ id: string; name: string }>;
  objectives: CatalogObjective[];
  finishRewards: {
    items: CatalogRewardItem[];
    traderStanding: Array<{ traderId: string; traderName: string; standing: number }>;
  };
}

const JSON_API_BASE = import.meta.env.DEV ? '/tarkov-json' : 'https://json.tarkov.dev';

export const MAP_NAMES: Record<string, string> = {
  '55f2d3fd4bdc2d5f408b4567': '工厂',
  '56f40101d2720b2a4d8b45d6': '海关',
  '5704e3c2d2720bac5b8b4567': '森林',
  '5704e4dad2720bb55b8b4567': '灯塔',
  '5704e554d2720bac5b8b456e': '海岸线',
  '5704e5fad2720bc05b8b4567': '储备站',
  '5714dbc024597771384a510d': '立交桥',
  '5714dc692459777137212e12': '塔科夫街区',
  '59fc81d786f774390775787e': '夜间工厂',
  '5b0fc42d86f7744a585f9105': '实验室',
  '653e6760052c01c1c805532f': '中心区',
  '65b8d6f5cdde2479cb2a3125': '中心区 21+',
  '65cc8f81a9aac3e77d0cfd3e': '码头',
  '6733700029c367a3d40b02af': '迷宫',
  '68236e8153654e8c1200798a': 'Ground Zero 教程',
  '69af492a4819ea4ba10a69c5': '破冰船',
  '6a294a5b5eb5f9a1700417b7': '实验室 (Dark)',
};

const asId = (value: unknown): string => {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && value && 'id' in value) {
    return String((value as { id?: string }).id || '');
  }
  return '';
};

const unique = (values: string[]) => {
  return Array.from(new Set(values.filter(Boolean)));
};

const translate = (dict: Record<string, string>, value?: string | null) => {
  if (!value) {
    return '';
  }
  return dict[value] || value;
};

const displayName = (normalizedName?: string) => {
  if (!normalizedName) {
    return '';
  }
  return normalizedName
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const itemImage = (id: string, fallback?: string) => {
  return fallback || `https://assets.tarkov.dev/${id}-base-image.webp`;
};

export const transformTaskCatalog = (
  tasksPayload: any,
  tasksZh: Record<string, string> = {},
  tradersPayload: any = {},
  tradersZh: Record<string, string> = {},
  items: Record<string, SlimItem> = fallbackItems as Record<string, SlimItem>,
  itemsZh: Record<string, string> = {},
): CatalogTask[] => {
  const tasks = tasksPayload?.data?.tasks || {};
  const questItems = tasksPayload?.data?.questItems || {};
  const traders = tradersPayload?.data || {};

  const traderNameOf = (id?: string) => {
    if (!id) {
      return '未知商人';
    }
    const trader = traders[id];
    return (
      translate(tradersZh, trader?.name) ||
      displayName(trader?.normalizedName) ||
      displayName(id) ||
      '未知商人'
    );
  };

  const traderImageOf = (id?: string) => {
    if (!id) {
      return '';
    }
    return traders[id]?.imageLink || `https://assets.tarkov.dev/${id}.webp`;
  };

  const mapNameOf = (id: string) => MAP_NAMES[id] || id;

  const itemNameOf = (id: string) => {
    const questItem = questItems[id];
    if (questItem) {
      return translate(tasksZh, questItem.name)
        || questItem.normalizedName
        || questItem.shortName
        || id;
    }
    const slim = items[id];
    if (slim) {
      return slim.name;
    }
    const translated = translate(itemsZh, `${id} Name`) || translate(tasksZh, `${id} Name`);
    if (translated && !translated.endsWith(' Name')) {
      return translated;
    }
    return id.slice(0, 8);
  };

  const collectMapIds = (task: any, objectives: any[]): string[] => {
    const ids = [asId(task.map)];
    objectives.forEach((obj) => {
      (obj.maps || []).forEach((map: unknown) => ids.push(asId(map)));
    });
    return unique(ids);
  };

  const catalog: CatalogTask[] = Object.values(tasks).map((task: any): CatalogTask => {
    const traderId = asId(task.trader);
    const objectives: CatalogObjective[] = (task.objectives || []).map((obj: any) => {
      const mapIds = unique((obj.maps || []).map((map: unknown) => asId(map)));
      return {
        id: obj.id,
        type: obj.type || '',
        description: translate(tasksZh, obj.description) || obj.description || '',
        optional: Boolean(obj.optional),
        count: typeof obj.count === 'number' ? obj.count : undefined,
        foundInRaid: obj.foundInRaid,
        mapNames: mapIds.map(mapNameOf),
      };
    });
    const mapIds = collectMapIds(task, task.objectives || []);
    const rewardItems = (task.finishRewards?.items || []).map((entry: any) => {
      const id = asId(entry.item) || asId(entry);
      return {
        id,
        name: itemNameOf(id),
        count: entry.count || 1,
        image: itemImage(id, items[id]?.image),
      };
    });
    return {
      id: task.id,
      name: translate(tasksZh, task.name) || displayName(task.normalizedName) || task.id,
      normalizedName: task.normalizedName || task.id,
      traderId,
      traderName: traderNameOf(traderId),
      traderImage: traderImageOf(traderId),
      wikiLink: task.wikiLink || '',
      image: task.taskImageLink || `https://assets.tarkov.dev/${task.id}.webp`,
      minPlayerLevel: task.minPlayerLevel || 0,
      experience: task.experience || 0,
      kappaRequired: Boolean(task.kappaRequired),
      lightkeeperRequired: Boolean(task.lightkeeperRequired),
      factionName: task.factionName || 'Any',
      mapIds,
      mapNames: mapIds.map(mapNameOf),
      taskRequirements: (task.taskRequirements || [])
        .map((req: any) => ({ id: asId(req.task), name: asId(req.task) }))
        .filter((req: { id: string }) => req.id),
      objectives,
      finishRewards: {
        items: rewardItems,
        traderStanding: (task.finishRewards?.traderStanding || []).map((entry: any) => {
          const id = asId(entry.trader);
          return {
            traderId: id,
            traderName: traderNameOf(id),
            standing: entry.standing || 0,
          };
        }),
      },
    };
  });

  const byId = new Map(catalog.map((item) => [item.id, item]));
  return catalog
    .map((item) => ({
      ...item,
      taskRequirements: item.taskRequirements.map((req) => ({
        id: req.id,
        name: byId.get(req.id)?.name || req.id,
      })),
    }))
    .sort((a, b) => {
      if (a.minPlayerLevel !== b.minPlayerLevel) {
        return a.minPlayerLevel - b.minPlayerLevel;
      }
      return a.name.localeCompare(b.name, 'zh');
    });
};

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

export const loadTaskCatalog = (): CatalogTask[] => {
  return (fallbackCatalog as CatalogTask[]) || [];
};

export const refreshTaskCatalog = async (): Promise<CatalogTask[] | null> => {
  try {
    const [tasksPayload, tasksZhPayload, tradersPayload, tradersZhPayload, itemsZhPayload] =
      await Promise.all([
        fetchJson('/regular/tasks'),
        fetchJson('/regular/tasks_zh'),
        fetchJson('/regular/traders'),
        fetchJson('/regular/traders_zh'),
        fetchJson('/regular/items_zh'),
      ]);
    return transformTaskCatalog(
      tasksPayload,
      tasksZhPayload.data || {},
      tradersPayload,
      tradersZhPayload.data || {},
      fallbackItems as Record<string, SlimItem>,
      itemsZhPayload.data || {},
    );
  } catch (err) {
    console.warn('Live task catalog refresh failed, using bundled snapshot.', err);
    return null;
  }
};
