import classNames from 'classnames';
import { useRecoilState } from 'recoil';

import { getLootCategories } from '@/data/resolveLoot';
import useI18N from '@/i18n';
import langState from '@/store/lang';

import { getIconCDN, getLoot } from '@/pages/InteractiveMap/utils';

import './style.less';

export interface MarkerSelectProps {
  extracts: string[];
  locks: string[];
  lootKeys: string[];
  lootLooseKeys: string[];
  spawns: string[];
  hazards: string[];
  stationaryWeapons: string[];
  tasks: string[];
  lootContainers: InteractiveMap.LootContainer[];
  lootLoose?: InteractiveMap.LootLoose[];
  onExtractsChange: (extracts: InteractiveMap.Faction[]) => void;
  onLocksChange: (locks: string[]) => void;
  onLootKeysChange: (lootKeys: string[]) => void;
  onLootLooseKeysChange: (lootLooseKeys: string[]) => void;
  onSpawnsChange: (hazards: string[]) => void;
  onHazardsChange: (hazards: string[]) => void;
  onStationaryWeaponsChange: (hazards: string[]) => void;
  onTasksChange: (tasks: string[]) => void;
}

const mergeToggle = (selected: string[], keys: string[], enable: boolean) => {
  if (enable) {
    return Array.from(new Set([...selected, ...keys]));
  }
  return selected.filter((item) => !keys.includes(item));
};

const flipKey = (selected: string[], key: string) => {
  return mergeToggle(selected, [key], !selected.includes(key));
};

const LayerToggle = (props: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) => {
  const { active, icon, label, onClick } = props;
  return (
    <button
      type="button"
      className={classNames('im-quicktools-modal-marker-toggle', { active })}
      onClick={onClick}
    >
      <img
        src={icon}
        alt=""
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
      />
      <span>{label}</span>
    </button>
  );
};

const Index = (props: MarkerSelectProps) => {
  const {
    extracts = [],
    locks = [],
    lootKeys = [],
    lootLooseKeys = [],
    spawns = [],
    hazards = [],
    stationaryWeapons = [],
    tasks = [],
    lootContainers,
    lootLoose,
    onExtractsChange,
    onLocksChange,
    onLootKeysChange,
    onLootLooseKeysChange,
    onSpawnsChange,
    onHazardsChange,
    onStationaryWeaponsChange,
    onTasksChange,
  } = props;

  const [lang] = useRecoilState(langState);
  const { t } = useI18N(lang);

  const lootCategories = getLootCategories(lootLoose || []);
  const taskOptions = [
    { key: 'quest_item', label: t('marker.questItem'), icon: getIconCDN('quest_item') },
    {
      key: 'quest_objective',
      label: t('marker.questObjective'),
      icon: getIconCDN('quest_objective'),
    },
  ];
  const extractOptions = [
    { key: 'pmc', label: t('marker.extractPmc'), icon: getIconCDN('extract_pmc') },
    { key: 'scav', label: t('marker.extractScav'), icon: getIconCDN('extract_scav') },
    { key: 'shared', label: t('marker.extractShared'), icon: getIconCDN('extract_shared') },
    { key: 'transit', label: t('marker.extractTransit'), icon: getIconCDN('extract_transit') },
  ];
  const spawnOptions = [
    { key: 'scav', label: t('marker.spawnScav'), icon: getIconCDN('spawn_scav') },
    { key: 'sniper_scav', label: t('marker.spawnSniper'), icon: getIconCDN('spawn_sniper_scav') },
    { key: 'boss', label: t('marker.spawnBoss'), icon: getIconCDN('spawn_boss') },
    { key: 'pmc', label: t('marker.spawnPmc'), icon: getIconCDN('spawn_pmc') },
  ];
  const otherOptions = [
    {
      key: 'lock',
      label: t('marker.lock'),
      icon: getIconCDN('lock'),
      selected: locks,
      onToggle: onLocksChange,
    },
    {
      key: 'hazard',
      label: t('marker.hazard'),
      icon: getIconCDN('hazard'),
      selected: hazards,
      onToggle: onHazardsChange,
    },
    {
      key: 'stationaryWeapon',
      label: t('marker.stationaryWeapon'),
      icon: getIconCDN('stationarygun'),
      selected: stationaryWeapons,
      onToggle: onStationaryWeaponsChange,
    },
  ];
  const lootGroups = [
    { type: 'Valuable', label: t('marker.lootValuable') },
    { type: 'Good', label: t('marker.lootGood') },
    { type: 'Common', label: t('marker.lootCommon') },
  ]
    .map((group) => ({
      ...group,
      items: getLoot(group.type, lootContainers),
    }))
    .filter((group) => group.items.length > 0);
  const lootGroupKeys = lootGroups.flatMap((group) => {
    return group.items.map((item: { key: string }) => item.key);
  });

  const renderGroupTitle = (
    title: string,
    keys: string[],
    selected: string[],
    onChange: (next: string[]) => void,
  ) => {
    const allOn = keys.length > 0 && keys.every((key) => selected.includes(key));
    return (
      <div className="im-quicktools-modal-marker-title">
        <span>{title}</span>
        {keys.length > 0 && (
          <button type="button" onClick={() => onChange(mergeToggle(selected, keys, !allOn))}>
            {allOn ? t('marker.hideAll') : t('marker.showAll')}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="im-quicktools-modal-marker" onMouseDown={(e) => e.stopPropagation()}>
      {renderGroupTitle(
        t('marker.tasks'),
        taskOptions.map((item) => item.key),
        tasks,
        onTasksChange,
      )}
      <div className="im-quicktools-modal-marker-block">
        <div className="im-quicktools-modal-marker-block-list">
          {taskOptions.map((item) => (
            <LayerToggle
              key={item.key}
              active={tasks.includes(item.key)}
              icon={item.icon}
              label={item.label}
              onClick={() => onTasksChange(flipKey(tasks, item.key))}
            />
          ))}
        </div>
      </div>
      {lootCategories.length > 0 && (
        <>
          {renderGroupTitle(
            t('marker.looseLoot'),
            lootCategories.map((item) => item.key),
            lootLooseKeys,
            onLootLooseKeysChange,
          )}
          <div className="im-quicktools-modal-marker-block">
            <div className="im-quicktools-modal-marker-block-list">
              {lootCategories.map((category) => (
                <LayerToggle
                  key={category.key}
                  active={lootLooseKeys.includes(category.key)}
                  icon={category.image || getIconCDN('quest_item')}
                  label={category.name}
                  onClick={() => onLootLooseKeysChange(flipKey(lootLooseKeys, category.key))}
                />
              ))}
            </div>
          </div>
        </>
      )}
      {lootGroups.length > 0 && (
        <>
          {renderGroupTitle(t('marker.legends'), lootGroupKeys, lootKeys, onLootKeysChange)}
          {lootGroups.map((group) => (
            <div className="im-quicktools-modal-marker-block" key={group.type}>
              <div className="im-quicktools-modal-marker-block-title">
                <span>{group.label}</span>
              </div>
              <div className="im-quicktools-modal-marker-block-list">
                {group.items.map((loot: { key: string; name: string; value: string[] }) => (
                  <LayerToggle
                    key={loot.key}
                    active={lootKeys.includes(loot.key)}
                    icon={getIconCDN(`container_${loot.value[0]}`)}
                    label={loot.name}
                    onClick={() => onLootKeysChange(flipKey(lootKeys, loot.key))}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
      {renderGroupTitle(
        t('marker.extracts'),
        extractOptions.map((item) => item.key),
        extracts,
        (next) => onExtractsChange(next as InteractiveMap.Faction[]),
      )}
      <div className="im-quicktools-modal-marker-block">
        <div className="im-quicktools-modal-marker-block-list">
          {extractOptions.map((item) => (
            <LayerToggle
              key={item.key}
              active={extracts.includes(item.key)}
              icon={item.icon}
              label={item.label}
              onClick={() => {
                onExtractsChange(flipKey(extracts, item.key) as InteractiveMap.Faction[]);
              }}
            />
          ))}
        </div>
      </div>
      {renderGroupTitle(
        t('marker.spawns'),
        spawnOptions.map((item) => item.key),
        spawns,
        onSpawnsChange,
      )}
      <div className="im-quicktools-modal-marker-block">
        <div className="im-quicktools-modal-marker-block-list">
          {spawnOptions.map((item) => (
            <LayerToggle
              key={item.key}
              active={spawns.includes(item.key)}
              icon={item.icon}
              label={item.label}
              onClick={() => onSpawnsChange(flipKey(spawns, item.key))}
            />
          ))}
        </div>
      </div>
      {renderGroupTitle(
        t('marker.others'),
        otherOptions.map((item) => item.key),
        [...locks, ...hazards, ...stationaryWeapons],
        (next) => {
          onLocksChange(next.includes('lock') ? ['lock'] : []);
          onHazardsChange(next.includes('hazard') ? ['hazard'] : []);
          onStationaryWeaponsChange(
            next.includes('stationaryWeapon') ? ['stationaryWeapon'] : [],
          );
        },
      )}
      <div className="im-quicktools-modal-marker-block">
        <div className="im-quicktools-modal-marker-block-list">
          {otherOptions.map((item) => (
            <LayerToggle
              key={item.key}
              active={item.selected.includes(item.key)}
              icon={item.icon}
              label={item.label}
              onClick={() => item.onToggle(flipKey(item.selected, item.key))}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Index;
