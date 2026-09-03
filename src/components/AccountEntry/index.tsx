import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

import { useRecoilState } from 'recoil';

import useAuth from '@/features/auth/hooks/useAuth';
import { getErrorMessage } from '@/features/auth/services/http';
import useI18N from '@/i18n';
import langState from '@/store/lang';

import Icon from '@/components/Icon';

import './style.less';

/**
 * 账户入口。
 *
 * 在这之前，登录页只能通过「协作房间」的操作被动触发（未登录时才跳转），
 * 想主动登录或者想确认自己当前登录成了谁都没有入口。
 *
 * 跳转时带上当前路径作为 from，登录成功后回到用户原本待着的页面，
 * 而不是固定回互动地图。
 */
const AccountEntry = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [lang] = useRecoilState(langState);
  const { t } = useI18N(lang);
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [pending, setPending] = useState(false);

  // 会话恢复期间什么都不渲染：否则已登录的用户会先看到一下「登录」再跳成昵称。
  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return (
      <div className="account-entry">
        <button
          type="button"
          className="account-entry-item"
          title={t('login.entryLogin')}
          onClick={() => navigate('/login', { state: { from: location.pathname } })}
        >
          <Icon type="icon-user-line" />
          <span>{t('login.entryLogin')}</span>
        </button>
      </div>
    );
  }

  const handleLogout = async () => {
    setPending(true);
    try {
      await logout();
      toast.success(t('login.loggedOut'));
    } catch (err) {
      toast.error(getErrorMessage(err, t('login.logoutFailed')));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="account-entry">
      {/* 昵称只是身份显示，不做成可点击的，避免和「退出」误触。 */}
      <div className="account-entry-item is-static" title={user?.email}>
        <Icon type="icon-user-line" />
        <span>{user?.nickname}</span>
      </div>
      <button
        type="button"
        className="account-entry-item"
        disabled={pending}
        onClick={() => {
          handleLogout().catch(() => undefined);
        }}
      >
        <span>{t('login.entryLogout')}</span>
      </button>
    </div>
  );
};

export default AccountEntry;
