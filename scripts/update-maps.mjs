import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const MAPS_JSON_URL =
  'https://raw.githubusercontent.com/the-hideout/tarkov-dev/main/src/data/maps.json';
const JSON_API = 'https://json.tarkov.dev';

const translate = (dict, value) => {
  if (!value) return '';
  return dict[value] || value;
};

const asMapId = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.id || '';
};

const transformJsonMaps = (payload, zh = {}) => {
  const { maps, mobs, lootContainers, stationaryWeapons } = payload.data;
  return Object.values(maps || {}).map((raw) => ({
    id: raw.id,
    tarkovDataId: raw.tarkovDataId,
    name: translate(zh, raw.name),
    normalizedName: raw.normalizedName,
    nameId: raw.nameId,
    wiki: raw.wiki,
    description: translate(zh, raw.description),
    enemies: (raw.enemies || []).map((enemy) => translate(zh, enemy)),
    raidDuration: raw.raidDuration,
    players: raw.players,
    bosses: (raw.bosses || []).map((boss) => {
      const mob = mobs?.[boss.mob] || {};
      return {
        spawnChance: boss.spawnChance,
        spawnLocations: (boss.spawnLocations || []).map((loc) => ({
          spawnKey: loc.spawnKey,
          name: translate(zh, loc.name),
          chance: loc.chance,
        })),
        boss: {
          id: mob.id || boss.mob,
          name: translate(zh, mob.name || boss.mob),
          normalizedName: mob.normalizedName || '',
          imagePortraitLink: mob.imagePortraitLink,
          imagePosterLink: mob.imagePosterLink,
        },
      };
    }),
    spawns: raw.spawns || [],
    extracts: (raw.extracts || []).map((extract) => ({
      id: extract.id,
      name: translate(zh, extract.name),
      faction: extract.faction,
      switches: [],
      position: extract.position,
      outline: extract.outline || [],
      top: extract.top,
      bottom: extract.bottom,
    })),
    locks: (raw.locks || [])
      .filter((lock) => lock.position)
      .map((lock) => ({
        lockType: lock.lockType,
        needsPower: lock.needsPower,
        position: lock.position,
        outline: lock.outline || [],
        top: lock.top,
        bottom: lock.bottom,
        key: {
          id: lock.key || '',
          name: lock.key || '锁',
          normalizedName: lock.key || '',
        },
      })),
    hazards: (raw.hazards || [])
      .filter((hazard) => hazard.position)
      .map((hazard) => ({
        hazardType: hazard.hazardType,
        name: translate(zh, hazard.name),
        position: hazard.position,
        outline: hazard.outline || [],
        top: hazard.top,
        bottom: hazard.bottom,
      })),
    lootContainers: (raw.lootContainers || []).map((loot) => {
      const info = lootContainers?.[loot.lootContainer] || {};
      return {
        position: loot.position,
        lootContainer: {
          id: loot.lootContainer,
          name: translate(zh, info.name || loot.lootContainer),
          normalizedName: info.normalizedName || '',
        },
      };
    }),
    stationaryWeapons: (raw.stationaryWeapons || []).map((weapon) => {
      const info = stationaryWeapons?.[weapon.stationaryWeapon] || {};
      return {
        position: weapon.position,
        stationaryWeapon: {
          id: weapon.stationaryWeapon,
          name: translate(zh, info.name),
          shortName: translate(zh, info.shortName),
        },
      };
    }),
    lootLoose: (raw.lootLoose || [])
      .filter((loot) => loot?.position)
      .map((loot) => ({
        position: loot.position,
        itemIds: (loot.items || []).filter(Boolean),
      })),
  }));
};

const transformTasks = (payload, zh = {}) => {
  const { tasks, questItems = {} } = payload.data || {};
  return Object.values(tasks || {})
    .map((task) => {
      const objectives = (task.objectives || [])
        .map((obj) => {
          const questItemId = typeof obj.questItem === 'string' ? obj.questItem : obj.questItem?.id;
          const questItem = questItemId ? questItems[questItemId] : undefined;
          const possibleLocations = (obj.possibleLocations || [])
            .map((loc) => ({
              mapId: asMapId(loc.map),
              positions: loc.positions || [],
            }))
            .filter((loc) => loc.mapId && loc.positions.length > 0);
          const zones = (obj.zones || [])
            .map((zone) => ({
              id: zone.id,
              mapId: asMapId(zone.map),
              position: zone.position,
              outline: zone.outline || [],
              top: zone.top,
              bottom: zone.bottom,
            }))
            .filter((zone) => zone.mapId && zone.position);
          if (!possibleLocations.length && !zones.length) {
            return null;
          }
          return {
            id: obj.id,
            type: obj.type,
            description: translate(zh, obj.description) || obj.description,
            questItem: questItem
              ? {
                  id: questItem.id || questItemId,
                  name: translate(zh, questItem.name) || questItem.normalizedName || questItem.id,
                  shortName: translate(zh, questItem.shortName) || questItem.shortName || '',
                  image: questItem.baseImageLink || questItem.iconLink || '',
                }
              : undefined,
            possibleLocations,
            zones,
          };
        })
        .filter(Boolean);
      return {
        id: task.id,
        name: translate(zh, task.name) || task.normalizedName || task.id,
        normalizedName: task.normalizedName || task.id,
        objectives,
      };
    })
    .filter((task) => task.objectives.length);
};

const buildSlimItems = (itemPayload, zh = {}, itemIds = new Set()) => {
  const items = itemPayload.data?.items || {};
  const handbook = itemPayload.data?.handbookCategories || {};
  const slim = {};
  itemIds.forEach((id) => {
    const item = items[id];
    if (!item) {
      return;
    }
    const catId = item.handbookCategories?.[0];
    const cat = handbook[catId] || {};
    const category = cat.normalizedName || item.types?.[0] || 'unknown';
    slim[id] = {
      id,
      name: translate(zh, item.name) || item.name || id,
      shortName: translate(zh, item.shortName) || item.shortName || '',
      image: item.baseImageLink || item.iconLink || `https://assets.tarkov.dev/${id}-base-image.webp`,
      category,
      categoryName: translate(zh, cat.name) || cat.name || category,
      categoryImage: cat.imageLink || undefined,
    };
  });
  return slim;
};

const fetchJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status} ${res.statusText}`);
  }
  return res.json();
};

const readCache = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const main = async () => {
  const dataDir = path.join(root, 'src/data');
  fs.mkdirSync(dataDir, { recursive: true });

  console.log('Fetching maps.json ...');
  try {
    const mapsMeta = await fetchJson(MAPS_JSON_URL);
    fs.writeFileSync(path.join(dataDir, 'maps.json'), `${JSON.stringify(mapsMeta, null, 2)}\n`);
    console.log(`Saved maps.json (${mapsMeta.length} groups)`);
  } catch (err) {
    console.warn('maps.json fetch failed, keep existing file:', err.message);
  }

  console.log('Fetching json.tarkov.dev maps / tasks / items ...');
  const cachedMaps = readCache('/tmp/tarkov-maps.json');
  const cachedTasks = readCache('/tmp/tarkov-tasks.json');
  const cachedTasksZh = readCache('/tmp/tarkov-tasks-zh.json');

  const [payload, zhPayload, tasksPayload, tasksZhPayload, itemsPayload, itemsZhPayload] =
    await Promise.all([
      cachedMaps || fetchJson(`${JSON_API}/regular/maps`),
      fetchJson(`${JSON_API}/regular/maps_zh`),
      cachedTasks || fetchJson(`${JSON_API}/regular/tasks`),
      cachedTasksZh || fetchJson(`${JSON_API}/regular/tasks_zh`),
      fetchJson(`${JSON_API}/regular/items`),
      fetchJson(`${JSON_API}/regular/items_zh`),
    ]);

  const maps = transformJsonMaps(payload, zhPayload.data || {});
  fs.writeFileSync(path.join(dataDir, 'maps-api.json'), `${JSON.stringify(maps)}\n`);
  console.log(
    `Saved maps-api.json (${maps.length} maps, ${(Buffer.byteLength(JSON.stringify(maps)) / 1024 / 1024).toFixed(2)} MB)`,
  );

  const tasks = transformTasks(tasksPayload, tasksZhPayload.data || {});
  fs.writeFileSync(path.join(dataDir, 'tasks-api.json'), `${JSON.stringify(tasks)}\n`);
  console.log(
    `Saved tasks-api.json (${tasks.length} tasks, ${(Buffer.byteLength(JSON.stringify(tasks)) / 1024).toFixed(0)} KB)`,
  );

  const itemIds = new Set();
  maps.forEach((map) => {
    (map.lootLoose || []).forEach((loot) => {
      (loot.itemIds || []).forEach((id) => itemIds.add(id));
    });
  });
  const slimItems = buildSlimItems(itemsPayload, itemsZhPayload.data || {}, itemIds);
  fs.writeFileSync(path.join(dataDir, 'items-slim.json'), `${JSON.stringify(slimItems)}\n`);
  console.log(
    `Saved items-slim.json (${Object.keys(slimItems).length} / ${itemIds.size} items, ${(Buffer.byteLength(JSON.stringify(slimItems)) / 1024).toFixed(0)} KB)`,
  );
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
