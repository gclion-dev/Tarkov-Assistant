import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const JSON_API = 'https://json.tarkov.dev';

const MAP_NAMES = {
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

const asId = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.id || '';
};

const unique = (values) => Array.from(new Set(values.filter(Boolean)));

const translate = (dict, value) => {
  if (!value) return '';
  return dict[value] || value;
};

const displayName = (normalizedName) => {
  if (!normalizedName) return '';
  return normalizedName
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const fetchJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status} ${res.statusText}`);
  }
  return res.json();
};

const transformTaskCatalog = (tasksPayload, tasksZh, tradersPayload, tradersZh, items = {}, itemsZh = {}) => {
  const tasks = tasksPayload?.data?.tasks || {};
  const questItems = tasksPayload?.data?.questItems || {};
  const traders = tradersPayload?.data || {};

  const traderNameOf = (id) => {
    if (!id) return '未知商人';
    const trader = traders[id];
    return translate(tradersZh, trader?.name) || displayName(trader?.normalizedName) || '未知商人';
  };

  const itemNameOf = (id) => {
    const questItem = questItems[id];
    if (questItem) {
      return translate(tasksZh, questItem.name) || questItem.normalizedName || questItem.shortName || id;
    }
    if (items[id]) return items[id].name;
    const translated = translate(itemsZh, `${id} Name`);
    if (translated && !translated.endsWith(' Name')) return translated;
    return id.slice(0, 8);
  };

  const catalog = Object.values(tasks).map((task) => {
    const traderId = asId(task.trader);
    const objectives = (task.objectives || []).map((obj) => {
      const mapIds = unique((obj.maps || []).map((map) => asId(map)));
      return {
        id: obj.id,
        type: obj.type || '',
        description: translate(tasksZh, obj.description) || obj.description || '',
        optional: Boolean(obj.optional),
        count: typeof obj.count === 'number' ? obj.count : undefined,
        foundInRaid: obj.foundInRaid,
        mapNames: mapIds.map((id) => MAP_NAMES[id] || id),
      };
    });
    const mapIds = unique([
      asId(task.map),
      ...(task.objectives || []).flatMap((obj) => (obj.maps || []).map((map) => asId(map))),
    ]);
    return {
      id: task.id,
      name: translate(tasksZh, task.name) || displayName(task.normalizedName) || task.id,
      normalizedName: task.normalizedName || task.id,
      traderId,
      traderName: traderNameOf(traderId),
      traderImage: traders[traderId]?.imageLink || `https://assets.tarkov.dev/${traderId}.webp`,
      wikiLink: task.wikiLink || '',
      image: task.taskImageLink || `https://assets.tarkov.dev/${task.id}.webp`,
      minPlayerLevel: task.minPlayerLevel || 0,
      experience: task.experience || 0,
      kappaRequired: Boolean(task.kappaRequired),
      lightkeeperRequired: Boolean(task.lightkeeperRequired),
      factionName: task.factionName || 'Any',
      mapIds,
      mapNames: mapIds.map((id) => MAP_NAMES[id] || id),
      taskRequirements: (task.taskRequirements || [])
        .map((req) => ({ id: asId(req.task), name: asId(req.task) }))
        .filter((req) => req.id),
      objectives,
      finishRewards: {
        items: (task.finishRewards?.items || []).map((entry) => {
          const id = asId(entry.item) || asId(entry);
          return {
            id,
            name: itemNameOf(id),
            count: entry.count || 1,
            image: items[id]?.image || `https://assets.tarkov.dev/${id}-base-image.webp`,
          };
        }),
        traderStanding: (task.finishRewards?.traderStanding || []).map((entry) => {
          const id = asId(entry.trader);
          return { traderId: id, traderName: traderNameOf(id), standing: entry.standing || 0 };
        }),
      },
    };
  });

  const byId = new Map(catalog.map((task) => [task.id, task]));
  catalog.forEach((task) => {
    task.taskRequirements = task.taskRequirements.map((req) => ({
      id: req.id,
      name: byId.get(req.id)?.name || req.id,
    }));
  });

  return catalog.sort((a, b) => {
    if (a.minPlayerLevel !== b.minPlayerLevel) return a.minPlayerLevel - b.minPlayerLevel;
    return a.name.localeCompare(b.name, 'zh');
  });
};

/**
 * 另外产出一份「精简目录」给 room-server 使用。
 *
 * 按图识别需要把全部任务喂给大模型做匹配，这份目录必须由服务端持有：
 * 让前端上传目录既浪费带宽，又等于让调用方任意控制 prompt 内容。
 * 只保留匹配用得上的字段，体积从 ~750KB 降到 ~80KB。
 */
const writeCompactCatalog = (catalog) => {
  const compact = catalog.map((task) => ({
    id: task.id,
    name: task.name,
    trader: task.traderName,
    maps: task.mapNames,
    objectives: (task.objectives || []).map((item) => item.description).filter(Boolean),
  }));
  const dir = path.join(root, 'room-server/src/data');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'tasks-compact.json');
  fs.writeFileSync(out, `${JSON.stringify(compact)}\n`);
  console.log(
    `Saved room-server/src/data/tasks-compact.json (${compact.length} tasks, ${(Buffer.byteLength(JSON.stringify(compact)) / 1024).toFixed(0)} KB)`,
  );
};

const main = async () => {
  const dataDir = path.join(root, 'src/data');

  // --local：不联网，仅用现有 tasks-catalog.json 重新生成 room-server 的精简目录。
  if (process.argv.includes('--local')) {
    const catalog = JSON.parse(fs.readFileSync(path.join(dataDir, 'tasks-catalog.json'), 'utf8'));
    writeCompactCatalog(catalog);
    return;
  }

  const itemsPath = path.join(dataDir, 'items-slim.json');
  const items = fs.existsSync(itemsPath) ? JSON.parse(fs.readFileSync(itemsPath, 'utf8')) : {};

  console.log('Fetching tasks / traders / items ...');
  const [tasksPayload, tasksZhPayload, tradersPayload, tradersZhPayload, itemsZhPayload] =
    await Promise.all([
      fetchJson(`${JSON_API}/regular/tasks`),
      fetchJson(`${JSON_API}/regular/tasks_zh`),
      fetchJson(`${JSON_API}/regular/traders`),
      fetchJson(`${JSON_API}/regular/traders_zh`),
      fetchJson(`${JSON_API}/regular/items_zh`),
    ]);

  const catalog = transformTaskCatalog(
    tasksPayload,
    tasksZhPayload.data || {},
    tradersPayload,
    tradersZhPayload.data || {},
    items,
    itemsZhPayload.data || {},
  );
  const out = path.join(dataDir, 'tasks-catalog.json');
  fs.writeFileSync(out, `${JSON.stringify(catalog)}\n`);
  console.log(
    `Saved tasks-catalog.json (${catalog.length} tasks, ${(Buffer.byteLength(JSON.stringify(catalog)) / 1024).toFixed(0)} KB)`,
  );

  writeCompactCatalog(catalog);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
