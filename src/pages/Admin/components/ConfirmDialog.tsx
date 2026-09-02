import { type FormEvent, useEffect, useRef, useState } from 'react';

export interface ConfirmRequest {
  title: string;
  /** 每行渲染成一段，用来说明这次操作的后果。 */
  lines: string[];
  confirmText: string;
  danger?: boolean;
  /**
   * 要求管理员原样输入这段文字才能确认。
   * 用于删除这类不可撤销的操作，避免手滑点掉一个账号。
   */
  requireInput?: { label: string; expected: string };
  onConfirm: () => void;
}

/**
 * 自己实现而不用 window.confirm / prompt：
 * 原生弹窗在深色界面里观感突兀，也无法承载「输入邮箱确认」这种要求。
 */
const ConfirmDialog = ({
  request,
  onClose,
}: {
  request: ConfirmRequest | null;
  onClose: () => void;
}) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!request) {
      return;
    }
    setValue('');
    // 焦点移进弹窗，键盘用户不会还停在背后的表格上。
    (request.requireInput ? inputRef.current : cancelRef.current)?.focus();
  }, [request]);

  useEffect(() => {
    if (!request) {
      return;
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

  const expected = request.requireInput?.expected;
  const matched = !expected || value.trim().toLowerCase() === expected.toLowerCase();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!matched) {
      return;
    }
    request.onConfirm();
    onClose();
  };

  return (
    <div className="admin-modal" role="presentation" onMouseDown={onClose}>
      <form
        className="admin-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={request.title}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="admin-modal-title">{request.title}</h2>
        {request.lines.map((line) => (
          <p className="admin-modal-text" key={line}>
            {line}
          </p>
        ))}
        {request.requireInput && (
          <>
            <label className="admin-modal-label" htmlFor="admin-confirm-input">
              {request.requireInput.label}
            </label>
            <input
              id="admin-confirm-input"
              ref={inputRef}
              className="admin-input"
              value={value}
              autoComplete="off"
              onChange={(e) => setValue(e.target.value)}
            />
          </>
        )}
        <div className="admin-modal-actions">
          <button type="button" ref={cancelRef} className="admin-ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="submit"
            className={`admin-ghost${request.danger ? ' danger' : ''}`}
            disabled={!matched}
          >
            {request.confirmText}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ConfirmDialog;
