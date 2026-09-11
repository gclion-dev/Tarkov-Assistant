import { useEffect, useMemo, useRef } from 'react';

import { useInterval } from 'ahooks';
import L from 'leaflet';

import type { MapTask } from '@/data/transformTasks';
import {
  DEFAULT_SELF_COLOR,
  type MapMark,
  type PlayerLocation,
  type RoomMember,
} from '@/features/room/types';
import type { GeneratedRoutePlan } from '@/features/tasks/services/routePlanApi';
import { escapeHtml } from '@/utils/html';
import { parseLocationFromFilename, quaternionToEulerAngles } from '@/utils/tarkov';

import { showContextMenu } from '@/pages/InteractiveMap/components/UI/ContextMenu';
import { getIconCDN } from '@/pages/InteractiveMap/utils';

import { gameLatLng, getBounds, getCRS, getScaledBounds, pos } from './crs';
import {
  buildExtracts,
  buildHazards,
  buildLabels,
  buildLocks,
  buildLooseLoot,
  buildLoot,
  buildRoutePlan,
  buildSpawns,
  buildTasks,
  buildWeapons,
  syncLevelVisibility,
} from './markers';

import 'leaflet/dist/leaflet.css';
import './style.less';

interface LeafletMapProps {
  mapData: InteractiveMap.Data;
  activeLayer: InteractiveMap.Layer | undefined;
  markerExtracts: InteractiveMap.Faction[];
  markerLocks: string[];
  markerLootKeys: string[];
  markerLootLoose: string[];
  markerSpawns: string[];
  markerHazards: string[];
  markerStationaryWeapons: string[];
  markerTasks: string[];
  tasks: MapTask[];
  routePlan?: GeneratedRoutePlan | null;
  locationScale?: boolean;
  strokeType: InteractiveMap.StrokeType;
  strokeColor: string;
  strokeWidth: number;
  eraserWidth: number;
  selfUserId?: string;
  /** 自己的最新位置。不在房间里时也会渲染，保证单人使用的行为不变。 */
  selfLocation?: PlayerLocation;
  roomMembers?: RoomMember[];
  /** 自己打的坐标标记（含其他地图的，渲染时按 mapId 过滤）。 */
  marks?: MapMark[];
  onCursorPositionChange?: (cursorPosition: InteractiveMap.Position2D) => void;
  onRulerPositionChange?: (rulerPosition: InteractiveMap.Position2D[] | undefined) => void;
  onLocationUpdate?: (location: PlayerLocation) => void;
  /** 点自己的标记即删除。队友的标记不可交互，只能由本人删除。 */
  onMarkRemove?: (id: string) => void;
}

interface PlayerMarkerEntry {
  label: string;
  color: string;
  location: PlayerLocation;
  isSelf: boolean;
}

interface MarkEntry {
  mark: MapMark;
  color: string;
  /** 归属者昵称，用于 hover 提示。自己的标记为 undefined。 */
  owner?: string;
  isSelf: boolean;
}

const MARK_ICON_SRC = getIconCDN('map-mark');
const MARK_ICON_SIZE = 32;
/** 靶心在 128×128 图里约 (57, 63)，换算到 32×32 后作为锚点，让标记对准点击坐标。 */
const MARK_ICON_ANCHOR: [number, number] = [14, 16];
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const markIconHtml = (color: string, title: string) => {
  const safeColor = HEX_COLOR.test(color) ? color : DEFAULT_SELF_COLOR;
  return (
    `<div class="im-leaflet-mark-shape" title="${title}" style="--mark-color:${safeColor}">` +
    `<img src="${MARK_ICON_SRC}" alt="" />` +
    '</div>'
  );
};

interface DrawStroke {
  id: string;
  tool: 'draw' | 'eraser';
  color: string;
  weight: number;
  latlngs: L.LatLng[];
  layer: L.Polyline;
}

const FLASH_MS = 2400;

const Index = (props: LeafletMapProps) => {
  const {
    mapData,
    activeLayer,
    markerExtracts,
    markerLocks,
    markerLootKeys,
    markerLootLoose,
    markerSpawns,
    markerHazards,
    markerStationaryWeapons,
    markerTasks,
    tasks,
    routePlan,
    locationScale,
    strokeType,
    strokeColor,
    strokeWidth,
    eraserWidth,
    selfUserId,
    selfLocation,
    roomMembers,
    marks,
    onCursorPositionChange,
    onRulerPositionChange,
    onLocationUpdate,
    onMarkRemove,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map>();
  const svgOverlayRef = useRef<L.SVGOverlay>();
  const svgLoadedRef = useRef(Promise.resolve());
  const tileLayerRef = useRef<L.TileLayer>();
  const markerGroupsRef = useRef<L.LayerGroup[]>([]);
  const routeGroupRef = useRef<L.LayerGroup>();
  const drawPaneRef = useRef<L.LayerGroup>();
  const drawStrokesRef = useRef<DrawStroke[]>([]);
  const drawingRef = useRef<{ points: L.LatLng[]; layer?: L.Polyline }>();
  const rulerRef = useRef<{ start?: L.LatLng; line?: L.Polyline; marks?: L.Layer[] }>({});
  const playerLayerRef = useRef<L.LayerGroup>();
  const markLinkLayerRef = useRef<L.LayerGroup>();
  const moveKeysRef = useRef<Set<string>>(new Set());
  const onCursorRef = useRef(onCursorPositionChange);
  const onRulerRef = useRef(onRulerPositionChange);
  const strokeTypeRef = useRef(strokeType);
  const strokeColorRef = useRef(strokeColor);
  const strokeWidthRef = useRef(strokeWidth);
  const eraserWidthRef = useRef(eraserWidth);
  const locationScaleRef = useRef(locationScale);
  const mapDataRef = useRef(mapData);
  const onLocationUpdateRef = useRef(onLocationUpdate);
  const roomMembersRef = useRef(roomMembers);
  const selfUserIdRef = useRef(selfUserId);
  const selfLocationRef = useRef(selfLocation);
  const markLayerRef = useRef<L.LayerGroup>();
  const marksRef = useRef(marks);
  const onMarkRemoveRef = useRef(onMarkRemove);
  const flashUntilRef = useRef(0);
  const flashTimerRef = useRef<number>();
  const teammateLocSigRef = useRef('');
  const teammateReadyRef = useRef(false);
  const teammateMapIdRef = useRef(mapData.id);
  const startPlayerFlashRef = useRef<() => void>(() => undefined);

  onCursorRef.current = onCursorPositionChange;
  onRulerRef.current = onRulerPositionChange;
  strokeTypeRef.current = strokeType;
  strokeColorRef.current = strokeColor;
  strokeWidthRef.current = strokeWidth;
  eraserWidthRef.current = eraserWidth;
  locationScaleRef.current = locationScale;
  mapDataRef.current = mapData;
  onLocationUpdateRef.current = onLocationUpdate;
  roomMembersRef.current = roomMembers;
  selfUserIdRef.current = selfUserId;
  selfLocationRef.current = selfLocation;
  marksRef.current = marks;
  onMarkRemoveRef.current = onMarkRemove;

  /**
   * 自己的颜色。
   *
   * 在房间里时用服务端分配给自己的那一份，而不是固定的默认绿色 —— 否则房间里
   * 每个人看自己都是绿色，「不同玩家不同颜色」就只对队友生效。
   * 箭头和坐标标记共用这个颜色，靠形状区分二者。
   */
  const getSelfColor = () => {
    const selfId = selfUserIdRef.current;
    const own = selfId
      ? (roomMembersRef.current || []).find((member) => member.userId === selfId)
      : undefined;
    return own?.color || DEFAULT_SELF_COLOR;
  };

  /** 把四元数换算成地图上的箭头角度（需要叠加地图自身的坐标系旋转）。 */
  const getMarkerRotation = (quaternion?: number[]) => {
    if (!quaternion) {
      return 0;
    }
    const { coordinateRotation } = mapDataRef.current;
    const rotation = quaternionToEulerAngles(quaternion)[0];
    if (coordinateRotation === 90 || coordinateRotation === 270) {
      return rotation + coordinateRotation + 180;
    }
    return rotation + (coordinateRotation || 0);
  };

  /**
   * 靶标 ↔ 放置者当前位置的虚线。
   *
   * 没有位置（还没定位到）就不画，避免悬空线段。自己的起点用本地位置，
   * 队友的用房间下发的那一份。连线在图标之下，避免盖住靶心和箭头。
   */
  const renderMarkLinks = () => {
    const layer = markLinkLayerRef.current;
    if (!layer) {
      return;
    }
    layer.clearLayers();

    const currentMapId = mapDataRef.current.id;
    const selfId = selfUserIdRef.current;
    const selfColor = getSelfColor();
    const ownLoc = selfLocationRef.current;

    const addLink = (from: { x: number; z: number }, to: { x: number; z: number }, color: string) => {
      const safeColor = HEX_COLOR.test(color) ? color : DEFAULT_SELF_COLOR;
      L.polyline([pos(from), pos(to)], {
        color: safeColor,
        weight: 2,
        dashArray: '7 6',
        opacity: 0.8,
        interactive: false,
        className: 'im-leaflet-mark-link',
      }).addTo(layer);
    };

    if (ownLoc && ownLoc.mapId === currentMapId) {
      (marksRef.current || []).forEach((mark) => {
        if (mark.mapId !== currentMapId) {
          return;
        }
        addLink(ownLoc, mark, selfColor);
      });
    }

    (roomMembersRef.current || []).forEach((member) => {
      if (selfId && member.userId === selfId) {
        return;
      }
      const loc = member.location;
      if (!loc || loc.mapId !== currentMapId) {
        return;
      }
      (member.marks || []).forEach((mark) => {
        if (mark.mapId !== currentMapId) {
          return;
        }
        addLink(loc, mark, member.color);
      });
    });
  };

  /**
   * 玩家标记的唯一渲染入口。
   * 自己和队友走同一条路径，避免此前「在房间 / 不在房间」两套逻辑各自复制一份旋转计算，
   * 也避免退出房间瞬间自己的标记消失。
   */
  const renderPlayerMarkers = () => {
    const layer = playerLayerRef.current;
    if (!layer) {
      return;
    }
    layer.clearLayers();

    const currentMapId = mapDataRef.current.id;
    const selfId = selfUserIdRef.current;
    const own = selfLocationRef.current;
    const entries: PlayerMarkerEntry[] = [];

    if (own && own.mapId === currentMapId) {
      entries.push({ label: '你的位置', color: getSelfColor(), location: own, isSelf: true });
    }
    (roomMembersRef.current || []).forEach((member) => {
      // 自己的标记始终以本地位置为准（更实时），不使用服务端回传的那一份。
      if (!member.location || member.location.mapId !== currentMapId) {
        return;
      }
      if (selfId && member.userId === selfId) {
        return;
      }
      entries.push({
        label: member.nickname,
        color: member.color,
        location: member.location,
        isSelf: false,
      });
    });

    const flashing = Date.now() < flashUntilRef.current;
    const flashClass = flashing ? ' is-flashing' : '';

    entries.forEach(({ label, color, location, isSelf }) => {
      const rotation = getMarkerRotation(location.quaternion);
      // 昵称是其他玩家填写的不可信内容，拼进 innerHTML 前必须转义。
      const safeLabel = escapeHtml(label);
      L.marker(pos(location), {
        icon: L.divIcon({
          className: `im-leaflet-player${flashClass}`,
          html:
            `<div class="im-leaflet-player-body" style="--player-color:${color}">` +
            '<div class="im-leaflet-player-mark">' +
            '<div class="im-leaflet-player-fx" aria-hidden="true"><i></i><i></i><i></i></div>' +
            '<div class="im-leaflet-player-arrow" ' +
            `style="transform:rotate(${rotation}deg);border-bottom-color:${color}"></div>` +
            '</div>' +
            `<span style="color:${color}">${safeLabel}</span>` +
            '</div>',
          iconSize: [24, 24],
          iconAnchor: [12, 24],
        }),
        zIndexOffset: isSelf ? 1000 : 900,
      }).addTo(layer);
    });
    // 位置变了，靶标连线的起点也要跟着走。
    renderMarkLinks();
  };

  /**
   * 截图定位后给当前地图上每一个人的箭头播一遍高亮，方便快速找到人。
   */
  const startPlayerFlash = () => {
    flashUntilRef.current = Date.now() + FLASH_MS;
    if (flashTimerRef.current) {
      window.clearTimeout(flashTimerRef.current);
    }
    renderPlayerMarkers();
    flashTimerRef.current = window.setTimeout(() => {
      flashTimerRef.current = undefined;
      renderPlayerMarkers();
    }, FLASH_MS);
  };
  startPlayerFlashRef.current = startPlayerFlash;

  /**
   * 坐标标记的唯一渲染入口。
   *
   * 形状是靶子插箭，和玩家箭头刻意不同；外发光颜色与同一个人的箭头一致，
   * 再加一条同色虚线连到该玩家当前位置，避免房间里把别人的靶标认成自己的。
   */
  const renderMarks = () => {
    const layer = markLayerRef.current;
    if (!layer) {
      return;
    }
    layer.clearLayers();

    const currentMapId = mapDataRef.current.id;
    const selfId = selfUserIdRef.current;
    const entries: MarkEntry[] = [];

    const selfColor = getSelfColor();
    (marksRef.current || []).forEach((mark) => {
      if (mark.mapId !== currentMapId) {
        return;
      }
      entries.push({ mark, color: selfColor, isSelf: true });
    });
    (roomMembersRef.current || []).forEach((member) => {
      // 自己的标记只用本地那一份：服务端回传的会比本地慢一个来回。
      if (selfId && member.userId === selfId) {
        return;
      }
      (member.marks || []).forEach((mark) => {
        if (mark.mapId !== currentMapId) {
          return;
        }
        entries.push({ mark, color: member.color, owner: member.nickname, isSelf: false });
      });
    });

    entries.forEach(({ mark, color, owner, isSelf }) => {
      // 昵称是其他玩家填写的不可信内容，拼进 innerHTML / 属性前必须转义。
      const title = escapeHtml(isSelf ? '点击删除标记' : `${owner || ''} 的标记`);
      const marker = L.marker(pos(mark), {
        icon: L.divIcon({
          className: 'im-leaflet-mark',
          html: markIconHtml(color, title),
          iconSize: [MARK_ICON_SIZE, MARK_ICON_SIZE],
          // 锚点取靶心，而不是图标外接矩形的中心（箭杆会把矩形往右上拉开）。
          iconAnchor: MARK_ICON_ANCHOR,
        }),
        // 只有自己的标记可点，避免误删别人的（服务端也只允许删自己的）。
        interactive: isSelf,
        zIndexOffset: 800,
      }).addTo(layer);
      if (isSelf) {
        // leaflet 会为 interactive 的 marker 自行阻止事件冒泡到地图，无需额外处理。
        marker.on('click', () => onMarkRemoveRef.current?.(mark.id));
      }
    });
    renderMarkLinks();
  };

  const heightRange = useMemo(() => {
    if (activeLayer?.extents?.[0]?.height) {
      return activeLayer.extents[0].height;
    }
    return mapData.heightRange || [-1000, 1000];
  }, [activeLayer, mapData]);

  const clearMarkerGroups = (map: L.Map) => {
    markerGroupsRef.current.forEach((group) => map.removeLayer(group));
    markerGroupsRef.current = [];
  };

  const renderMarkers = (map: L.Map) => {
    clearMarkerGroups(map);
    const groups = [
      buildLabels(mapData.labels || [], heightRange, activeLayer),
      buildLooseLoot(map, mapData.lootLoose || [], markerLootLoose, heightRange, activeLayer),
      buildLoot(map, mapData.lootContainers || [], markerLootKeys, heightRange, activeLayer),
      buildWeapons(
        map,
        mapData.stationaryWeapons || [],
        markerStationaryWeapons,
        heightRange,
        activeLayer,
      ),
      buildSpawns(map, mapData, markerSpawns, heightRange, activeLayer),
      buildHazards(map, mapData.hazards || [], markerHazards, heightRange, activeLayer),
      buildExtracts(map, mapData.extracts || [], markerExtracts, heightRange, activeLayer),
      buildLocks(map, mapData.locks || [], markerLocks, heightRange, activeLayer),
      buildTasks(map, tasks, mapData.id, markerTasks, heightRange, activeLayer),
    ];
    groups.forEach((group) => {
      group.addTo(map);
      markerGroupsRef.current.push(group);
    });
  };

  const renderRoute = (map: L.Map) => {
    if (routeGroupRef.current) {
      map.removeLayer(routeGroupRef.current);
      routeGroupRef.current = undefined;
    }
    if (!routePlan?.nodes.length || routePlan.mapId !== mapData.id) {
      return;
    }
    const group = buildRoutePlan(map, routePlan.nodes, heightRange, activeLayer);
    group.addTo(map);
    routeGroupRef.current = group;
    const latlngs = routePlan.nodes.map((node) => pos({ x: node.x, z: node.z }));
    if (latlngs.length === 1) {
      map.setView(latlngs[0], Math.min(map.getMaxZoom(), 4), { animate: false });
    } else {
      map.fitBounds(L.latLngBounds(latlngs), { padding: [48, 48], maxZoom: 4, animate: false });
    }
  };

  const setSvgLayerVisibility = (layerName?: string) => {
    const image = svgOverlayRef.current?.getElement();
    const root = image?.children[0];
    if (!root) {
      return;
    }
    const groups = Array.from(root.children) as HTMLElement[];
    const baseId = mapData.svgLayer;
    groups.forEach((group) => {
      if (!group.id) {
        return;
      }
      const showId = layerName || baseId;
      const keepWithBase = group.dataset.keepWithGroup === baseId;
      const visible = group.id === showId || (keepWithBase && !layerName);
      group.classList.toggle('hidden-layer', !visible);
      group.classList.toggle('base-layer', group.id === baseId || keepWithBase);
      group.classList.toggle('overlay-layer', group.id !== baseId && !keepWithBase);
    });
    image?.classList.toggle('off-level', Boolean(layerName));
  };

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const bounds = getBounds(mapData.bounds);
    const svgBounds = mapData.svgBounds ? getBounds(mapData.svgBounds) : bounds;
    const map = L.map(containerRef.current, {
      crs: getCRS(mapData),
      attributionControl: false,
      zoomControl: false,
      zoomSnap: 0.1,
      scrollWheelZoom: true,
      wheelPxPerZoomLevel: 120,
      minZoom: mapData.minZoom || 1,
      maxZoom: Math.max(7, mapData.maxZoom || 5),
      maxBounds: getScaledBounds(mapData.bounds, 1.5),
      keyboard: false,
    });
    mapRef.current = map;

    const layerOptions = {
      maxZoom: Math.max(7, mapData.maxZoom || 5),
      maxNativeZoom: mapData.maxZoom || 5,
    };

    if (mapData.tilePath && bounds) {
      tileLayerRef.current = L.tileLayer(mapData.tilePath, {
        tileSize: mapData.tileSize || 256,
        bounds,
        ...layerOptions,
      });
      if (!mapData.svgPath) {
        tileLayerRef.current.addTo(map);
      }
    }

    if (mapData.svgPath && svgBounds) {
      const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svgLoadedRef.current = fetch(mapData.svgPath)
        .then((response) => {
          if (!response.ok) {
            throw new Error(String(response.status));
          }
          return response.text();
        })
        .catch(() => {
          const fallback = mapData.svgPath.replace(
            'https://assets.tarkov.dev/maps/svg',
            'https://raw.githubusercontent.com/the-hideout/tarkov-dev-svg-maps/refs/heads/main',
          );
          return fetch(fallback).then((response) => response.text());
        })
        .then((svgText) => {
          svgElement.innerHTML = svgText;
          const inner = svgElement.children[0] as SVGElement | undefined;
          if (inner?.getAttribute('viewBox')) {
            svgElement.setAttribute('viewBox', inner.getAttribute('viewBox') || '');
          }
          const layerGroups = Array.from(svgElement.children[0]?.children || []).filter(
            (child) => child.nodeName === 'g' && (child as HTMLElement).id,
          ) as HTMLElement[];
          layerGroups.forEach((layerGroup) => {
            if (
              layerGroup.id === mapData.svgLayer ||
              layerGroup.dataset.keepWithGroup === mapData.svgLayer
            ) {
              layerGroup.classList.add('base-layer');
            } else {
              layerGroup.classList.add('hidden-layer', 'overlay-layer');
            }
          });
          map.invalidateSize();
        })
        .catch((err) => {
          console.warn('Failed to load SVG map', err);
        });
      svgOverlayRef.current = L.svgOverlay(svgElement, svgBounds, {
        ...layerOptions,
        className: 'base-layer',
        interactive: false,
      });
      svgOverlayRef.current.addTo(map);
    }

    drawPaneRef.current = L.layerGroup().addTo(map);
    // 连线 < 靶标 < 玩家箭头，避免虚线盖住图标。
    markLinkLayerRef.current = L.layerGroup().addTo(map);
    markLayerRef.current = L.layerGroup().addTo(map);
    playerLayerRef.current = L.layerGroup().addTo(map);

    if (bounds) {
      map.fitBounds(bounds, { animate: false, padding: [24, 24] });
    }

    map.on('mousemove', (event: L.LeafletMouseEvent) => {
      onCursorRef.current?.(gameLatLng(event.latlng));
      const drawing = drawingRef.current;
      if (drawing?.layer) {
        drawing.points.push(event.latlng);
        drawing.layer.setLatLngs(drawing.points);
      }
      const ruler = rulerRef.current;
      if (ruler.start && ruler.line) {
        ruler.line.setLatLngs([ruler.start, event.latlng]);
        onRulerRef.current?.([gameLatLng(ruler.start), gameLatLng(event.latlng)]);
      }
    });

    map.on('mousedown', (event: L.LeafletMouseEvent) => {
      const original = event.originalEvent;
      if (original.button === 2) {
        // 右键菜单需要「点在哪」的游戏坐标才能标记。latlng 的 lng/lat 就是游戏的 x/z
        // （见 crs.ts 的 pos()），高度拿不到，所以标记只有平面坐标。
        showContextMenu({
          x: original.clientX,
          y: original.clientY,
          mapId: mapDataRef.current.id,
          position: { x: event.latlng.lng, z: event.latlng.lat },
        });
        return;
      }
      if (original.button !== 0) {
        return;
      }
      const type = strokeTypeRef.current;
      if (type === 'draw' || type === 'eraser') {
        L.DomEvent.stop(event);
        const weight = (type === 'draw' ? strokeWidthRef.current : eraserWidthRef.current) * 2;
        const layer = L.polyline([event.latlng], {
          color: type === 'eraser' ? '#1c1c1c' : strokeColorRef.current,
          weight,
          opacity: type === 'eraser' ? 0.85 : 1,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
        }).addTo(drawPaneRef.current!);
        drawingRef.current = { points: [event.latlng], layer };
      } else if (type === 'ruler') {
        L.DomEvent.stop(event);
        rulerRef.current.line?.remove();
        rulerRef.current.marks?.forEach((mark) => mark.remove());
        const line = L.polyline([event.latlng, event.latlng], {
          color: '#9a8866',
          weight: 2,
          dashArray: '6 4',
          interactive: false,
        }).addTo(map);
        rulerRef.current = { start: event.latlng, line, marks: [] };
        onRulerRef.current?.([gameLatLng(event.latlng), gameLatLng(event.latlng)]);
      }
    });

    map.on('mouseup', () => {
      const drawing = drawingRef.current;
      if (drawing?.layer && drawing.points.length > 1) {
        drawStrokesRef.current.push({
          id: `${Date.now()}`,
          tool: strokeTypeRef.current === 'eraser' ? 'eraser' : 'draw',
          color: strokeColorRef.current,
          weight: strokeWidthRef.current,
          latlngs: drawing.points,
          layer: drawing.layer,
        });
        if (strokeTypeRef.current === 'eraser') {
          const eraserLatLngs = drawing.points;
          drawStrokesRef.current = drawStrokesRef.current.filter((stroke) => {
            if (stroke.layer === drawing.layer) {
              return true;
            }
            const hit = stroke.latlngs.some((point) => {
              return eraserLatLngs.some((erasePoint) => {
                return map.distance(point, erasePoint) < eraserWidthRef.current * 4;
              });
            });
            if (hit) {
              map.removeLayer(stroke.layer);
              return false;
            }
            return true;
          });
          map.removeLayer(drawing.layer);
          drawStrokesRef.current = drawStrokesRef.current.filter((stroke) => {
            return stroke.layer !== drawing.layer;
          });
        }
      } else {
        drawing?.layer?.remove();
      }
      drawingRef.current = undefined;
    });

    map.on('contextmenu', (event) => {
      L.DomEvent.preventDefault(event);
    });

    (window as any).interactUpdateLocation = (filename: string) => {
      const parsed = parseLocationFromFilename(filename);
      if (!parsed || !playerLayerRef.current) {
        return;
      }
      const location: PlayerLocation = {
        ...parsed,
        // 以当前实际渲染的地图为准。此前用的是父组件另一个 state（activeMapId），
        // 切图瞬间两者可能不同步，会把坐标打上上一张图的 mapId。
        mapId: mapDataRef.current.id,
        updatedAt: Date.now(),
      };
      // 交给父组件保存并按节流上报；本地标记由 selfLocation 驱动统一渲染。
      onLocationUpdateRef.current?.(location);
      selfLocationRef.current = location;
      startPlayerFlashRef.current();

      if (locationScaleRef.current) {
        map.setView(pos(parsed), Math.min(map.getMaxZoom(), map.getZoom() + 1), { animate: true });
      } else {
        map.panTo(pos(parsed), { animate: true });
      }
    };

    return () => {
      (window as any).interactUpdateLocation = undefined;
      if (flashTimerRef.current) {
        window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = undefined;
      }
      map.remove();
      mapRef.current = undefined;
      svgOverlayRef.current = undefined;
      tileLayerRef.current = undefined;
      drawStrokesRef.current = [];
    };
  }, [mapData.id, mapData.key]);

  useEffect(() => {
    const currentMapId = mapData.id;
    const selfId = selfUserId;
    const parts: string[] = [];
    (roomMembers || []).forEach((member) => {
      if (selfId && member.userId === selfId) {
        return;
      }
      if (!member.location || member.location.mapId !== currentMapId) {
        return;
      }
      parts.push(`${member.userId}:${member.location.updatedAt}`);
    });
    const sig = parts.sort().join('|');
    const mapChanged = teammateMapIdRef.current !== currentMapId;
    teammateMapIdRef.current = currentMapId;

    if (mapChanged) {
      teammateLocSigRef.current = sig;
      teammateReadyRef.current = true;
      renderPlayerMarkers();
      return;
    }

    const isInitial = !teammateReadyRef.current;
    teammateReadyRef.current = true;
    if (sig !== teammateLocSigRef.current) {
      const prevParts = teammateLocSigRef.current.split('|').filter(Boolean);
      const prevSet = new Set(prevParts);
      const addedOrUpdated = parts.some((part) => !prevSet.has(part));
      teammateLocSigRef.current = sig;
      if (!isInitial && addedOrUpdated) {
        startPlayerFlash();
        return;
      }
    }
    renderPlayerMarkers();
  }, [roomMembers, selfLocation, mapData.id]);

  // roomMembers 既提供队友的标记，也决定自己的颜色，因此两者都要触发重渲染。
  useEffect(() => {
    renderMarks();
  }, [marks, roomMembers, selfUserId, mapData.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    if (strokeType === 'drag') {
      map.dragging.enable();
    } else {
      map.dragging.disable();
    }
    map.getContainer().classList.toggle('is-drawing', strokeType === 'draw' || strokeType === 'eraser');
    map.getContainer().classList.toggle('is-ruler', strokeType === 'ruler');
  }, [strokeType, mapData.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    svgLoadedRef.current.finally(() => {
      setSvgLayerVisibility(activeLayer?.svgLayer);
    });
    if (!mapData.svgPath && mapData.tilePath) {
      tileLayerRef.current?.remove();
      const path = activeLayer?.tilePath || mapData.tilePath;
      const bounds = getBounds(mapData.bounds);
      if (path && bounds) {
        tileLayerRef.current = L.tileLayer(path, {
          tileSize: mapData.tileSize || 256,
          bounds,
          maxZoom: Math.max(7, mapData.maxZoom || 5),
          maxNativeZoom: mapData.maxZoom || 5,
        }).addTo(map);
      }
    }
  }, [activeLayer, mapData.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    renderMarkers(map);
  }, [
    mapData,
    activeLayer,
    heightRange,
    markerExtracts,
    markerLocks,
    markerLootKeys,
    markerLootLoose,
    markerSpawns,
    markerHazards,
    markerStationaryWeapons,
    markerTasks,
    tasks,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    renderRoute(map);
  }, [routePlan, mapData.id, heightRange, activeLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const layers: L.Layer[] = [];
    markerGroupsRef.current.forEach((group) => {
      group.eachLayer((layer) => layers.push(layer));
    });
    routeGroupRef.current?.eachLayer((layer) => layers.push(layer));
    syncLevelVisibility(layers, heightRange, activeLayer);
  }, [heightRange, activeLayer]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.tagName === 'INPUT') {
        return;
      }
      if (!event.ctrlKey && ['w', 'a', 's', 'd'].includes(event.key)) {
        moveKeysRef.current.add(event.key);
      }
    };
    const keyup = (event: KeyboardEvent) => {
      moveKeysRef.current.delete(event.key);
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
    };
  }, []);

  useInterval(() => {
    const map = mapRef.current;
    if (!map || moveKeysRef.current.size === 0) {
      return;
    }
    const step = 40;
    let x = 0;
    let y = 0;
    if (moveKeysRef.current.has('w')) y -= step;
    if (moveKeysRef.current.has('s')) y += step;
    if (moveKeysRef.current.has('a')) x -= step;
    if (moveKeysRef.current.has('d')) x += step;
    map.panBy([x, y], { animate: false });
  }, 1000 / 60);

  return <div className="im-leaflet" ref={containerRef} />;
};

export default Index;
