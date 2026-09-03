import L from 'leaflet';

import type { MapTask } from '@/data/transformTasks';

import { showTooltip } from '@/pages/InteractiveMap/components/UI/Tooltip';
import { getIconCDN, getLootType, getSpawnType } from '@/pages/InteractiveMap/utils';

import { pos } from './crs';

const escapeHtml = (value: string) => {
  return value.replace(/[&<>"']/g, (char) => {
    return (
      {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[char] || char
    );
  });
};

const EXTRACT_COLOR: Record<string, string> = {
  pmc: '#88ff00',
  scav: '#ff8800',
  shared: '#00ccff',
  transit: '#ff4444',
};

const markerIcon = (src: string, extraClass = '') => {
  return L.divIcon({
    className: `im-leaflet-marker ${extraClass}`,
    html: `<img src="${src}" alt="" />`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  });
};

const isOnLevel = (y: number, heightRange: number[], activeLayer?: InteractiveMap.Layer) => {
  if (!activeLayer) {
    return true;
  }
  return y >= heightRange[0] && y <= heightRange[1];
};

const bindTooltip = (map: L.Map, marker: L.Marker, text: string | HTMLElement) => {
  marker.on('click', (event) => {
    L.DomEvent.stopPropagation(event);
    const point = map.latLngToContainerPoint(event.latlng);
    const rect = map.getContainer().getBoundingClientRect();
    showTooltip({
      x: rect.left + point.x,
      y: rect.top + point.y,
      text,
    });
  });
};

const applyLevelState = (marker: L.Layer, onLevel: boolean) => {
  const layer = marker as L.Marker & L.Polygon;
  const el = layer._icon || layer._path;
  el?.classList.toggle('off-level', !onLevel);
};

const placeMarker = (
  group: L.LayerGroup,
  latLng: L.LatLngExpression,
  icon: L.DivIcon,
  y: number,
  onLevel: boolean,
  extra?: L.MarkerOptions,
) => {
  const options: L.MarkerOptions = { icon, ...extra };
  options.positionY = y;
  const marker = L.marker(latLng, options);
  applyLevelState(marker, onLevel);
  marker.addTo(group);
  return marker;
};

export const syncLevelVisibility = (
  layers: L.Layer[],
  heightRange: number[],
  activeLayer?: InteractiveMap.Layer,
) => {
  layers.forEach((layer) => {
    const y = (layer as L.Marker).options.positionY;
    if (typeof y !== 'number') {
      return;
    }
    applyLevelState(layer, isOnLevel(y, heightRange, activeLayer));
  });
};

export const buildExtracts = (
  map: L.Map,
  extracts: InteractiveMap.Extract[],
  show: InteractiveMap.Faction[],
  heightRange: number[],
  activeLayer?: InteractiveMap.Layer,
) => {
  const group = L.layerGroup();
  extracts.forEach((extract) => {
    if (!show.includes(extract.faction) || !extract.position) {
      return;
    }
    const color = EXTRACT_COLOR[extract.faction] || '#ffffff';
    const icon = L.divIcon({
      className: 'im-leaflet-marker im-leaflet-extract',
      html:
        `<img src="${getIconCDN(`extract_${extract.faction}`)}" alt="" />` +
        `<span style="color:${color}">${extract.name || ''}</span>`,
      iconSize: [24, 24],
      iconAnchor: [12, 24],
    });
    const marker = placeMarker(
      group,
      pos(extract.position),
      icon,
      extract.position.y,
      isOnLevel(extract.position.y, heightRange, activeLayer),
    );
    bindTooltip(map, marker, extract.name || '');
  });
  return group;
};

export const buildSpawns = (
  map: L.Map,
  mapData: InteractiveMap.Data,
  show: string[],
  heightRange: number[],
  activeLayer?: InteractiveMap.Layer,
) => {
  const group = L.layerGroup();
  const bosses: Record<string, Array<{ name: string; chance: number; normalizedName: string }>> =
    {};
  mapData.bosses?.forEach((boss) => {
    boss.spawnLocations?.forEach((location) => {
      const list = bosses[location.spawnKey] || [];
      list.push({
        name: boss.boss.name,
        chance: boss.spawnChance,
        normalizedName: boss.boss.normalizedName,
      });
      bosses[location.spawnKey] = list;
    });
  });
  mapData.spawns?.forEach((spawn) => {
    const bossNames = bosses[spawn.zoneName]?.map((boss) => boss.normalizedName);
    const type = getSpawnType(spawn.categories, bossNames);
    if (!show.includes(type) || !spawn.position) {
      return;
    }
    const marker = placeMarker(
      group,
      pos(spawn.position),
      markerIcon(getIconCDN(`spawn_${type}`)),
      spawn.position.y,
      isOnLevel(spawn.position.y, heightRange, activeLayer),
    );
    const bossHtml = bosses[spawn.zoneName]
      ?.filter(
        (boss) => spawn.categories.includes('boss') || boss.normalizedName === 'cultist-priest',
      )
      .map((boss) => `${boss.name} (${Math.round(boss.chance * 100)}%)`)
      .join('<br/>');
    bindTooltip(map, marker, bossHtml || spawn.zoneName || type);
  });
  return group;
};

export const buildLocks = (
  map: L.Map,
  locks: InteractiveMap.Lock[],
  show: string[],
  heightRange: number[],
  activeLayer?: InteractiveMap.Layer,
) => {
  const group = L.layerGroup();
  if (!show.includes('lock')) {
    return group;
  }
  locks.forEach((lock) => {
    if (!lock.position) {
      return;
    }
    const marker = placeMarker(
      group,
      pos(lock.position),
      markerIcon(getIconCDN('lock')),
      lock.position.y,
      isOnLevel(lock.position.y, heightRange, activeLayer),
    );
    bindTooltip(map, marker, lock.key?.name || '锁');
  });
  return group;
};

export const buildLoot = (
  map: L.Map,
  lootContainers: InteractiveMap.LootContainer[],
  show: string[],
  heightRange: number[],
  activeLayer?: InteractiveMap.Layer,
) => {
  const group = L.layerGroup();
  lootContainers.forEach((loot) => {
    if (!loot.position || !loot.lootContainer) {
      return;
    }
    const lootType = getLootType(loot.lootContainer.normalizedName);
    if (!show.includes(lootType)) {
      return;
    }
    const marker = placeMarker(
      group,
      pos(loot.position),
      markerIcon(getIconCDN(`container_${loot.lootContainer.normalizedName}`)),
      loot.position.y,
      isOnLevel(loot.position.y, heightRange, activeLayer),
    );
    bindTooltip(map, marker, loot.lootContainer.name);
  });
  return group;
};

export const buildHazards = (
  map: L.Map,
  hazards: InteractiveMap.Hazard[],
  show: string[],
  heightRange: number[],
  activeLayer?: InteractiveMap.Layer,
) => {
  const group = L.layerGroup();
  if (!show.includes('hazard')) {
    return group;
  }
  hazards.forEach((hazard) => {
    if (!hazard.position) {
      return;
    }
    if (hazard.outline?.length >= 3) {
      const options: L.PolylineOptions = {
        color: '#ff2828',
        weight: 1,
        fillColor: '#ff8888',
        fillOpacity: 0.25,
      };
      options.positionY = hazard.position.y;
      const polygon = L.polygon(
        hazard.outline.map((point) => pos(point)),
        options,
      );
      applyLevelState(polygon, isOnLevel(hazard.position.y, heightRange, activeLayer));
      polygon.addTo(group);
    }
    const marker = placeMarker(
      group,
      pos(hazard.position),
      markerIcon(getIconCDN('hazard')),
      hazard.position.y,
      isOnLevel(hazard.position.y, heightRange, activeLayer),
    );
    bindTooltip(map, marker, hazard.name || '危险区');
  });
  return group;
};

export const buildWeapons = (
  map: L.Map,
  weapons: InteractiveMap.StationaryWeapon[],
  show: string[],
  heightRange: number[],
  activeLayer?: InteractiveMap.Layer,
) => {
  const group = L.layerGroup();
  if (!show.includes('stationaryWeapon')) {
    return group;
  }
  weapons.forEach((weapon) => {
    if (!weapon.position || !weapon.stationaryWeapon) {
      return;
    }
    const marker = placeMarker(
      group,
      pos(weapon.position),
      markerIcon(getIconCDN('stationarygun')),
      weapon.position.y,
      isOnLevel(weapon.position.y, heightRange, activeLayer),
    );
    bindTooltip(map, marker, weapon.stationaryWeapon.name || weapon.stationaryWeapon.shortName);
  });
  return group;
};

export const buildLabels = (
  labels: InteractiveMap.Label[],
  heightRange: number[],
  activeLayer?: InteractiveMap.Layer,
) => {
  const group = L.layerGroup();
  labels.forEach((label) => {
    const y =
      typeof label.top === 'number' && typeof label.bottom === 'number'
        ? (label.top + label.bottom) / 2
        : heightRange[0];
    const fontSize = Math.max(10, (label.size || 60) / 8);
    const icon = L.divIcon({
      className: 'im-leaflet-label',
      html:
        `<span style="transform:rotate(${label.rotation || 0}deg);` +
        `font-size:${fontSize}px">${label.text}</span>`,
      iconAnchor: [0, 0],
    });
    placeMarker(
      group,
      pos({ x: label.position[0], z: label.position[1] }),
      icon,
      y,
      isOnLevel(y, heightRange, activeLayer),
      { interactive: false, zIndexOffset: -1000 },
    );
  });
  return group;
};

const itemRowHtml = (image: string, name: string) => {
  const img = image ? `<img src="${escapeHtml(image)}" alt="" />` : '';
  return `<div class="im-tooltip-row">${img}<span>${escapeHtml(name)}</span></div>`;
};

export const buildTasks = (
  map: L.Map,
  tasks: MapTask[],
  mapId: string,
  show: string[],
  heightRange: number[],
  activeLayer?: InteractiveMap.Layer,
) => {
  const group = L.layerGroup();
  const showItems = show.includes('quest_item');
  const showObjectives = show.includes('quest_objective');
  if (!showItems && !showObjectives) {
    return group;
  }
  tasks.forEach((task) => {
    task.objectives.forEach((objective) => {
      if (showItems) {
        objective.possibleLocations
          ?.filter((loc) => loc.mapId === mapId)
          .forEach((loc) => {
            loc.positions.forEach((position) => {
              const marker = placeMarker(
                group,
                pos(position),
                markerIcon(getIconCDN('quest_item'), 'im-leaflet-quest'),
                position.y,
                isOnLevel(position.y, heightRange, activeLayer),
                { zIndexOffset: 200 },
              );
              const item = objective.questItem;
              bindTooltip(
                map,
                marker,
                `<div class="im-tooltip-title">${escapeHtml(task.name)}</div>${
                  item ? itemRowHtml(item.image, item.name) : ''
                }<div>${escapeHtml(objective.description || '')}</div>`,
              );
            });
          });
      }
      if (showObjectives) {
        objective.zones
          ?.filter((zone) => zone.mapId === mapId && zone.position)
          .forEach((zone) => {
            if (zone.outline?.length >= 3) {
              const options: L.PolylineOptions = {
                color: '#e5e200',
                weight: 1,
                fillColor: '#e5e200',
                fillOpacity: 0.12,
              };
              options.positionY = zone.position.y;
              const polygon = L.polygon(
                zone.outline.map((point) => pos(point)),
                options,
              );
              applyLevelState(polygon, isOnLevel(zone.position.y, heightRange, activeLayer));
              polygon.addTo(group);
            }
            const marker = placeMarker(
              group,
              pos(zone.position),
              markerIcon(getIconCDN('quest_objective'), 'im-leaflet-quest'),
              zone.position.y,
              isOnLevel(zone.position.y, heightRange, activeLayer),
              { zIndexOffset: 180 },
            );
            bindTooltip(
              map,
              marker,
              `<div class="im-tooltip-title">${escapeHtml(task.name)}</div>` +
                `<div>${escapeHtml(objective.description || '')}</div>`,
            );
          });
      }
    });
  });
  return group;
};

export const buildLooseLoot = (
  map: L.Map,
  lootLoose: InteractiveMap.LootLoose[],
  show: string[],
  heightRange: number[],
  activeLayer?: InteractiveMap.Layer,
) => {
  const group = L.layerGroup();
  if (!show.length) {
    return group;
  }
  lootLoose.forEach((loot) => {
    if (!loot.position || !loot.items?.length) {
      return;
    }
    const visibleItems = loot.items.filter((item) => show.includes(item.category));
    if (!visibleItems.length) {
      return;
    }
    const primary = visibleItems[0];
    const iconSrc =
      visibleItems.length === 1 ? primary.image : primary.categoryImage || primary.image;
    const marker = placeMarker(
      group,
      pos(loot.position),
      markerIcon(iconSrc, 'im-leaflet-loot'),
      loot.position.y,
      isOnLevel(loot.position.y, heightRange, activeLayer),
    );
    bindTooltip(
      map,
      marker,
      `<div class="im-tooltip-title">${escapeHtml(primary.categoryName || '散落物资')}</div>${
        visibleItems.map((item) => itemRowHtml(item.image, item.name)).join('')}`,
    );
  });
  return group;
};
