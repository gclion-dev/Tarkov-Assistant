import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

import classNames from 'classnames';
import { useRecoilState } from 'recoil';

import useAuth from '@/features/auth/hooks/useAuth';
import { getErrorMessage } from '@/features/auth/services/http';
import useRoom from '@/features/room/hooks/useRoom';
import useI18N from '@/i18n';
import langState from '@/store/lang';

import Icon from '@/components/Icon';

import './style.less';

type PendingAction = { type: 'create-room' } | { type: 'join-room'; roomId: string };

interface LoginRedirectState {
  pendingAction?: PendingAction;
}

const RoomPanel = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [lang] = useRecoilState(langState);
  const { t } = useI18N(lang);
  const { isAuthenticated, isLoading, user } = useAuth();
  const { room, connected, pending, createRoom, joinRoom, leaveRoom } = useRoom();

  const [show, setShow] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  /** 未登录时跳登录页，并把用户原本想做的操作带过去，登录成功后自动续做。 */
  const requireAuth = useCallback(
    (action: PendingAction) => {
      if (isAuthenticated) {
        return true;
      }
      navigate('/login', { state: { from: '/interactive', pendingAction: action } });
      return false;
    },
    [isAuthenticated, navigate],
  );

  const doCreate = useCallback(async () => {
    try {
      const roomId = await createRoom();
      toast.success(`${t('room.created')}: ${roomId}`);
      setShow(true);
    } catch (err) {
      toast.error(getErrorMessage(err, t('room.createFailed')));
    }
  }, [createRoom, t]);

  const doJoin = useCallback(
    async (code: string) => {
      try {
        const roomId = await joinRoom(code);
        toast.success(`${t('room.joined')}: ${roomId}`);
        setJoinCode('');
        setShow(true);
      } catch (err) {
        toast.error(getErrorMessage(err, t('room.joinFailed')));
      }
    },
    [joinRoom, t],
  );

  const handleCreate = () => {
    if (requireAuth({ type: 'create-room' })) {
      doCreate();
    }
  };

  const handleJoin = () => {
    const code = joinCode.trim();
    if (!code) {
      toast.error(t('room.enterCode'));
      return;
    }
    if (requireAuth({ type: 'join-room', roomId: code })) {
      doJoin(code);
    }
  };

  const handleLeave = async () => {
    await leaveRoom();
    toast.info(t('room.left'));
    setShow(false);
  };

  const copyRoomId = async () => {
    if (!room?.id) {
      return;
    }
    try {
      await navigator.clipboard.writeText(room.id);
      toast.success(t('room.copied'));
    } catch {
      toast.error(t('room.copyFailed'));
    }
  };

  // 从登录页跳回来后续做原来的操作。用 navigate(replace) 清理 state，
  // 而不是直接改 window.history，否则 react-router 自己的 state 不会同步。
  useEffect(() => {
    const pendingAction = (location.state as LoginRedirectState | null)?.pendingAction;
    if (!pendingAction || !isAuthenticated) {
      return;
    }
    navigate(location.pathname, { replace: true, state: null });
    setShow(true);
    if (pendingAction.type === 'create-room') {
      doCreate();
    } else {
      doJoin(pendingAction.roomId);
    }
  }, [isAuthenticated, location.state, location.pathname, navigate, doCreate, doJoin]);

  const busy = pending || isLoading;

  return (
    <div className="im-room">
      <div className="im-room-trigger" onClick={() => setShow(!show)}>
        <Icon type="icon-home-fill" />
        {room && <span className="im-room-badge">{room.members.length}</span>}
      </div>

      {show && (
        <div className="im-room-panel" onMouseDown={(e) => e.stopPropagation()}>
          <div className="im-room-panel-title">
            {t('room.title')}
            {room && !connected && <span className="im-room-status">{t('room.reconnecting')}</span>}
          </div>

          {!room ? (
            <div className="im-room-panel-body">
              <button
                className="button button-default im-room-btn"
                onClick={handleCreate}
                disabled={busy}
              >
                {t('room.create')}
              </button>
              <div className="im-room-join">
                <input
                  className="im-room-input"
                  placeholder={t('room.codePlaceholder')}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={6}
                />
                <button
                  className="button button-default im-room-btn"
                  onClick={handleJoin}
                  disabled={busy}
                >
                  {t('room.join')}
                </button>
              </div>
            </div>
          ) : (
            <div className="im-room-panel-body">
              <div className="im-room-code">
                <span>{t('room.code')}: </span>
                <strong>{room.id}</strong>
                <button type="button" className="im-room-copy" onClick={copyRoomId}>
                  {t('room.copy')}
                </button>
              </div>
              <div className="im-room-members">
                <div className="im-room-members-title">{t('room.members')}</div>
                {room.members.map((member) => (
                  <div
                    key={member.userId}
                    className={classNames('im-room-member', {
                      self: member.userId === user?.id,
                    })}
                  >
                    <span className="im-room-member-dot" style={{ background: member.color }} />
                    <span className="im-room-member-name">{member.nickname}</span>
                    {member.userId === room.hostId && (
                      <span className="im-room-host">{t('room.host')}</span>
                    )}
                  </div>
                ))}
              </div>
              <button
                className="button button-default im-room-btn im-room-leave"
                onClick={handleLeave}
              >
                {t('room.leave')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RoomPanel;
