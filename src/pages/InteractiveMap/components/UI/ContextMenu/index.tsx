import { useEffect, useMemo, useRef, useState } from 'react';

import classNames from 'classnames';
import { useRecoilState } from 'recoil';
import { message } from 'tilty-ui';

import useMapMarks from '@/features/room/hooks/useMapMarks';
import { MAX_MAP_MARKS } from '@/features/room/types';
import useI18N from '@/i18n';
import langState from '@/store/lang';

import './style.less';

export interface ContextMenuPayload extends InteractiveMap.Position2D {
  /** 右键所在地图的 id。缺省时不提供标记相关的菜单项。 */
  mapId?: string;
  /** 右键处的游戏平面坐标。右键拿不到高度，所以没有 y。 */
  position?: { x: number; z: number };
}

export let showContextMenu = (props: ContextMenuPayload) => {
  console.log(props);
};

const Index = () => {
  const [payload, setPayload] = useState<ContextMenuPayload>({ x: 0, y: 0 });
  const [show, setShow] = useState(false);

  const contextMenuRef = useRef<HTMLDivElement>(null);

  const [lang] = useRecoilState(langState);
  const { t } = useI18N(lang);
  const { ownMarks, addMark, clearMarks } = useMapMarks();

  useEffect(() => {
    showContextMenu = (props: ContextMenuPayload) => {
      setPayload(props);
      setTimeout(() => setShow(true));
    };
  }, []);

  useEffect(() => {
    const documentClick = (e: MouseEvent) => {
      if (show && contextMenuRef.current) {
        const isClickInside = contextMenuRef.current.contains(e.target as Node);
        if (!isClickInside) {
          setShow(false);
        }
      }
    };
    document.addEventListener('click', documentClick);
    return () => {
      document.removeEventListener('click', documentClick);
    };
  }, [show]);

  /** 当前地图上自己已有的标记数。决定「清空」项是否出现。 */
  const marksOnMap = useMemo(() => {
    if (!payload.mapId) {
      return 0;
    }
    return ownMarks.filter((mark) => mark.mapId === payload.mapId).length;
  }, [ownMarks, payload.mapId]);

  const canMark = !!payload.mapId && !!payload.position;

  const handleMark = () => {
    setShow(false);
    if (!payload.mapId || !payload.position) {
      return;
    }
    const result = addMark({ mapId: payload.mapId, ...payload.position });
    if (!result.ok) {
      message.show({ content: t('contextMenu.markLimit').replace('{n}', `${MAX_MAP_MARKS}`) });
      return;
    }
    message.show({ content: t('contextMenu.markAdded') });
  };

  const handleClear = () => {
    setShow(false);
    clearMarks(payload.mapId);
    message.show({ content: t('contextMenu.marksCleared') });
  };

  return (
    <div
      className={classNames('im-contextmenu', {
        active: show,
      })}
      style={{
        left: payload.x + 16,
        top: payload.y - 16,
      }}
      ref={contextMenuRef}
    >
      {canMark && (
        <div className="im-contextmenu-item" onClick={handleMark}>
          <span>{t('contextMenu.markPosition')}</span>
        </div>
      )}
      {marksOnMap > 0 && (
        <div className="im-contextmenu-item" onClick={handleClear}>
          <span>{t('contextMenu.clearMarks')}</span>
        </div>
      )}
      {/* 标记功能不可用时（拿不到地图坐标）给一句说明，而不是弹一个空菜单。 */}
      {!canMark && marksOnMap === 0 && (
        <div className="im-contextmenu-item is-disabled">
          <span>{t('contextMenu.empty')}</span>
        </div>
      )}
      {canMark && (
        <div className="im-contextmenu-hint">
          <span>{t('contextMenu.removeHint')}</span>
        </div>
      )}
    </div>
  );
};

export default Index;
