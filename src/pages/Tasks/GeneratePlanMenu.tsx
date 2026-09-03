import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

import { CatalogTask } from '@/data/taskCatalog';
import type { MapTask } from '@/data/transformTasks';
import useAuth from '@/features/auth/hooks/useAuth';
import { ApiError, getErrorMessage } from '@/features/auth/services/http';
import { collectRouteLocations } from '@/features/tasks/services/collectRouteLocations';
import { generateTaskRoutePlan } from '@/features/tasks/services/routePlanApi';
import { saveRoutePlan } from '@/features/tasks/services/routePlanStore';
import useI18N from '@/i18n';

import './generatePlanMenu.less';

interface MapGroup {
  mapId: string;
  mapName: string;
  count: number;
  taskIds: string[];
}

interface GeneratePlanMenuProps {
  lang: string;
  currentTasks: CatalogTask[];
  mapTasks: MapTask[];
}

const GeneratePlanMenu = ({ lang, currentTasks, mapTasks }: GeneratePlanMenuProps) => {
  const { t } = useI18N(lang);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 240, maxHeight: 360 });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const groups = useMemo<MapGroup[]>(() => {
    const byMap = new Map<string, MapGroup>();
    currentTasks.forEach((task) => {
      task.mapIds.forEach((mapId, index) => {
        const mapName = task.mapNames[index] || mapId;
        const existing = byMap.get(mapId);
        if (existing) {
          existing.count += 1;
          existing.taskIds.push(task.id);
          return;
        }
        byMap.set(mapId, { mapId, mapName, count: 1, taskIds: [task.id] });
      });
    });
    return Array.from(byMap.values()).sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.mapName.localeCompare(b.mapName, 'zh');
    });
  }, [currentTasks]);

  const close = useCallback(() => {
    if (!loading) {
      setOpen(false);
      setError('');
    }
  }, [loading]);

  const updateMenuPos = useCallback(() => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }
    const rect = button.getBoundingClientRect();
    // 用 clientWidth/clientHeight 而不是 innerWidth/innerHeight：后者含滚动条宽度，贴右边时菜单会压在滚动条上。
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const width = Math.min(240, viewportWidth - 16);
    const left = Math.min(Math.max(8, rect.right - width), viewportWidth - width - 8);
    const top = rect.bottom + 6;
    const maxHeight = Math.max(120, viewportHeight - top - 8);
    // 滚动时每个事件都会调用，位置没变就不要触发重渲染。
    setMenuPos((prev) => {
      const same =
        prev.top === top &&
        prev.left === left &&
        prev.width === width &&
        prev.maxHeight === maxHeight;
      return same ? prev : { top, left, width, maxHeight };
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      return undefined;
    }
    updateMenuPos();
    window.addEventListener('resize', updateMenuPos);
    window.addEventListener('scroll', updateMenuPos, true);
    return () => {
      window.removeEventListener('resize', updateMenuPos);
      window.removeEventListener('scroll', updateMenuPos, true);
    };
  }, [open, updateMenuPos]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const handleOpen = () => {
    // 生成中不允许收起菜单，否则 loading / error 提示会被藏起来。
    if (isLoading || loading) {
      return;
    }
    if (!isAuthenticated) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    if (currentTasks.length === 0) {
      toast.info(t('tasks.planNeedTasks'));
      return;
    }
    if (groups.length === 0) {
      toast.info(t('tasks.planNoMap'));
      return;
    }
    setError('');
    setOpen((prev) => !prev);
  };

  const handleSelect = async (group: MapGroup) => {
    if (loading) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      const locations = collectRouteLocations(
        currentTasks.filter((task) => group.taskIds.includes(task.id)),
        mapTasks,
        group.mapId,
      );
      const result = await generateTaskRoutePlan({
        mapName: group.mapName,
        taskIds: group.taskIds,
        locations,
      });
      const planId = saveRoutePlan({
        mapId: group.mapId,
        mapName: group.mapName,
        summary: result.summary,
        bring: result.bring,
        weapons: result.weapons,
        notes: result.notes,
        nodes: result.nodes,
        quota: result.quota,
      });
      const opened = window.open(`/interactive?plan=${planId}`, '_blank');
      if (!opened) {
        toast.info(t('tasks.planPopupBlocked'));
      }
      setOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate('/login', { state: { from: location.pathname } });
        return;
      }
      setError(getErrorMessage(err, t('tasks.planFailed')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tasks-plan" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="tasks-page-current-plan"
        onClick={handleOpen}
      >
        {t('tasks.generatePlan')}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="tasks-plan-menu"
            role="menu"
            aria-label={t('tasks.generatePlan')}
            style={{
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              maxHeight: menuPos.maxHeight,
            }}
          >
            <div className="tasks-plan-menu-title">{t('tasks.planPickMap')}</div>
            {groups.map((group) => (
              <button
                key={group.mapId}
                type="button"
                className="tasks-plan-menu-item"
                disabled={loading}
                onClick={() => {
                  handleSelect(group).catch(() => undefined);
                }}
              >
                <span>{group.mapName}</span>
                <span className="tasks-plan-menu-count">
                  {t('tasks.planMapCount').replace('{n}', String(group.count))}
                </span>
              </button>
            ))}
            {loading && <p className="tasks-plan-menu-status">{t('tasks.planLoading')}</p>}
            {error && <p className="tasks-plan-menu-error">{error}</p>}
          </div>,
          document.body,
        )}
    </div>
  );
};

export default GeneratePlanMenu;
