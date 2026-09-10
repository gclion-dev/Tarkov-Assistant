import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

import classNames from 'classnames';
import { useRecoilState } from 'recoil';

import useAuth from '@/features/auth/hooks/useAuth';
import { getErrorMessage } from '@/features/auth/services/http';
import usePreferences from '@/features/preferences/hooks/usePreferences';
import useRoom from '@/features/room/hooks/useRoom';
import useI18N from '@/i18n';
import langState from '@/store/lang';

import Icon from '@/components/Icon';

import './style.less';

type PendingAction = { type: 'create-room' } | { type: 'join-room'; roomId: string };

interface LoginRedirectState {
  pendingAction?: PendingAction;
}

type ConfirmAction =
  | { type: 'kick'; userId: string; nickname: string }
  | { type: 'transfer'; userId: string; nickname: string }
  | { type: 'dissolve' };

const RoomPanel = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [lang] = useRecoilState(langState);
  const { t } = useI18N(lang);
  const { isAuthenticated, isLoading, user } = useAuth();
  const { prefs } = usePreferences();
  const {
    room,
    connected,
    pending,
    createRoom,
    joinRoom,
    leaveRoom,
    transferHost,
    kickMember,
    dissolveRoom,
  } = useRoom();

  const [show, setShow] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const isHost = !!room && !!user && room.hostId === user.id;

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
      const roomId = await createRoom(prefs.activeMapId);
      toast.success(`${t('room.created')}: ${roomId}`);
      setShow(true);
    } catch (err) {
      toast.error(getErrorMessage(err, t('room.createFailed')));
    }
  }, [createRoom, prefs.activeMapId, t]);

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
    setConfirm(null);
  };

  const runConfirm = async () => {
    if (!confirm) {
      return;
    }
    const action = confirm;
    setConfirm(null);
    try {
      if (action.type === 'kick') {
        await kickMember(action.userId);
        toast.info(t('room.kickedMember').replace('{name}', action.nickname));
      } else if (action.type === 'transfer') {
        await transferHost(action.userId);
        toast.success(t('room.transferred').replace('{name}', action.nickname));
      } else {
        await dissolveRoom();
        setShow(false);
      }
    } catch (err) {
      toast.error(getErrorMessage(err, t('room.actionFailed')));
    }
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

  let confirmText = '';
  if (confirm?.type === 'kick') {
    confirmText = t('room.confirmKick').replace('{name}', confirm.nickname);
  } else if (confirm?.type === 'transfer') {
    confirmText = t('room.confirmTransfer').replace('{name}', confirm.nickname);
  } else if (confirm?.type === 'dissolve') {
    confirmText = t('room.confirmDissolve');
  }

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
                {room.members.map((member) => {
                  const offline = member.connected === false;
                  return (
                    <div
                      key={member.userId}
                      className={classNames('im-room-member', {
                        self: member.userId === user?.id,
                        offline,
                      })}
                    >
                      <span className="im-room-member-dot" style={{ background: member.color }} />
                      <span className="im-room-member-name">{member.nickname}</span>
                      {member.userId === room.hostId && (
                        <span className="im-room-host">{t('room.host')}</span>
                      )}
                      {offline && (
                        <span className="im-room-member-offline">{t('room.reconnectingMember')}</span>
                      )}
                      {isHost && member.userId !== user?.id && (
                        <span className="im-room-member-actions">
                          <button
                            type="button"
                            className="im-room-action"
                            onClick={() =>
                              setConfirm({
                                type: 'transfer',
                                userId: member.userId,
                                nickname: member.nickname,
                              })
                            }
                          >
                            {t('room.transfer')}
                          </button>
                          <button
                            type="button"
                            className="im-room-action im-room-action-danger"
                            onClick={() =>
                              setConfirm({
                                type: 'kick',
                                userId: member.userId,
                                nickname: member.nickname,
                              })
                            }
                          >
                            {t('room.kick')}
                          </button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {confirm && (
                <div className="im-room-confirm">
                  <p>{confirmText}</p>
                  <div className="im-room-confirm-actions">
                    <button type="button" className="im-room-action" onClick={() => setConfirm(null)}>
                      {t('room.confirmCancel')}
                    </button>
                    <button
                      type="button"
                      className="im-room-action im-room-action-danger"
                      onClick={runConfirm}
                    >
                      {t('room.confirmOk')}
                    </button>
                  </div>
                </div>
              )}
              <button
                className="button button-default im-room-btn im-room-leave"
                onClick={handleLeave}
              >
                {t('room.leave')}
              </button>
              {isHost && (
                <button
                  className="button button-default im-room-btn im-room-leave"
                  onClick={() => setConfirm({ type: 'dissolve' })}
                >
                  {t('room.dissolve')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RoomPanel;
