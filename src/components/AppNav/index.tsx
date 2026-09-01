import { NavLink } from 'react-router-dom';

import { useRecoilState } from 'recoil';

import useI18N from '@/i18n';
import langState from '@/store/lang';

import './style.less';

const Index = () => {
  const [lang] = useRecoilState(langState);
  const { t } = useI18N(lang);

  return (
    <div className="app-nav">
      <NavLink to="/interactive" end className="app-nav-item">
        {t('interactive.title')}
      </NavLink>
      <NavLink to="/tasks" className="app-nav-item">
        {t('tasks.title')}
      </NavLink>
    </div>
  );
};

export default Index;
