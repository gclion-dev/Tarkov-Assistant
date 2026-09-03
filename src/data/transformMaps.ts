import { ApiMap } from '@/data/mergeMaps';

interface JsonMapsPayload {
  data: {
    maps: Record<string, any>;
    mobs: Record<string, any>;
    lootContainers: Record<string, any>;
    stationaryWeapons: Record<string, any>;
  };
}

const translate = (dict: Record<string, string>, value?: string | null) => {
  if (!value) {
    return '';
  }
  return dict[value] || value;
};

export const transformJsonMaps = (
  payload: JsonMapsPayload,
  zh: Record<string, string> = {},
): ApiMap[] => {
  const { maps, mobs, lootContainers, stationaryWeapons } = payload.data;
  return Object.values(maps || {}).map((raw) => {
    const bosses = (raw.bosses || []).map((boss: any) => {
      const mob = mobs?.[boss.mob] || {};
      return {
        spawnChance: boss.spawnChance,
        spawnLocations: (boss.spawnLocations || []).map((loc: any) => ({
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
    });
    return {
      id: raw.id,
      tarkovDataId: raw.tarkovDataId,
      name: translate(zh, raw.name),
      normalizedName: raw.normalizedName,
      nameId: raw.nameId,
      wiki: raw.wiki,
      description: translate(zh, raw.description),
      enemies: (raw.enemies || []).map((enemy: string) => translate(zh, enemy)),
      raidDuration: raw.raidDuration,
      players: raw.players,
      bosses,
      spawns: raw.spawns || [],
      extracts: (raw.extracts || []).map((extract: any) => ({
        id: extract.id,
        name: translate(zh, extract.name),
        faction: extract.faction,
        switches: [],
        position: extract.position,
        outline: extract.outline || [],
        top: extract.top,
        bottom: extract.bottom,
      })),
      // 转移点在 API 里是独立的 transits 字段，合并进地图时按 faction=transit 显示。
      transits: (raw.transits || [])
        .filter((transit: any) => transit?.position)
        .map((transit: any) => {
          const name = translate(zh, transit.description) || '转移点';
          const condition = translate(zh, transit.conditions);
          return {
            id: `transit-${transit.id}`,
            name: condition ? `${name}（${condition}）` : name,
            faction: 'transit' as const,
            switches: [],
            position: transit.position,
            outline: transit.outline || [],
            top: transit.top,
            bottom: transit.bottom,
          };
        }),
      locks: (raw.locks || [])
        .filter((lock: any) => lock.position)
        .map((lock: any) => ({
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
        .filter((hazard: any) => hazard.position)
        .map((hazard: any) => ({
          hazardType: hazard.hazardType,
          name: translate(zh, hazard.name),
          position: hazard.position,
          outline: hazard.outline || [],
          top: hazard.top,
          bottom: hazard.bottom,
        })),
      lootContainers: (raw.lootContainers || []).map((loot: any) => {
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
      stationaryWeapons: (raw.stationaryWeapons || []).map((weapon: any) => {
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
        .filter((loot: any) => loot?.position)
        .map((loot: any) => ({
          position: loot.position,
          itemIds: (loot.items || []).filter(Boolean),
        })),
    };
  });
};
