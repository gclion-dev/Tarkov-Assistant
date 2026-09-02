import { useEffect, useState } from 'react';

import classNames from 'classnames';
import { useRecoilState } from 'recoil';

import useI18N from '@/i18n';
import langState from '@/store/lang';

import './style.less';

interface EFTWatcherProps {
  directoryHandler?: FileSystemDirectoryHandle;
  /** 目录还记着，只差一次用户手势去拿授权。 */
  directoryPending?: boolean;
  /** 目录句柄的恢复流程是否已经结束。为 false 时不自动弹窗，避免闪一下。 */
  ready?: boolean;
  onClickEftWatcherPath: () => void;
}

/** 未绑定 / 待授权 / 已监听 三态的按钮颜色。 */
const stateColor = (active: boolean, pending?: boolean) => {
  if (active) return '#288828';
  if (pending) return '#ffff88';
  return '#ffffff';
};

/** 三态的按钮文案。待授权时提示「恢复」，让用户知道不用重新翻文件夹。 */
const stateLabel = (
  active: boolean,
  pending: boolean | undefined,
  labels: { active: string; pending: string; idle: string },
) => {
  if (active) return labels.active;
  if (pending) return labels.pending;
  return labels.idle;
};

const Index = (props: EFTWatcherProps) => {
  const { directoryHandler, directoryPending, ready, onClickEftWatcherPath } = props;

  const [show, setShow] = useState(false);

  const [lang] = useRecoilState(langState);

  const { t } = useI18N(lang);

  const handleCloseModal = () => {
    if (!window.showDirectoryPicker) {
      setShow(false);
    }
  };

  const handleClickEftWatcherPath = () => {
    onClickEftWatcherPath();
  };

  useEffect(() => {
    if (directoryHandler) {
      setShow(false);
    }
  }, [directoryHandler]);

  useEffect(() => {
    if (self !== top || !ready) {
      return;
    }
    // 等目录恢复的结果出来再决定要不要弹。
    // 截图目录已经恢复好的用户不需要再看这个引导；不支持该 API 的浏览器仍然要看到说明。
    if (!directoryHandler) {
      setShow(true);
    }
  }, [ready]);

  return (
    <div
      className={classNames('im-eftwatcher-modal', {
        active: show,
      })}
      onMouseDown={handleCloseModal}
    >
      <div className="im-eftwatcher" onMouseDown={(e) => e.stopPropagation()}>
        <div className="im-eftwatcher-title">
          <span>{t('eftwatcher.title')}</span>
        </div>
        <div className="im-eftwatcher-content">
          <span>{t('eftwatcher.tips1')}</span>
          <span>{t('eftwatcher.tips3')}</span>
          <span style={{ color: '#ffff88' }}>{t('eftwatcher.tips4')}</span>
          {/* 轻提示而非强引导：不装也能用，装了目录授权可长期保留。 */}
          <span style={{ color: '#88ccff' }}>{t('eftwatcher.tips6')}</span>
        </div>
        <div className="im-eftwatcher-buttons">
          {window.showDirectoryPicker ? (
            <button
              style={{ color: stateColor(!!directoryHandler, directoryPending) }}
              className="button button-default"
              onClick={() => handleClickEftWatcherPath()}
            >
              {stateLabel(!!directoryHandler, directoryPending, {
                active: t('eftwatcher.disableScrPath'),
                pending: t('eftwatcher.resumeScrPath'),
                idle: t('eftwatcher.enableScrPath'),
              })}
            </button>
          ) : (
            <button className="button button-default">{t('eftwatcher.unsupport')}</button>
          )}
          <button
            style={{ marginTop: 16 }}
            className="button button-default"
            onClick={() => setShow(false)}
          >
            {t('eftwatcher.later')}
          </button>
        </div>
        <div className="im-eftwatcher-contacts">
          <span>{t('contact.email')}</span>
        </div>
      </div>
    </div>
  );
};

export default Index;
