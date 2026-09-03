import { type FormEvent, useEffect, useRef, useState } from 'react';

import type { AdminUser } from '@/features/admin/types';

export interface QuotaRequest {
  user: AdminUser;
  /** 服务端的全局默认额度，用于说明「跟随默认」到底是多少。 */
  defaultLimit: number;
  /** dailyLimit 传 null 表示清除单独分配、回到全局默认值。 */
  onSubmit: (dailyLimit: number | null) => void;
  onReset: () => void;
}

const MAX_LIMIT = 500;

/**
 * 按图搜索的额度分配弹窗。
 *
 * 单独写一个而不是复用 ConfirmDialog：那个的输入框是「原样输入指定文字才放行」，
 * 这里要的是一个可校验范围的数字输入，语义完全不同。
 */
const QuotaDialog = ({
  request,
  onClose,
}: {
  request: QuotaRequest | null;
  onClose: () => void;
}) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!request) {
      return;
    }
    // 已单独分配过就带出当前值，没有则留空表示「跟随默认」。
    setValue(request.user.imageSearch.custom ? String(request.user.imageSearch.limit) : '');
    inputRef.current?.focus();
  }, [request]);

  useEffect(() => {
    if (!request) {
      return undefined;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [request, onClose]);

  if (!request) {
    return null;
  }

  const { user, defaultLimit } = request;
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  // 留空 = 回到全局默认值，是合法输入。
  const valid = trimmed === '' || (Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_LIMIT);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) {
      return;
    }
    request.onSubmit(trimmed === '' ? null : parsed);
    onClose();
  };

  return (
    <div className="admin-modal" role="presentation" onMouseDown={onClose}>
      <form
        className="admin-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="分配按图搜索额度"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="admin-modal-title">按图搜索额度</h2>
        <p className="admin-modal-text">{user.email}</p>
        <p className="admin-modal-text">
          今日已用 {user.imageSearch.used} / {user.imageSearch.limit} 次
          {user.imageSearch.custom ? '（单独分配）' : `（跟随默认 ${defaultLimit} 次）`}
        </p>
        <p className="admin-modal-text">
          每天可用次数。留空表示跟随全局默认值（当前 {defaultLimit} 次），填 0
          表示不允许该用户使用。 额度按自然日重置，改上限不会清掉今天已用的次数。
        </p>
        <label className="admin-modal-label" htmlFor="admin-quota-input">
          每日额度（0 - {MAX_LIMIT}）：
        </label>
        <input
          id="admin-quota-input"
          ref={inputRef}
          className="admin-input"
          type="number"
          min={0}
          max={MAX_LIMIT}
          step={1}
          placeholder={`留空跟随默认（${defaultLimit}）`}
          value={value}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="admin-modal-actions">
          <button
            type="button"
            className="admin-ghost"
            // 已用次数为 0 时没什么可清的。
            disabled={user.imageSearch.used === 0}
            onClick={() => {
              request.onReset();
              onClose();
            }}
          >
            清空今日用量
          </button>
          <button type="button" className="admin-ghost" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="admin-ghost" disabled={!valid}>
            保存
          </button>
        </div>
      </form>
    </div>
  );
};

export default QuotaDialog;
