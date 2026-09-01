import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import classNames from 'classnames';
import { useRecoilState } from 'recoil';

import { CatalogTask, loadTaskCatalog, refreshTaskCatalog } from '@/data/taskCatalog';
import useI18N from '@/i18n';
import langState from '@/store/lang';

import AppNav from '@/components/AppNav';

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

  const [tasks, setTasks] = useState<CatalogTask[]>(loadTaskCatalog);
  const [keyword, setKeyword] = useState('');
  const [trader, setTrader] = useState('all');
  const [mapName, setMapName] = useState('all');
  const [kappaOnly, setKappaOnly] = useState(false);

  useEffect(() => {
    refreshTaskCatalog().then((next) => {
      if (next?.length) {
        setTasks(next);
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
    navigate(`/tasks/${id}`);
  };

  return (
    <div className="tasks-page">
      <div className="tasks-page-header">
        <AppNav />
        <div className="tasks-page-filters">
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
          {filtered.map((task) => (
            <button
              key={task.id}
              className={classNames('tasks-page-item', { active: task.id === selected?.id })}
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
          ))}
          {filtered.length === 0 && <div className="tasks-page-empty">{t('tasks.empty')}</div>}
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
                      {t('tasks.faction')} {FACTION_LABEL[selected.factionName] || selected.factionName}
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
                    <a className="tasks-page-wiki" href={selected.wikiLink} target="_blank" rel="noreferrer">
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
                    <div key={`${standing.traderId}-${standing.standing}`} className="tasks-page-reward">
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
    </div>
  );
};

export default Index;
