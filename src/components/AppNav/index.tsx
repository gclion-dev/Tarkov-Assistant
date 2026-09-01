import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import classNames from 'classnames';
import { useRecoilState } from 'recoil';

import useI18N from '@/i18n';
import langState from '@/store/lang';

import Icon from '@/components/Icon';

import './style.less';

const MODES = [
  { path: '/interactive', labelKey: 'interactive.title' },
  { path: '/tasks', labelKey: 'tasks.title' },
];

const Index = () => {
  const [open, setOpen] = useState(false);
  const [lang] = useRecoilState(langState);
  const { t } = useI18N(lang);
  const location = useLocation();
  const navigate = useNavigate();

  const active = MODES.find((mode) => location.pathname.startsWith(mode.path)) || MODES[0];

  const handleToggle = () => {
    setOpen(!open);
  };

  const handleSelect = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  return (
    <div className="app-nav">
      <div className="app-nav-base">
        <div className="app-nav-base-surface" onClick={handleToggle}>
          <span>{t(active.labelKey)}</span>
          <span className="app-nav-base-surface-arrow">
            {open ? (
              <Icon type="icon-arrow-drop-up-fill" />
            ) : (
              <Icon type="icon-arrow-drop-down-fill" />
            )}
          </span>
        </div>
        <div
          className={classNames('app-nav-base-dropdown', {
            active: open,
          })}
        >
          {MODES.map((mode) => (
            <div
              key={mode.path}
              className={classNames('app-nav-base-dropdown-item', {
                active: mode.path === active.path,
              })}
              onClick={() => handleSelect(mode.path)}
            >
              <span>{t(mode.labelKey)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Index;
