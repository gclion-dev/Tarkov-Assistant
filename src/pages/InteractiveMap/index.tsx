import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';

import { useInterval } from 'ahooks';
import classNames from 'classnames';
import numbro from 'numbro';
import { useRecoilState } from 'recoil';
import { message } from 'tilty-ui';
import { UAParser } from 'ua-parser-js';

import { loadInteractiveMaps, loadMapTasks, refreshInteractiveMaps, refreshMapTasks } from '@/data/loadMaps';
import useAuth from '@/features/auth/hooks/useAuth';
import usePreferences from '@/features/preferences/hooks/usePreferences';
import RoomPanel from '@/features/room/components/RoomPanel';
import useRoom from '@/features/room/hooks/useRoom';
import type { PlayerLocation } from '@/features/room/types';
import langState from '@/store/lang';
import {
  FS_HANDLE_KEYS,
  loadHandle,
  queryHandlePermission,
  removeHandle,
  requestHandlePermission,
  saveHandle,
} from '@/utils/fsHandleStore';
import { tarkovGamePathResolve } from '@/utils/tarkov';

import AppNav from '@/components/AppNav';

import useI18N from '../../i18n';
import AdditionFunc from './components/UI/AdditionFunc';
import ContextMenu from './components/UI/ContextMenu';
import Coordinate from './components/UI/Coordinate';
import EFTWatcher from './components/UI/EFTWatcher';
import MapInfo from './components/UI/MapInfo';
import MapSelect from './components/UI/MapSelect';
import QuickSearch from './components/UI/QuickSearch';
import QuickTools from './components/UI/QuickTools';
import RulerPosition from './components/UI/RulerPosition';
import Tooltip from './components/UI/Tooltip';
import Warning from './components/UI/Warning';
import LeafletMap from './leaflet/LeafletMap';
import { getLayer } from './utils';

import './style.less';

/**
 * 日志里的 location 值 → 地图 id。
 * 优先按 tarkov.dev 的 nameId 匹配，对不上时才查这张兜底表。
 */
const RAID_LOCATION_MAP_IDS: Record<string, string> = {
  TarkovStreets: '5714dc692459777137212e12',
  Sandbox: '653e6760052c01c1c805532f',
  Sandbox_high: '65b8d6f5cdde2479cb2a3125',
  bigmap: '56f40101d2720b2a4d8b45d6',
  factory4_day: '55f2d3fd4bdc2d5f408b4567',
  factory4_night: '59fc81d786f774390775787e',
  Interchange: '5714dbc024597771384a510d',
  laboratory: '5b0fc42d86f7744a585f9105',
  Lighthouse: '5704e4dad2720bb55b8b4567',
  RezervBase: '5704e5fad2720bc05b8b4567',
  Shoreline: '5704e554d2720bac5b8b456e',
  Woods: '5704e3c2d2720bac5b8b4567',
};

/** 这几张图没有可硬编码的稳定 id，按 normalizedName 在当前地图列表里找。 */
const RAID_LOCATION_NORMALIZED_NAMES: Record<string, string> = {
  Terminal: 'terminal',
  terminal: 'terminal',
  Labyrinth: 'the-labyrinth',
  TheLabyrinth: 'the-labyrinth',
  Icebreaker: 'icebreaker',
  Ice_breaker: 'icebreaker',
};

const Index = () => {
  const [mapList, setMapList] = useState<InteractiveMap.Data[]>([]);
  const [activeMap, setActiveMap] = useState<InteractiveMap.Data>();

  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [rulerPosition, setRulerPosition] = useState<InteractiveMap.Position2D[]>();
  const [resolution, setResolution] = useState({ width: 0, height: 0 });
  const [simpleUIMode, setSimpleUIMode] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [directoryHandler, setDirectoryHandler] = useState<FileSystemDirectoryHandle>();
  const [tarkovGamePathHandler, setTarkovGamePathHandler] = useState<FileSystemDirectoryHandle>();
  /**
   * 「待授权」的句柄：IndexedDB 里还留着，但浏览器当前只给到 prompt。
   * 这种情况只会在关闭该站点所有标签页后重开时出现（F5 刷新时权限仍然有效）。
   * requestPermission 必须在用户手势里调用，所以只能存下来等用户点一下。
   */
  const [pendingDirectoryHandle, setPendingDirectoryHandle] = useState<FileSystemDirectoryHandle>();
  const [pendingGamePathHandle, setPendingGamePathHandle] = useState<FileSystemDirectoryHandle>();
  /** 目录恢复流程是否已结束。用于避免引导弹窗在恢复成功前先闪一下。 */
  const [handlesRestored, setHandlesRestored] = useState(false);
  const [applicationLogsHandler, setApplicationLogsHandler] = useState<FileSystemFileHandle>();
  const [notificationsLogsHandler, setNotificationsLogsHandler] = useState<FileSystemFileHandle>();
  const applicationPathNameCache = useRef<string>();
  const notificationsPathNameCache = useRef<string>();
  const applicationModifiedGmt = useRef(0);
  const notificationsModifiedGmt = useRef(0);
  const applicationCacheLineNo = useRef(0);
  const notificationsCacheLineNo = useRef(0);

  const [raidInfo, setRaidInfo] = useState<InteractiveMap.RaidLogProps>();

  /**
   * 所有「刷新后应该还在」的界面选择都收在 usePreferences 里：
   * 未登录写 localStorage，登录后同步到账号，见 features/preferences。
   */
  const { prefs, patch } = usePreferences();
  const {
    activeMapId,
    extracts,
    locks,
    lootKeys,
    spawns,
    hazards,
    stationaryWeapons,
    taskKeys,
    lootLooseKeys,
    mapInfoActive,
    locationScale,
    strokeColor,
    strokeWidth,
    eraserWidth,
  } = prefs;

  /**
   * 楼层由「楼层名 + 所属地图 id」还原，不直接存 Layer 对象：
   * Layer 里的 svgPath / extents 来自远端数据，存下来会过期。
   */
  const activeLayer = useMemo(() => {
    if (!activeMap?.layers?.length || !prefs.activeLayerName) {
      return undefined;
    }
    if (prefs.activeLayerMapId !== activeMap.id) {
      return undefined;
    }
    return getLayer(prefs.activeLayerName, activeMap.layers);
  }, [activeMap, prefs.activeLayerName, prefs.activeLayerMapId]);

  // 绘图模式是会话内的临时选择，刷新回到拖拽模式是合理的，不进偏好。
  const [strokeType, setStrokeType] = useState<InteractiveMap.StrokeType>('drag');

  const [quickSearchShow, setQuickSearchShow] = useState(false);
  const [mapTasks, setMapTasks] = useState(loadMapTasks);

  const [lang] = useRecoilState(langState);

  const { user } = useAuth();
  const { room, reportLocation } = useRoom();
  const [selfLocation, setSelfLocation] = useState<PlayerLocation>();

  const directoryFilesCache = useRef<string[]>([]);

  /**
   * 最近一次提示过的地图 id。
   * 用来区分「用户/日志真的切了图」和「从偏好恢复 + 远端地图数据刷新导致的重跑」，
   * 后者不该弹「地图已切换至 X」。
   */
  const lastToastedMapId = useRef<string>();

  const { t } = useI18N(lang);

  /** 切图时必须一并清掉楼层，否则楼层会串到新地图上。 */
  const switchMap = useCallback(
    (mapId?: string) => {
      if (!mapId) {
        return;
      }
      patch({ activeMapId: mapId, activeLayerName: undefined, activeLayerMapId: undefined });
    },
    [patch],
  );

  const handleLocationUpdate = useCallback(
    (location: PlayerLocation) => {
      // 自己的位置始终保存在本地，未登录 / 未进房间时也要能在地图上看到自己。
      setSelfLocation(location);
      if (room && user) {
        reportLocation(location, user.id);
      }
    },
    [room, user, reportLocation],
  );

  const resolveDirectories = async (initial = false) => {
    if (initial) {
      directoryFilesCache.current = [];
    }
    if (directoryHandler) {
      initial && toast.info(`开始监听截图目录: ${directoryHandler.name}`);
      const entries = await (directoryHandler as any).entries();
      const files = [];
      for await (const [key] of entries) {
        files.push(key);
      }
      const diff = diffDirectories(files);
      if (diff.length > 0 && !initial) {
        const filename = diff[diff.length - 1];
        (window as any).interactUpdateLocation(filename);
      }
    }
  };

  const resolveTarkovGamePath = async () => {
    const { resolveGameRootPath, resolveLogPath, resolveLogFile } = tarkovGamePathResolve;
    if (tarkovGamePathHandler) {
      const gameRootPathHandle = await resolveGameRootPath(tarkovGamePathHandler);
      const logPathHandle = await resolveLogPath(gameRootPathHandle || tarkovGamePathHandler);
      if (logPathHandle) {
        const _applicationLogsHandler = await resolveLogFile(logPathHandle, 'application');
        if (_applicationLogsHandler) {
          if (applicationPathNameCache.current !== _applicationLogsHandler.name) {
            applicationPathNameCache.current = _applicationLogsHandler.name;
            setApplicationLogsHandler(_applicationLogsHandler);
            toast.info(`开始监听日志文件: ${_applicationLogsHandler.name}`);
          }
        }
        const _notificationsLogsHandler = await resolveLogFile(logPathHandle, 'notifications');
        if (_notificationsLogsHandler) {
          if (notificationsPathNameCache.current !== _notificationsLogsHandler.name) {
            notificationsPathNameCache.current = _notificationsLogsHandler.name;
            setNotificationsLogsHandler(_notificationsLogsHandler);
            toast.info(`开始监听日志文件: ${_notificationsLogsHandler.name}`);
          }
        }
      }
    } else {
      setApplicationLogsHandler(undefined);
      setNotificationsLogsHandler(undefined);
    }
  };

  const parseProfileInfo = (log: InteractiveMap.ProfileLogProps) => {
    setRaidInfo(undefined);
    toast.info(`载入角色ID: ${log.profileId}, 账户ID: ${log.accountId}`);
  };

  const parseRaidInfo = (log: InteractiveMap.RaidLogProps) => {
    setRaidInfo(log);
    toast.info(`载入战局信息: ${log.shortId}`);
    const matched = mapList.find((map) => map.nameId === log.location);
    if (matched) {
      switchMap(matched.id);
      return;
    }
    const mappedId = RAID_LOCATION_MAP_IDS[log.location];
    if (mappedId) {
      switchMap(mappedId);
      return;
    }
    const normalizedName = RAID_LOCATION_NORMALIZED_NAMES[log.location];
    if (normalizedName) {
      // 找不到就保持当前地图。改造前这里会把 activeMapId 置空，
      // 结果被兜底逻辑带到列表第一张图上，比「不动」更让人困惑。
      switchMap(mapList.find((map) => map.normalizedName === normalizedName)?.id);
    }
  };

  const parseFleaMarketInfo = (logs: any[]) => {
    logs.forEach((log) => {
      const { message: _message } = log || {};
      const { type, items, systemData } = _message || {};
      if (type === 4) {
        const { itemCount, soldItem, buyerNickname } = systemData || {};
        const { data: _data } = items || {};
        if (soldItem) {
          const emit = (window as any).emitWithAck;
          if (typeof emit !== 'function') {
            return;
          }
          emit('/tarkov/v2/iMGetItemDetail', { id: soldItem, lang }).then(({ data }: any) => {
            const receivedItems: string[] = [];
            _data.forEach((d: any) => {
              const { _tpl, upd } = d || {};
              let unit = '卢布';
              if (_tpl === '5449016a4bdc2d6f028b456f') unit = '卢布';
              if (_tpl === '5696686a4bdc2da3298b456a') unit = '美元';
              if (_tpl === '569668774bdc2da2298b4568') unit = '欧元';
              receivedItems.push(
                `${numbro(upd?.StackObjectsCount || 0).format({
                  thousandSeparated: true,
                })}${unit}`,
              );
            });
            toast.success(
              `${buyerNickname}花费${receivedItems.join('和')}购买了你${itemCount}个${data.name}`,
              { autoClose: 15000 },
            );
          });
        }
      }
    });
  };

  const resolveApplicationLogs = async (initial = false) => {
    const { getLogFileMeta, parseLogFile, parseLine, parseProfileLine, parseRaidLine } =
      tarkovGamePathResolve;
    if (initial) {
      applicationModifiedGmt.current = 0;
      applicationCacheLineNo.current = 0;
    }
    if (applicationLogsHandler) {
      const metadata = await getLogFileMeta(applicationLogsHandler);
      if (metadata.lastModified > applicationModifiedGmt.current) {
        applicationModifiedGmt.current = metadata.lastModified;
        const logFile = await parseLogFile(applicationLogsHandler);
        const logs = parseLine(logFile);
        const newLogs = logs.splice(applicationCacheLineNo.current);
        applicationCacheLineNo.current += newLogs.length;
        const profileLogs = newLogs
          .map((log) => parseProfileLine(log))
          .filter((v) => v) as InteractiveMap.ProfileLogProps[];
        const raidLogs = newLogs
          .map((log) => parseRaidLine(log))
          .filter((v) => v) as InteractiveMap.RaidLogProps[];
        if (profileLogs.length > 0 && !initial) {
          console.log('Received new profile logs:', profileLogs);
          parseProfileInfo(profileLogs[profileLogs.length - 1]);
        }
        if (raidLogs.length > 0 && !initial) {
          console.log('Received new raid logs:', raidLogs);
          parseRaidInfo(raidLogs[raidLogs.length - 1]);
        }
      }
    }
  };

  const resolveNotificationsLogs = async (initial = false) => {
    const { getLogFileMeta, parseLogFile, parseLine, parseMessageLine } = tarkovGamePathResolve;
    if (initial) {
      notificationsModifiedGmt.current = 0;
      notificationsCacheLineNo.current = 0;
    }
    if (notificationsLogsHandler) {
      const metadata = await getLogFileMeta(notificationsLogsHandler);
      if (metadata.lastModified > notificationsModifiedGmt.current) {
        notificationsModifiedGmt.current = metadata.lastModified;
        const logFile = await parseLogFile(notificationsLogsHandler);
        const logs = parseLine(logFile);
        const newLogs = logs.splice(notificationsCacheLineNo.current);
        notificationsCacheLineNo.current += newLogs.length;
        const messageLogs = newLogs.map((log) => parseMessageLine(log)).filter((v) => v);
        if (messageLogs.length > 0 && !initial) {
          console.log('Received new message logs:', messageLogs);
          parseFleaMarketInfo(messageLogs);
        }
      }
    }
  };

  const diffDirectories = (files: string[]) => {
    const diff = files.filter((file) => !directoryFilesCache.current?.includes(file));
    directoryFilesCache.current = files;
    return diff;
  };

  const handleCursorPositionChange = (_cursorPosition: InteractiveMap.Position2D) => {
    setCursorPosition(_cursorPosition);
  };

  const handleRulerPositionChange = (_rulerPosition: InteractiveMap.Position2D[] | undefined) => {
    setRulerPosition(_rulerPosition);
  };

  const handleExtractsChange = (_extracts: InteractiveMap.Faction[]) => {
    patch({ extracts: _extracts });
  };

  const handleLocksChange = (_locks: string[]) => {
    patch({ locks: _locks });
  };

  const handleLootKeysChange = (_lootKeys: string[]) => {
    patch({ lootKeys: _lootKeys });
  };

  const handleSpawnsChange = (_spawns: string[]) => {
    patch({ spawns: _spawns });
  };

  const handleHazardsChange = (_hazards: string[]) => {
    patch({ hazards: _hazards });
  };

  const handleStationaryWeaponsChange = (_stationaryWeapons: string[]) => {
    patch({ stationaryWeapons: _stationaryWeapons });
  };

  const handleTasksChange = (_tasks: string[]) => {
    patch({ taskKeys: _tasks });
  };

  const handleLootLooseKeysChange = (_lootLooseKeys: string[]) => {
    patch({ lootLooseKeys: _lootLooseKeys });
  };

  const handleMapInfoActive = (_mapInfoActive: boolean) => {
    patch({ mapInfoActive: _mapInfoActive });
  };

  /** 用户在选择目录的弹窗里按了取消。此时绝不能清掉已经生效的句柄。 */
  const isAbort = (err: unknown) => (err as DOMException)?.name === 'AbortError';

  const handleClickEftWatcherPath = async () => {
    if (!window.showDirectoryPicker) {
      message.show({ content: t('eftwatcher.unsupportMsg') });
      return;
    }

    // 有待授权的句柄时先原地要权限，用户不需要再翻一遍文件系统。
    if (pendingDirectoryHandle) {
      const permission = await requestHandlePermission(pendingDirectoryHandle);
      if (permission === 'granted') {
        setDirectoryHandler(pendingDirectoryHandle);
        setPendingDirectoryHandle(undefined);
        return;
      }
      if (permission === 'denied') {
        setPendingDirectoryHandle(undefined);
        await removeHandle(FS_HANDLE_KEYS.screenshotDir);
        message.show({ content: '未获得目录访问权限，请重新选择截图目录' });
        return;
      }
      // 其余情况（用户忽略了弹窗等）继续走下面的重新选择流程。
    }

    try {
      const handler = await window.showDirectoryPicker();
      if (handler) {
        setDirectoryHandler(handler);
        setPendingDirectoryHandle(undefined);
        await saveHandle(FS_HANDLE_KEYS.screenshotDir, handler);
      }
    } catch (err) {
      if (isAbort(err)) {
        return;
      }
      setDirectoryHandler(undefined);
      await removeHandle(FS_HANDLE_KEYS.screenshotDir);
    }
  };

  const handleClickTarkovGamePath = async () => {
    if (!window.showDirectoryPicker) {
      message.show({ content: t('eftwatcher.unsupportMsg') });
      return;
    }

    if (pendingGamePathHandle) {
      const permission = await requestHandlePermission(pendingGamePathHandle);
      if (permission === 'granted') {
        setTarkovGamePathHandler(pendingGamePathHandle);
        setPendingGamePathHandle(undefined);
        return;
      }
      if (permission === 'denied') {
        setPendingGamePathHandle(undefined);
        await removeHandle(FS_HANDLE_KEYS.gameDir);
        message.show({ content: '未获得目录访问权限，请重新选择游戏目录' });
        return;
      }
    }

    try {
      const handler = await window.showDirectoryPicker();
      if (handler) {
        const result = await tarkovGamePathResolve.checkPath(handler);
        if (result) {
          setTarkovGamePathHandler(handler);
          setPendingGamePathHandle(undefined);
          await saveHandle(FS_HANDLE_KEYS.gameDir, handler);
        } else {
          // 选错了目录不影响之前已经生效的那个，只提示重新选。
          message.show({ content: '所选文件夹不是塔科夫游戏目录，请重新选择！' });
        }
      }
    } catch (err) {
      if (isAbort(err)) {
        return;
      }
      setTarkovGamePathHandler(undefined);
      await removeHandle(FS_HANDLE_KEYS.gameDir);
    }
  };

  const handleLocationScaleChange = (_b: boolean) => {
    patch({ locationScale: _b });
  };

  const handleStrokeTypeChange = (_strokeType: InteractiveMap.StrokeType) => {
    setStrokeType(_strokeType);
  };

  const handleStrokeColorChange = (_color: string) => {
    patch({ strokeColor: _color });
  };

  const handleStrokeWidthChange = (_width: number) => {
    patch({ strokeWidth: _width });
  };

  const handleEraserWidthChange = (_width: number) => {
    patch({ eraserWidth: _width });
  };

  const handleMapChange = (mapId: string) => {
    switchMap(mapId);
    toast.info('正在切换地图，请稍候...');
  };

  const handleLayerChange = (name: string) => {
    if (!name) {
      patch({ activeLayerName: undefined, activeLayerMapId: undefined });
      return;
    }
    if (activeMap?.layers) {
      patch({ activeLayerName: name, activeLayerMapId: activeMap.id });
    }
  };

  useEffect(() => {
    if (activeMapId) {
      const data = mapList.find((item) => item.id === activeMapId);
      if (data) {
        setActiveMap(data);
        // 首次从偏好恢复、以及远端地图数据刷新导致的重跑都不该提示切换。
        if (lastToastedMapId.current && lastToastedMapId.current !== data.id) {
          toast.success(`地图已切换至${data.name}`);
        }
        lastToastedMapId.current = data.id;
      }
    }
  }, [activeMapId, mapList]);

  useEffect(() => {
    if (!mapList.length) {
      return;
    }
    // 只判断「有没有值」不够：偏好里存的 id 可能已经不在当前地图列表里
    // （地图下线、远端数据更新、跨版本），那样会卡在地图空白的死状态。
    const exists = !!activeMapId && mapList.some((map) => map.id === activeMapId);
    if (!exists) {
      switchMap(mapList[0].id);
    }
  }, [mapList, activeMapId, switchMap]);

  useEffect(() => {
    setMapList(loadInteractiveMaps());
    setMapTasks(loadMapTasks());
    refreshInteractiveMaps().then((maps) => {
      if (maps) {
        setMapList(maps);
      }
    });
    refreshMapTasks().then((data) => {
      if (data) {
        setMapTasks(data);
      }
    });
  }, []);

  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'q') {
        e.preventDefault();
        setQuickSearchShow(true);
      } else if (e.ctrlKey && e.key === 'g') {
        e.preventDefault();
        setSimpleUIMode(!simpleUIMode);
      }
    };
    const resize = () => {
      const width = window.innerWidth || document.documentElement.clientWidth;
      const height = window.innerHeight || document.documentElement.clientHeight;
      setResolution({ width, height });
      const userAgent = new UAParser();
      const _isMobile = ['mobile', 'tablet'].includes(userAgent.getDevice().type || '');
      setIsMobile(_isMobile);
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (self === top) {
        e.preventDefault();
        return false;
      }
    };
    resize();
    window.addEventListener('keydown', keydown);
    window.addEventListener('resize', resize);
    window.addEventListener('beforeunload', unload);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('resize', resize);
      window.removeEventListener('beforeunload', unload);
    };
  }, [simpleUIMode]);

  /**
   * 从 IndexedDB 恢复上次绑定的目录。
   *
   * F5 刷新时浏览器的授权仍然有效（授权在该 origin 还有标签页存在期间保持），
   * 所以这里通常直接拿到 granted，用户无需任何操作就恢复监听。
   * 关掉所有标签后重开会是 prompt，只能标记成待授权等用户点一下。
   */
  useEffect(() => {
    if (!window.showDirectoryPicker) {
      // 浏览器不支持时没有可恢复的东西，直接放行引导弹窗。
      setHandlesRestored(true);
      return;
    }
    let cancelled = false;

    const restore = async (
      key: (typeof FS_HANDLE_KEYS)[keyof typeof FS_HANDLE_KEYS],
      onGranted: (handle: FileSystemDirectoryHandle) => void,
      onPending: (handle: FileSystemDirectoryHandle) => void,
    ) => {
      const handle = await loadHandle(key);
      if (!handle || cancelled) {
        return;
      }
      const permission = await queryHandlePermission(handle);
      if (cancelled) {
        return;
      }
      if (permission === 'granted') {
        onGranted(handle);
      } else if (permission === 'prompt') {
        onPending(handle);
      } else {
        // denied / unsupported：句柄已经没用了，清掉以免一直提示恢复。
        await removeHandle(key);
      }
    };

    Promise.all([
      restore(FS_HANDLE_KEYS.screenshotDir, setDirectoryHandler, setPendingDirectoryHandle),
      restore(FS_HANDLE_KEYS.gameDir, setTarkovGamePathHandler, setPendingGamePathHandle),
    ]).finally(() => {
      if (!cancelled) {
        setHandlesRestored(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    resolveDirectories(true);
  }, [directoryHandler]);

  useEffect(() => {
    if (tarkovGamePathHandler) {
      console.log(`File Watcher: ${tarkovGamePathHandler.name}`);
      resolveTarkovGamePath();
    }
  }, [tarkovGamePathHandler]);

  useEffect(() => {
    if (applicationLogsHandler) {
      console.log(`File Watcher: ${applicationLogsHandler.name}`);
      resolveApplicationLogs(true);
    }
  }, [applicationLogsHandler]);

  useEffect(() => {
    if (notificationsLogsHandler) {
      console.log(`File Watcher: ${notificationsLogsHandler.name}`);
      resolveNotificationsLogs(true);
    }
  }, [notificationsLogsHandler]);

  useEffect(() => {
    toast.info(t('toast.alert'), { autoClose: 10000 });
  }, []);

  useInterval(() => {
    if (directoryHandler) {
      resolveDirectories();
    }
    if (applicationLogsHandler) {
      resolveApplicationLogs();
    }
    if (notificationsLogsHandler) {
      resolveNotificationsLogs();
    }
  }, 1000);

  useInterval(() => {
    if (tarkovGamePathHandler) {
      resolveTarkovGamePath();
    }
  }, 10000);

  if (activeMap) {
    return (
      <div
        className={classNames({
          desktop: !isMobile,
          mobile: isMobile,
          'simple-ui-mode': simpleUIMode,
        })}
      >
        <div onContextMenu={(e) => e.preventDefault()}>
          <LeafletMap
            mapData={activeMap}
            activeLayer={activeLayer}
            selfUserId={user?.id}
            selfLocation={selfLocation}
            roomMembers={room?.members}
            onLocationUpdate={handleLocationUpdate}
            markerExtracts={extracts || []}
            markerLocks={locks || []}
            markerLootKeys={lootKeys || []}
            markerLootLoose={lootLooseKeys || []}
            markerSpawns={spawns || []}
            markerHazards={hazards || []}
            markerStationaryWeapons={stationaryWeapons || []}
            markerTasks={taskKeys || []}
            tasks={mapTasks}
            locationScale={locationScale}
            strokeType={strokeType}
            strokeColor={strokeColor || '#9a8866'}
            strokeWidth={strokeWidth || 1}
            eraserWidth={eraserWidth || 5}
            onCursorPositionChange={handleCursorPositionChange}
            onRulerPositionChange={handleRulerPositionChange}
          />
          <div className="im-header">
            <div className="im-header-left">
              <div className="im-header-left-1">
                <AppNav />
                {resolution.width > 750 && (
                  <MapSelect
                    mapList={mapList}
                    activeMap={activeMap}
                    activeLayer={activeLayer?.name}
                    onMapChange={handleMapChange}
                    onLayerChange={handleLayerChange}
                  />
                )}
              </div>
              {(isMobile || resolution.width >= 420) && (
                <div className="im-header-left-2">
                  <MapInfo
                    mapData={activeMap}
                    raidInfo={raidInfo}
                    directoryHandler={directoryHandler}
                    tarkovGamePathHandler={tarkovGamePathHandler}
                    directoryPending={!!pendingDirectoryHandle}
                    tarkovGamePathPending={!!pendingGamePathHandle}
                    onClickEftWatcherPath={handleClickEftWatcherPath}
                    onClickTarkovGamePath={handleClickTarkovGamePath}
                    show={mapInfoActive}
                  />
                </div>
              )}
            </div>
            <div className="im-header-right">
              <div className="im-header-right-1">
                <QuickTools
                  activeMapId={activeMapId}
                  extracts={extracts}
                  locks={locks}
                  lootKeys={lootKeys || []}
                  lootLooseKeys={lootLooseKeys || []}
                  spawns={spawns}
                  hazards={hazards}
                  stationaryWeapons={stationaryWeapons}
                  tasks={taskKeys || []}
                  mapInfoActive={mapInfoActive}
                  lootContainers={activeMap.lootContainers}
                  lootLoose={activeMap.lootLoose}
                  strokeColor={strokeColor}
                  strokeWidth={strokeWidth}
                  eraserWidth={eraserWidth}
                  directoryHandler={directoryHandler}
                  tarkovGamePathHandler={tarkovGamePathHandler}
                  directoryPending={!!pendingDirectoryHandle}
                  tarkovGamePathPending={!!pendingGamePathHandle}
                  locationScale={locationScale}
                  resolution={resolution}
                  isMobile={isMobile}
                  setQuickSearchShow={setQuickSearchShow}
                  onStrokeTypeChange={handleStrokeTypeChange}
                  onExtractsChange={handleExtractsChange}
                  onLocksChange={handleLocksChange}
                  onLootKeysChange={handleLootKeysChange}
                  onLootLooseKeysChange={handleLootLooseKeysChange}
                  onSpawnsChange={handleSpawnsChange}
                  onHazardsChange={handleHazardsChange}
                  onStationaryWeaponsChange={handleStationaryWeaponsChange}
                  onTasksChange={handleTasksChange}
                  onStrokeColorChange={handleStrokeColorChange}
                  onStrokeWidthChange={handleStrokeWidthChange}
                  onEraserWidthChange={handleEraserWidthChange}
                  onClickEftWatcherPath={handleClickEftWatcherPath}
                  onClickTarkovGamePathPath={handleClickTarkovGamePath}
                  onLocationScaleChange={handleLocationScaleChange}
                  onMapInfoActive={handleMapInfoActive}
                />
                {resolution.width > 1280 && <Coordinate position={cursorPosition} />}
              </div>
              <div className="im-header-right-2">
                <AdditionFunc />
              </div>
            </div>
          </div>
          <div className="im-footer">
            <div className="im-footer-left">
              <RoomPanel />
              {resolution.width <= 750 && (
                <MapSelect
                  mapList={mapList}
                  activeMap={activeMap}
                  activeLayer={activeLayer?.name}
                  onMapChange={handleMapChange}
                  onLayerChange={handleLayerChange}
                />
              )}
            </div>
            <div className="im-footer-right">
              <RulerPosition rulerPosition={rulerPosition} />
              {resolution.width <= 1280 && <Coordinate position={cursorPosition} />}
            </div>
          </div>
        </div>
        <Tooltip {...resolution} />
        <ContextMenu />
        <QuickSearch show={quickSearchShow} onHide={() => setQuickSearchShow(false)} />
        <EFTWatcher
          directoryHandler={directoryHandler}
          tarkovGamePathHandler={tarkovGamePathHandler}
          directoryPending={!!pendingDirectoryHandle}
          tarkovGamePathPending={!!pendingGamePathHandle}
          ready={handlesRestored}
          onClickEftWatcherPath={handleClickEftWatcherPath}
          onClickTarkovGamePath={handleClickTarkovGamePath}
        />
        <Warning />
      </div>
    );
  } else {
    return (
      <div className="im-loading">
        <img src="/images/tilty_logo_round_white.png" />
        <span>{t('interactive.mapLoading')}</span>
      </div>
    );
  }
};

export default Index;
