import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import classNames from 'classnames';
import { useRecoilState } from 'recoil';

import { loadMapTasks, refreshMapTasks } from '@/data/loadMaps';
import { CatalogTask, loadTaskCatalog, refreshTaskCatalog } from '@/data/taskCatalog';
import usePreferences from '@/features/preferences/hooks/usePreferences';
import { MAX_CURRENT_TASKS } from '@/features/preferences/types';
import useI18N from '@/i18n';
import langState from '@/store/lang';

import AppNav from '@/components/AppNav';

import GeneratePlanMenu from './GeneratePlanMenu';
import ImageSearchModal from './ImageSearchModal';

import './style.less';

const FACTION_LABEL: Record<string, string> = {
  Any: '不限',
  USEC: 'USEC',
  BEAR: 'BEAR',
};

const OBJECTIVE_TYPE: Record<string, string> = {
  visit: '前往',
  shoot: '击杀',
  findItem: '找到物品',
  giveItem: '上交物品',
  findQuestItem: '找到任务物品',
  giveQuestItem: '上交任务物品',
  plantItem: '放置物品',
  mark: '放置标记',
  extract: '撤离',
  buildWeapon: '改装武器',
  skill: '技能',
  traderLevel: '商人等级',
  experience: '经验',
  sellItem: '出售物品',
  useItem: '使用物品',
};

const Index = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [lang] = useRecoilState(langState);
  const { t } = useI18N(lang);
  /**
   * 「当前任务」要跨刷新、跨设备存活，所以走 usePreferences 而不是组件内 state，
   * 与地图页的图层选择用的是同一套本地存储 + 云端同步（features/preferences）。
   */
  const {
    prefs: { currentTaskIds },
    patch,
  } = usePreferences();

  const [tasks, setTasks] = useState<CatalogTask[]>(loadTaskCatalog);
  const [mapTasks, setMapTasks] = useState(loadMapTasks);
  const [keyword, setKeyword] = useState('');
  const [trader, setTrader] = useState('all');
  const [mapName, setMapName] = useState('all');
  const [kappaOnly, setKappaOnly] = useState(false);
  /** 窄屏下「当前任务」是抽屉，需要一个开合状态；宽屏常驻，这个值不参与布局。 */
  const [currentOpen, setCurrentOpen] = useState(false);
  const [imageSearchOpen, setImageSearchOpen] = useState(false);

  useEffect(() => {
    refreshTaskCatalog().then((next) => {
      if (next?.length) {
        setTasks(next);
      }
    });
    refreshMapTasks().then((next) => {
      if (next?.length) {
        setMapTasks(next);
      }
    });
  }, []);

  const traders = useMemo(() => {
    const names = Array.from(new Set(tasks.map((task) => task.traderName).filter(Boolean)));
    return names.sort((a, b) => a.localeCompare(b, 'zh'));
  }, [tasks]);

  const maps = useMemo(() => {
    const names = Array.from(new Set(tasks.flatMap((task) => task.mapNames)));
    return names.sort((a, b) => a.localeCompare(b, 'zh'));
  }, [tasks]);

  const filtered = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return tasks.filter((task) => {
      if (trader !== 'all' && task.traderName !== trader) {
        return false;
      }
      if (mapName !== 'all' && !task.mapNames.includes(mapName)) {
        return false;
      }
      if (kappaOnly && !task.kappaRequired) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = [
        task.name,
        task.normalizedName,
        task.traderName,
        ...task.mapNames,
        ...task.objectives.map((item) => item.description),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [tasks, keyword, trader, mapName, kappaOnly]);

  const selected = useMemo(() => {
    return filtered.find((task) => task.id === taskId) || tasks.find((task) => task.id === taskId);
  }, [filtered, tasks, taskId]);

  const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
    setKeyword(e.target.value);
  };

  const handleSelect = (id: string) => {
    // 窄屏下详情会盖掉列表，抽屉留着只会挡住详情。
    setCurrentOpen(false);
    navigate(`/tasks/${id}`);
  };

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  /**
   * 存的是 id，任务表随远端更新会增删，所以渲染前必须过一遍存在性校验。
   * 这里只过滤展示，不回写偏好：远端数据临时缺失时回写等于把用户的选择永久删掉。
   */
  const currentTasks = useMemo(() => {
    return currentTaskIds
      .map((id) => taskById.get(id))
      .filter((task): task is CatalogTask => Boolean(task));
  }, [currentTaskIds, taskById]);

  const currentTaskIdSet = useMemo(() => new Set(currentTaskIds), [currentTaskIds]);
  const currentLimitReached = currentTaskIds.length >= MAX_CURRENT_TASKS;

  /** 「+」按钮的无障碍名称。按钮里只有一个符号，不给名称的话读屏念出来是「加」。 */
  const addButtonLabel = (added: boolean) => {
    if (added) {
      return t('tasks.removeFromCurrent');
    }
    if (currentLimitReached) {
      return t('tasks.currentLimit').replace('{n}', String(MAX_CURRENT_TASKS));
    }
    return t('tasks.addToCurrent');
  };

  const handleToggleCurrent = useCallback(
    (id: string) => {
      if (currentTaskIdSet.has(id)) {
        patch({ currentTaskIds: currentTaskIds.filter((item) => item !== id) });
        return;
      }
      if (currentTaskIds.length >= MAX_CURRENT_TASKS) {
        return;
      }
      patch({ currentTaskIds: [...currentTaskIds, id] });
    },
    [currentTaskIds, currentTaskIdSet, patch],
  );

  const handleClearCurrent = useCallback(() => {
    patch({ currentTaskIds: [] });
  }, [patch]);

  /**
   * 按图识别后批量加入当前任务，逻辑与逐个点「+」一致，并遵守 50 条上限。
   *
   * 三个计数分开返回：弹窗要能区分「新加了几个」「本来就有几个」「因为满了没加进去几个」，
   * 合成一个 skipped 会让提示文案说不清到底发生了什么。
   */
  const handleAddTasksBatch = useCallback(
    (ids: string[]) => {
      const existing = new Set(currentTaskIds);
      // 目录里查不到的 id 说明前后端任务数据版本不一致，直接忽略，不计入任何计数。
      const known = ids.filter((id) => taskById.has(id));
      const already = known.filter((id) => existing.has(id)).length;
      const toAdd = known.filter((id) => !existing.has(id));
      const slots = Math.max(0, MAX_CURRENT_TASKS - currentTaskIds.length);
      const accepted = toAdd.slice(0, slots);
      if (accepted.length > 0) {
        patch({ currentTaskIds: [...currentTaskIds, ...accepted] });
      }
      return {
        added: accepted.length,
        already,
        overLimit: toAdd.length - accepted.length,
      };
    },
    [currentTaskIds, patch, taskById],
  );

  // Esc 依次关掉最上层的浮层。弹窗和抽屉都是自己实现的，键盘关闭得手动接。
  useEffect(() => {
    if (!imageSearchOpen && !currentOpen) {
      return undefined;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') {
        return;
      }
      if (imageSearchOpen) {
        setImageSearchOpen(false);
        return;
      }
      setCurrentOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [imageSearchOpen, currentOpen]);

  return (
    <div className="tasks-page">
      <div className="tasks-page-header">
        <AppNav />
        <div className="tasks-page-filters">
          <button
            type="button"
            className="tasks-page-image-search"
            onClick={() => setImageSearchOpen(true)}
          >
            {t('tasks.imageSearch')}
          </button>
          <input
            className="tasks-page-search"
            value={keyword}
            onChange={handleSearch}
            placeholder={t('tasks.searchPlaceholder')}
          />
          <select
            className="tasks-page-select"
            value={trader}
            onChange={(e) => setTrader(e.target.value)}
          >
            <option value="all">{t('tasks.allTraders')}</option>
            {traders.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select
            className="tasks-page-select"
            value={mapName}
            onChange={(e) => setMapName(e.target.value)}
          >
            <option value="all">{t('tasks.allMaps')}</option>
            {maps.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <label className={classNames('tasks-page-kappa', { active: kappaOnly })}>
            <input
              type="checkbox"
              checked={kappaOnly}
              onChange={(e) => setKappaOnly(e.target.checked)}
            />
            {t('tasks.kappaOnly')}
          </label>
        </div>
      </div>
      <div className={classNames('tasks-page-body', { 'has-detail': Boolean(selected) })}>
        <div className="tasks-page-list">
          <div className="tasks-page-count">
            {t('tasks.resultCount').replace('{n}', String(filtered.length))}
          </div>
          {filtered.map((task) => {
            const added = currentTaskIdSet.has(task.id);
            return (
              <div
                key={task.id}
                className={classNames('tasks-page-item', { active: task.id === selected?.id })}
              >
                <button
                  type="button"
                  className="tasks-page-item-body"
                  onClick={() => handleSelect(task.id)}
                >
                  <img src={task.image} alt="" />
                  <div className="tasks-page-item-main">
                    <div className="tasks-page-item-name">{task.name}</div>
                    <div className="tasks-page-item-meta">
                      <span>{task.traderName}</span>
                      <span>
                        {t('tasks.level')} {task.minPlayerLevel}
                      </span>
                      {task.mapNames.length > 0 && <span>{task.mapNames.join(' / ')}</span>}
                    </div>
                  </div>
                  {task.kappaRequired && <span className="tasks-page-badge">Kappa</span>}
                </button>
                {/*
                 * 做成 toggle 而不是「已添加就 disabled」：disabled 的按钮在 Chrome 上不派发
                 * 鼠标事件，挂在它上面的提示用户根本看不到，等于留了个死控件。
                 */}
                <button
                  type="button"
                  className={classNames('tasks-page-item-add', { added })}
                  aria-label={addButtonLabel(added)}
                  aria-pressed={added}
                  disabled={!added && currentLimitReached}
                  onClick={() => handleToggleCurrent(task.id)}
                >
                  <span aria-hidden="true">{added ? '✓' : '+'}</span>
                </button>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="tasks-page-empty">{t('tasks.empty')}</div>}
        </div>
        {/*
         * 宽屏常驻第三列（空的时候给引导文案，避免第一次添加时整个布局跳一下），
         * 窄屏由 CSS 变成固定定位的抽屉，不参与纵向 grid 流 —— 否则它会被超长的
         * 任务列表挤到可视区外，而 body 是 overflow:hidden，用户永远够不着。
         */}
        {currentOpen && (
          <div className="tasks-page-current-mask" onClick={() => setCurrentOpen(false)} />
        )}
        <div className={classNames('tasks-page-current', { open: currentOpen })}>
          <div className="tasks-page-current-head">
            <span className="tasks-page-current-title">{t('tasks.currentTasks')}</span>
            <span className="tasks-page-current-count">
              {currentTaskIds.length} / {MAX_CURRENT_TASKS}
            </span>
            <GeneratePlanMenu lang={lang} currentTasks={currentTasks} mapTasks={mapTasks} />
            {currentTaskIds.length > 0 && (
              <button
                type="button"
                className="tasks-page-current-clear"
                onClick={handleClearCurrent}
              >
                {t('tasks.clearCurrent')}
              </button>
            )}
            <button
              type="button"
              className="tasks-page-current-close"
              aria-label={t('tasks.closeCurrent')}
              onClick={() => setCurrentOpen(false)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          {currentTasks.length === 0 ? (
            <p className="tasks-page-current-empty">{t('tasks.currentEmpty')}</p>
          ) : (
            currentTasks.map((task) => (
              <div
                key={task.id}
                className={classNames('tasks-page-current-item', {
                  active: task.id === selected?.id,
                })}
              >
                <button
                  type="button"
                  className="tasks-page-current-item-body"
                  onClick={() => handleSelect(task.id)}
                >
                  <img src={task.image} alt="" />
                  <div className="tasks-page-current-item-main">
                    <div className="tasks-page-current-item-name">{task.name}</div>
                    <div className="tasks-page-current-item-meta">
                      <span>{task.traderName}</span>
                      {task.mapNames.length > 0 && <span>{task.mapNames.join(' / ')}</span>}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  className="tasks-page-current-item-remove"
                  aria-label={t('tasks.removeFromCurrent')}
                  onClick={() => handleToggleCurrent(task.id)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            ))
          )}
        </div>
        <div className="tasks-page-detail">
          {selected ? (
            <>
              <button className="tasks-page-back" onClick={() => navigate('/tasks')}>
                {t('tasks.back')}
              </button>
              <div className="tasks-page-detail-hero">
                <img src={selected.image} alt="" />
                <div>
                  <h1>{selected.name}</h1>
                  <div className="tasks-page-detail-meta">
                    <span>{selected.traderName}</span>
                    <span>
                      {t('tasks.level')} {selected.minPlayerLevel}
                    </span>
                    <span>
                      {t('tasks.exp')} {selected.experience}
                    </span>
                    <span>
                      {t('tasks.faction')}{' '}
                      {FACTION_LABEL[selected.factionName] || selected.factionName}
                    </span>
                    {selected.kappaRequired && <span className="tasks-page-badge">Kappa</span>}
                    {selected.lightkeeperRequired && (
                      <span className="tasks-page-badge">Lightkeeper</span>
                    )}
                  </div>
                  {selected.mapNames.length > 0 && (
                    <div className="tasks-page-maps">{selected.mapNames.join(' · ')}</div>
                  )}
                  {selected.wikiLink && (
                    <a
                      className="tasks-page-wiki"
                      href={selected.wikiLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t('tasks.wiki')}
                    </a>
                  )}
                </div>
              </div>
              {selected.taskRequirements.length > 0 && (
                <section>
                  <h2>{t('tasks.requirements')}</h2>
                  <div className="tasks-page-reqs">
                    {selected.taskRequirements.map((req) => (
                      <button key={req.id} onClick={() => handleSelect(req.id)}>
                        {req.name}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <section>
                <h2>{t('tasks.objectives')}</h2>
                <ol className="tasks-page-objectives">
                  {selected.objectives.map((objective) => (
                    <li key={objective.id}>
                      <div className="tasks-page-objectives-head">
                        <span className="tasks-page-type">
                          {OBJECTIVE_TYPE[objective.type] || objective.type}
                        </span>
                        {objective.optional && <span>{t('tasks.optional')}</span>}
                        {objective.foundInRaid && <span>{t('common.foundInRaid')}</span>}
                        {objective.count ? <span>×{objective.count}</span> : null}
                      </div>
                      <p>{objective.description}</p>
                      {objective.mapNames.length > 0 && (
                        <div className="tasks-page-maps">{objective.mapNames.join(' · ')}</div>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
              <section>
                <h2>{t('tasks.rewards')}</h2>
                <div className="tasks-page-rewards">
                  {selected.experience > 0 && (
                    <div className="tasks-page-reward">
                      {t('tasks.exp')} {selected.experience}
                    </div>
                  )}
                  {selected.finishRewards.traderStanding.map((standing) => (
                    <div
                      key={`${standing.traderId}-${standing.standing}`}
                      className="tasks-page-reward"
                    >
                      {standing.traderName} {standing.standing > 0 ? '+' : ''}
                      {standing.standing}
                    </div>
                  ))}
                  {selected.finishRewards.items.map((item) => (
                    <div key={`${item.id}-${item.count}`} className="tasks-page-reward item">
                      <img src={item.image} alt="" />
                      <span>
                        {item.name} ×{item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <div className="tasks-page-empty">{t('tasks.pick')}</div>
          )}
        </div>
      </div>
      {/* 窄屏下打开「当前任务」抽屉的入口，宽屏由 CSS 隐藏（面板本身就常驻）。 */}
      <button
        type="button"
        className="tasks-page-current-fab"
        aria-label={t('tasks.openCurrent')}
        onClick={() => setCurrentOpen(true)}
      >
        <span aria-hidden="true">{t('tasks.currentTasks')}</span>
        {currentTasks.length > 0 && (
          <span className="tasks-page-current-fab-badge" aria-hidden="true">
            {currentTasks.length}
          </span>
        )}
      </button>
      {imageSearchOpen && (
        <ImageSearchModal
          lang={lang}
          tasks={tasks}
          currentTaskIds={currentTaskIds}
          onAddTasks={handleAddTasksBatch}
          onClose={() => setImageSearchOpen(false)}
        />
      )}
    </div>
  );
};

export default Index;
