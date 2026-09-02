import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

import dayjs from 'dayjs';

import useAdminSession from '@/features/admin/hooks/useAdminSession';
import { adminApi } from '@/features/admin/services/adminApi';
import type {
  AdminStats,
  AdminUser,
  AdminUserQuery,
  AdminUserStatus,
} from '@/features/admin/types';
import { ApiError, getErrorMessage } from '@/features/auth/services/http';

import ConfirmDialog, { type ConfirmRequest } from './components/ConfirmDialog';

import './style.less';

const PAGE_SIZE = 20;

const STATUS_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '正常' },
  { value: 'disabled', label: '已停用' },
] as const;

const formatTime = (value?: number | null) => {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—';
};

const AdminLogin = ({
  onSubmit,
}: {
  onSubmit: (username: string, password: string) => Promise<void>;
}) => {
  const [username, setUsername] = useState('admin_zds');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(username, password);
    } catch (err) {
      toast.error(getErrorMessage(err, '登录失败'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-login">
      <form className="admin-login-card" onSubmit={handleSubmit}>
        <h1 className="admin-login-title">管理后台</h1>
        <p className="admin-login-text">凭据由服务端环境变量配置，与普通用户账号无关。</p>
        <input
          className="admin-input"
          autoComplete="username"
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          className="admin-input"
          type="password"
          autoComplete="current-password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className="button button-default admin-submit" type="submit" disabled={submitting}>
          {submitting ? '登录中...' : '登录'}
        </button>
        <Link className="admin-login-back" to="/interactive">
          返回互动地图
        </Link>
      </form>
    </div>
  );
};

const StatsBar = ({ stats }: { stats?: AdminStats }) => {
  const items: Array<{ label: string; value: number | string }> = [
    { label: '注册用户', value: stats?.userTotal ?? '—' },
    { label: '正常', value: stats?.userActive ?? '—' },
    { label: '已停用', value: stats?.userDisabled ?? '—' },
    { label: '7 天新增', value: stats?.userRecent ?? '—' },
    { label: '活跃登录设备', value: stats?.activeSessions ?? '—' },
    { label: '进行中的房间', value: stats?.rooms ?? '—' },
  ];
  return (
    <div className="admin-stats">
      {items.map((item) => (
        <div className="admin-stats-item" key={item.label}>
          <span className="admin-stats-item-value">{item.value}</span>
          <span className="admin-stats-item-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
};

const AdminDashboard = ({
  username,
  onLogout,
  onSessionExpired,
}: {
  username: string;
  onLogout: () => void;
  onSessionExpired: () => void;
}) => {
  const [stats, setStats] = useState<AdminStats>();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState<AdminUserQuery>({
    search: '',
    status: 'all',
    page: 1,
    pageSize: PAGE_SIZE,
  });
  const [searchInput, setSearchInput] = useState('');
  /** 正在处理中的用户 id，用于禁用该行的按钮防重复点击。 */
  const [busyId, setBusyId] = useState<string>();
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  /**
   * 管理会话过期时统一切回登录页。
   * 每个请求都判一次，避免用户对着一个已失效的面板反复点击却只看到报错。
   */
  const handleError = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        toast.error('管理会话已失效，请重新登录');
        onSessionExpired();
        return;
      }
      toast.error(getErrorMessage(err, fallback));
    },
    [onSessionExpired],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData, page] = await Promise.all([adminApi.stats(), adminApi.users(query)]);
      setStats(statsData);
      setUsers(page.items);
      setTotal(page.total);
    } catch (err) {
      handleError(err, '加载数据失败');
    } finally {
      setLoading(false);
    }
  }, [query, handleError]);

  useEffect(() => {
    load();
  }, [load]);

  // 输入即搜索会把每个字符都打成一次请求，这里等停手 400ms。
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    searchTimer.current && clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setQuery((prev) => {
        // 搜索词没变就返回原对象，避免制造一次无意义的重新加载。
        if (prev.search === searchInput) {
          return prev;
        }
        return { ...prev, search: searchInput, page: 1 };
      });
    }, 400);
    return () => {
      searchTimer.current && clearTimeout(searchTimer.current);
    };
  }, [searchInput]);

  const runAction = async (id: string, action: () => Promise<unknown>, fallback: string) => {
    setBusyId(id);
    try {
      await action();
      await load();
    } catch (err) {
      handleError(err, fallback);
    } finally {
      setBusyId(undefined);
    }
  };

  const applyStatus = (user: AdminUser, next: AdminUserStatus) => {
    runAction(
      user.id,
      async () => {
        const res = await adminApi.setUserStatus(user.id, next);
        if (next === 'disabled') {
          const suffix = res.disconnected ? `，断开 ${res.disconnected} 个连接` : '';
          toast.success(`已停用 ${user.email}${suffix}`);
        } else {
          toast.success(`已恢复 ${user.email}`);
        }
      },
      '修改状态失败',
    );
  };

  const handleToggleStatus = (user: AdminUser) => {
    // 恢复是无害操作，直接执行；停用会立刻踢掉全部登录，需要确认。
    if (user.status === 'disabled') {
      applyStatus(user, 'active');
      return;
    }
    setConfirmRequest({
      title: `停用 ${user.email}？`,
      lines: [
        '该账号会立刻退出全部登录设备，并断开正在进行的房间连接。',
        '在你恢复它之前，该账号无法再次登录。已保存的云端设置不会被删除。',
      ],
      confirmText: '停用',
      danger: true,
      onConfirm: () => applyStatus(user, 'disabled'),
    });
  };

  const handleForceLogout = (user: AdminUser) => {
    runAction(
      user.id,
      async () => {
        const res = await adminApi.forceLogout(user.id);
        toast.success(
          `已强制下线 ${user.email}${res.disconnected ? `，断开 ${res.disconnected} 个连接` : ''}`,
        );
      },
      '强制下线失败',
    );
  };

  const handleDelete = (user: AdminUser) => {
    // 删除不可撤销，且会连带清掉登录会话与云端设置，要求原样输入邮箱才能确认。
    setConfirmRequest({
      title: '删除用户',
      lines: [
        `即将永久删除 ${user.email}，此操作无法撤销。`,
        '该账号的登录会话与云端设置会一并删除。如果只是想暂时封禁，请改用「停用」。',
      ],
      confirmText: '永久删除',
      danger: true,
      requireInput: { label: '输入完整邮箱以确认：', expected: user.email },
      onConfirm: () => {
        runAction(
          user.id,
          async () => {
            await adminApi.deleteUser(user.id);
            toast.success(`已删除 ${user.email}`);
          },
          '删除失败',
        );
      },
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">管理后台</h1>
          <p className="admin-subtitle">当前管理员：{username}</p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="admin-ghost" onClick={load} disabled={loading}>
            {loading ? '刷新中...' : '刷新'}
          </button>
          <Link className="admin-ghost" to="/interactive">
            返回地图
          </Link>
          <button type="button" className="admin-ghost danger" onClick={onLogout}>
            退出登录
          </button>
        </div>
      </div>

      <StatsBar stats={stats} />

      <div className="admin-toolbar">
        <input
          className="admin-input admin-search"
          placeholder="搜索邮箱或昵称"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <div className="admin-filters">
          {STATUS_FILTERS.map((filter) => (
            <button
              type="button"
              key={filter.value}
              className={`admin-filter${query.status === filter.value ? ' active' : ''}`}
              onClick={() => setQuery((prev) => ({ ...prev, status: filter.value, page: 1 }))}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <span className="admin-total">共 {total} 个用户</span>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>邮箱</th>
              <th>昵称</th>
              <th>状态</th>
              <th>注册时间</th>
              <th>登录设备</th>
              <th>设置同步</th>
              <th className="admin-table-actions-head">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td className="admin-empty" colSpan={7}>
                  {loading ? '加载中...' : '没有符合条件的用户'}
                </td>
              </tr>
            )}
            {users.map((user) => (
              <tr key={user.id} className={user.status === 'disabled' ? 'is-disabled' : undefined}>
                <td className="admin-mono">{user.email}</td>
                <td>{user.nickname}</td>
                <td>
                  <span className={`admin-badge ${user.status}`}>
                    {user.status === 'active' ? '正常' : '已停用'}
                  </span>
                </td>
                <td className="admin-mono">{formatTime(user.createdAt)}</td>
                <td className="admin-mono">{user.activeSessions}</td>
                <td className="admin-mono">{formatTime(user.prefsUpdatedAt)}</td>
                <td className="admin-table-actions">
                  <button
                    type="button"
                    className="admin-ghost"
                    disabled={busyId === user.id}
                    onClick={() => handleToggleStatus(user)}
                  >
                    {user.status === 'active' ? '停用' : '恢复'}
                  </button>
                  <button
                    type="button"
                    className="admin-ghost"
                    disabled={busyId === user.id || user.activeSessions === 0}
                    onClick={() => handleForceLogout(user)}
                  >
                    强制下线
                  </button>
                  <button
                    type="button"
                    className="admin-ghost danger"
                    disabled={busyId === user.id}
                    onClick={() => handleDelete(user)}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-pager">
        <button
          type="button"
          className="admin-ghost"
          disabled={query.page <= 1 || loading}
          onClick={() => setQuery((prev) => ({ ...prev, page: prev.page - 1 }))}
        >
          上一页
        </button>
        <span className="admin-pager-info">
          {query.page} / {totalPages}
        </span>
        <button
          type="button"
          className="admin-ghost"
          disabled={query.page >= totalPages || loading}
          onClick={() => setQuery((prev) => ({ ...prev, page: prev.page + 1 }))}
        >
          下一页
        </button>
      </div>

      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
    </div>
  );
};

const Admin = () => {
  const { state, login, logout, markExpired } = useAdminSession();

  if (state.status === 'loading') {
    return null;
  }

  if (state.status === 'disabled') {
    return (
      <div className="admin-login">
        <div className="admin-login-card">
          <h1 className="admin-login-title">管理后台未启用</h1>
          <p className="admin-login-text">{state.message}</p>
          <p className="admin-login-text">
            在 room-server 的 .env 里配置 ADMIN_PASSWORD_HASH 或 ADMIN_PASSWORD 后重启服务。
          </p>
          <Link className="admin-login-back" to="/interactive">
            返回互动地图
          </Link>
        </div>
      </div>
    );
  }

  if (state.status === 'anonymous') {
    return <AdminLogin onSubmit={login} />;
  }

  return (
    <AdminDashboard username={state.username} onLogout={logout} onSessionExpired={markExpired} />
  );
};

export default Admin;
