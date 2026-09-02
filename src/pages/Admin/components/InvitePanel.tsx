import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';

import dayjs from 'dayjs';

import { adminApi } from '@/features/admin/services/adminApi';
import type { AdminInviteCode, AdminInviteQuery, AdminInviteStatus } from '@/features/admin/types';

import ConfirmDialog, { type ConfirmRequest } from './ConfirmDialog';

const PAGE_SIZE = 20;

const STATUS_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'available', label: '可用' },
  { value: 'used', label: '已用完' },
  { value: 'expired', label: '已过期' },
  { value: 'disabled', label: '已停用' },
] as const;

const STATUS_LABEL: Record<AdminInviteStatus, string> = {
  available: '可用',
  used: '已用完',
  expired: '已过期',
  disabled: '已停用',
};

const formatTime = (value?: number | null) => {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—';
};

/** 邀请码是 12 位无分隔的字符串，分三组显示便于人工核对，复制时仍复制原文。 */
const formatCode = (code: string) => code.replace(/(.{4})(?=.)/g, '$1-');

const copy = async (text: string, message: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error('复制失败，请手动选中');
  }
};

/** 生成表单。默认值对应最常见的用法：一个一次性、30 天有效的码。 */
const CreateForm = ({
  onCreated,
  onError,
}: {
  onCreated: (items: AdminInviteCode[]) => void;
  onError: (err: unknown, fallback: string) => void;
}) => {
  const [count, setCount] = useState('1');
  const [maxUses, setMaxUses] = useState('1');
  const [expiresInDays, setExpiresInDays] = useState('30');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await adminApi.createInviteCodes({
        count: Number(count) || 1,
        maxUses: Number(maxUses) || 1,
        // 空串按「用服务端默认有效期」处理，填 0 才是永不过期。
        expiresInDays: expiresInDays === '' ? undefined : Number(expiresInDays),
        note: note.trim() || undefined,
      });
      onCreated(res.items);
      setNote('');
    } catch (err) {
      onError(err, '生成邀请码失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="admin-invite-create" onSubmit={handleSubmit}>
      <label className="admin-invite-field">
        <span className="admin-invite-field-label">生成数量</span>
        <input
          className="admin-input"
          type="number"
          min={1}
          max={50}
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
      </label>
      <label className="admin-invite-field">
        <span className="admin-invite-field-label">每个可用次数</span>
        <input
          className="admin-input"
          type="number"
          min={1}
          max={999}
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
        />
      </label>
      <label className="admin-invite-field">
        <span className="admin-invite-field-label">有效天数（0 = 永久）</span>
        <input
          className="admin-input"
          type="number"
          min={0}
          max={3650}
          value={expiresInDays}
          onChange={(e) => setExpiresInDays(e.target.value)}
        />
      </label>
      <label className="admin-invite-field admin-invite-field-wide">
        <span className="admin-invite-field-label">备注（可选）</span>
        <input
          className="admin-input"
          placeholder="例如：给某个小队"
          maxLength={100}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <button
        className="button button-default admin-invite-submit"
        type="submit"
        disabled={submitting}
      >
        {submitting ? '生成中...' : '生成邀请码'}
      </button>
    </form>
  );
};

/**
 * 刚生成的码单独置顶展示。
 * 列表里也有，但管理员生成完最需要的就是马上把码复制出去发人，
 * 让他去分页表格里翻找是没有必要的一步。
 */
const FreshCodes = ({ items, onDismiss }: { items: AdminInviteCode[]; onDismiss: () => void }) => {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="admin-invite-fresh">
      <div className="admin-invite-fresh-head">
        <span>本次生成了 {items.length} 个邀请码</span>
        <div className="admin-invite-fresh-actions">
          <button
            type="button"
            className="admin-ghost"
            onClick={() =>
              copy(items.map((item) => item.code).join('\n'), `已复制 ${items.length} 个邀请码`)
            }
          >
            复制全部
          </button>
          <button type="button" className="admin-ghost" onClick={onDismiss}>
            收起
          </button>
        </div>
      </div>
      <div className="admin-invite-fresh-list">
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            className="admin-invite-chip"
            title="点击复制"
            onClick={() => copy(item.code, `已复制 ${formatCode(item.code)}`)}
          >
            {formatCode(item.code)}
          </button>
        ))}
      </div>
    </div>
  );
};

const InvitePanel = ({
  onError,
  onChanged,
}: {
  onError: (err: unknown, fallback: string) => void;
  /** 邀请码增删会影响概览里的可用余量，通知外层一起刷新。 */
  onChanged: () => void;
}) => {
  const [items, setItems] = useState<AdminInviteCode[]>([]);
  const [total, setTotal] = useState(0);
  const [inviteRequired, setInviteRequired] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string>();
  const [fresh, setFresh] = useState<AdminInviteCode[]>([]);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [query, setQuery] = useState<AdminInviteQuery>({
    search: '',
    status: 'all',
    page: 1,
    pageSize: PAGE_SIZE,
  });
  const [searchInput, setSearchInput] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await adminApi.inviteCodes(query);
      setItems(page.items);
      setTotal(page.total);
      setInviteRequired(page.inviteRequired);
    } catch (err) {
      onError(err, '加载邀请码失败');
    } finally {
      setLoading(false);
    }
  }, [query, onError]);

  useEffect(() => {
    load();
  }, [load]);

  // 与用户列表一致：等停手 400ms 再搜，避免每敲一个字符打一次请求。
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
      onChanged();
    } catch (err) {
      onError(err, fallback);
    } finally {
      setBusyId(undefined);
    }
  };

  const handleCreated = (created: AdminInviteCode[]) => {
    setFresh(created);
    toast.success(`已生成 ${created.length} 个邀请码`);
    // 回到第一页，新生成的码按创建时间倒序就在最前面。
    setQuery((prev) => (prev.page === 1 ? { ...prev } : { ...prev, page: 1 }));
    onChanged();
  };

  const handleToggle = (item: AdminInviteCode) => {
    runAction(
      item.id,
      async () => {
        await adminApi.setInviteCodeDisabled(item.id, !item.disabled);
        toast.success(item.disabled ? '已恢复该邀请码' : '已停用该邀请码');
      },
      '修改邀请码状态失败',
    );
  };

  const handleDelete = (item: AdminInviteCode) => {
    const lines = [
      `即将永久删除邀请码 ${formatCode(item.code)}，此操作无法撤销。`,
      item.usedCount > 0
        ? `该码已被使用 ${item.usedCount} 次，删除会连带清掉这些使用记录。已注册的账号不受影响。`
        : '已经发给别人的码会立刻失效。只想临时冻结请改用「停用」。',
    ];
    setConfirmRequest({
      title: '删除邀请码',
      lines,
      confirmText: '永久删除',
      danger: true,
      onConfirm: () => {
        runAction(
          item.id,
          async () => {
            await adminApi.deleteInviteCode(item.id);
            toast.success('已删除邀请码');
          },
          '删除邀请码失败',
        );
      },
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  return (
    <div className="admin-invite">
      {!inviteRequired && (
        <p className="admin-invite-notice">
          当前服务端未要求邀请码，注册无需邀请码即可完成。这里生成的码仍然有效， 在 room-server 的
          .env 里设置 INVITE_CODE_REQUIRED=true 并重启后生效。
        </p>
      )}

      <CreateForm onCreated={handleCreated} onError={onError} />
      <FreshCodes items={fresh} onDismiss={() => setFresh([])} />

      <div className="admin-toolbar">
        <input
          className="admin-input admin-search"
          placeholder="搜索邀请码或备注"
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
        <span className="admin-total">共 {total} 个邀请码</span>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>邀请码</th>
              <th>备注</th>
              <th>状态</th>
              <th>用量</th>
              <th>有效期至</th>
              <th>创建</th>
              <th>使用者</th>
              <th className="admin-table-actions-head">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td className="admin-empty" colSpan={8}>
                  {loading ? '加载中...' : '还没有邀请码，用上面的表单生成一个'}
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id} className={item.status === 'available' ? undefined : 'is-disabled'}>
                <td>
                  <button
                    type="button"
                    className="admin-invite-code"
                    title="点击复制"
                    onClick={() => copy(item.code, `已复制 ${formatCode(item.code)}`)}
                  >
                    {formatCode(item.code)}
                  </button>
                </td>
                <td>{item.note || '—'}</td>
                <td>
                  <span
                    className={`admin-badge ${item.status === 'available' ? 'active' : 'disabled'}`}
                  >
                    {STATUS_LABEL[item.status]}
                  </span>
                </td>
                <td className="admin-mono">
                  {item.usedCount} / {item.maxUses}
                </td>
                <td className="admin-mono">
                  {item.expiresAt ? formatTime(item.expiresAt) : '永久'}
                </td>
                <td className="admin-mono">{formatTime(item.createdAt)}</td>
                <td>
                  {item.uses.length === 0 ? (
                    '—'
                  ) : (
                    <span
                      className="admin-invite-uses"
                      title={item.uses.map((u) => u.email).join('\n')}
                    >
                      {item.uses[0].email}
                      {item.uses.length > 1 ? ` 等 ${item.uses.length} 人` : ''}
                    </span>
                  )}
                </td>
                <td className="admin-table-actions">
                  <button
                    type="button"
                    className="admin-ghost"
                    disabled={busyId === item.id}
                    onClick={() => handleToggle(item)}
                  >
                    {item.disabled ? '恢复' : '停用'}
                  </button>
                  <button
                    type="button"
                    className="admin-ghost danger"
                    disabled={busyId === item.id}
                    onClick={() => handleDelete(item)}
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

export default InvitePanel;
