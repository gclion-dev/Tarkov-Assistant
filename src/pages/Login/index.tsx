import { type FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

import { useRecoilState } from 'recoil';

import useAuth from '@/features/auth/hooks/useAuth';
import { authApi } from '@/features/auth/services/authApi';
import { getErrorMessage } from '@/features/auth/services/http';
import useI18N from '@/i18n';
import langState from '@/store/lang';

import './style.less';

/** 与服务端 validators.ts 保持一致。 */
const PASSWORD_MIN = 8;
const NICKNAME_MAX = 20;
/** 与服务端 invites/store.ts 的 INVITE_CODE_LENGTH 保持一致。 */
const INVITE_CODE_LENGTH = 12;

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
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  /**
   * 注册是否需要邀请码由服务端配置决定，前端不能硬编码。
   * 取不到时按「不需要」处理：真的需要时服务端仍会拦下来并给出提示，
   * 反过来（配置读取失败就多出一个必填框）会让本可以正常注册的人卡住。
   */
  const [inviteRequired, setInviteRequired] = useState(false);

  const state = location.state as { from?: string; pendingAction?: unknown } | null;
  const from = state?.from || '/interactive';

  useEffect(() => {
    let cancelled = false;
    authApi
      .config()
      .then((cfg) => {
        if (!cancelled) {
          setInviteRequired(!!cfg.inviteRequired);
        }
      })
      .catch(() => {
        // 静默失败：登录本身不依赖这个配置，不该为此弹一个用户无法处理的错误。
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, nickname, inviteRequired ? inviteCode : undefined);
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
          {mode === 'register' && inviteRequired && (
            <>
              <input
                className="auth-input auth-input-code"
                placeholder={t('login.inviteCode')}
                value={inviteCode}
                // 大写并过滤掉字符表以外的字符，与服务端归一化规则一致，
                // 这样粘贴带连字符或空格的码也能直接提交。
                onChange={(e) =>
                  setInviteCode(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-HJ-NP-Z2-9]/g, '')
                      .slice(0, INVITE_CODE_LENGTH),
                  )
                }
                autoComplete="off"
                spellCheck={false}
                required
              />
              <p className="auth-hint">{t('login.inviteCodeHint')}</p>
            </>
          )}
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
