import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

import { useRecoilState } from 'recoil';

import useAuth from '@/features/auth/hooks/useAuth';
import { getErrorMessage } from '@/features/auth/services/http';
import useI18N from '@/i18n';
import langState from '@/store/lang';

import './style.less';

/** 与服务端 validators.ts 保持一致。 */
const PASSWORD_MIN = 8;
const NICKNAME_MAX = 20;

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, isAuthenticated, isLoading } = useAuth();
  const [lang] = useRecoilState(langState);
  const { t } = useI18N(lang);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const state = location.state as { from?: string; pendingAction?: unknown } | null;
  const from = state?.from || '/interactive';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, nickname);
      }
      // 把待续做的操作透传回来源页面（例如登录后自动创建房间）。
      navigate(from, { replace: true, state: { pendingAction: state?.pendingAction } });
    } catch (err) {
      toast.error(getErrorMessage(err, t('login.failed')));
    } finally {
      setSubmitting(false);
    }
  };

  // 会话恢复完成前不渲染，避免已登录用户看到一闪而过的登录表单。
  if (isLoading) {
    return null;
  }
  if (isAuthenticated) {
    return <Navigate to={from} replace state={{ pendingAction: state?.pendingAction }} />;
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* 标题与说明要跟着登录 / 注册模式一起切换 */}
        <h1 className="auth-card-title">
          {mode === 'login' ? t('login.title') : t('login.registerTitle')}
        </h1>
        <p className="auth-card-text">
          {mode === 'login' ? t('login.text') : t('login.registerText')}
        </p>
        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <input
              className="auth-input"
              placeholder={t('login.nickname')}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={NICKNAME_MAX}
              required
            />
          )}
          <input
            className="auth-input"
            type="email"
            autoComplete="email"
            placeholder={t('login.account')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="auth-input"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={t('login.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={PASSWORD_MIN}
          />
          {mode === 'register' && <p className="auth-hint">{t('login.passwordHint')}</p>}
          <button className="button button-default auth-submit" type="submit" disabled={submitting}>
            {mode === 'login' ? t('login.loginBtn') : t('login.registerBtn')}
          </button>
        </form>
        <div className="auth-actions">
          <button
            type="button"
            className="auth-link"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? t('login.registerBtn') : t('login.loginBtn')}
          </button>
          <Link className="auth-link" to="/interactive">
            {t('login.returnBtn')}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
