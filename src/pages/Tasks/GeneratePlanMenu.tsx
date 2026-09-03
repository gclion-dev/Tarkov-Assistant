import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const rootRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        close();
      }
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
    if (isLoading) {
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
      <button type="button" className="tasks-page-current-plan" onClick={handleOpen}>
        {t('tasks.generatePlan')}
      </button>
      {open && (
        <div className="tasks-plan-menu" role="menu" aria-label={t('tasks.generatePlan')}>
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
        </div>
      )}
    </div>
  );
};

export default GeneratePlanMenu;
