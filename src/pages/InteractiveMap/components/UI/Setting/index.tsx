import { useRecoilState } from 'recoil';

import useI18N from '@/i18n';
import langState from '@/store/lang';

import './style.less';

export interface SettingProps {
  directoryHandler?: FileSystemDirectoryHandle;
  tarkovGamePathHandler?: FileSystemDirectoryHandle;
  /** 目录还记着，只差一次用户手势去拿授权。 */
  directoryPending?: boolean;
  tarkovGamePathPending?: boolean;
  locationScale: boolean;
  onClickEftWatcherPath: () => void;
  onClickTarkovGamePathPath: () => void;
  onLocationScaleChange: (b: boolean) => void;
}

/** 未绑定 / 待授权 / 已监听 三态的按钮颜色。 */
const stateColor = (active: boolean, pending?: boolean) => {
  if (active) return '#288828';
  if (pending) return '#ffff88';
  return '#ffffff';
};

/** 三态的按钮文案。已绑定时附上目录名，待授权时提示点击恢复。 */
const stateLabel = (
  active: boolean,
  pending: boolean | undefined,
  labels: { active: string; pending: string; idle: string },
) => {
  if (active) return labels.active;
  if (pending) return labels.pending;
  return labels.idle;
};

const Index = (props: SettingProps) => {
  const {
    locationScale,
    directoryHandler,
    tarkovGamePathHandler,
    directoryPending,
    tarkovGamePathPending,
    onLocationScaleChange,
    onClickEftWatcherPath,
    onClickTarkovGamePathPath,
  } = props;

  const [lang] = useRecoilState(langState);

  const { t } = useI18N(lang);

  const handleClickEftWatcherPath = () => {
    onClickEftWatcherPath();
  };

  const handleClickTarkovGamePathPath = () => {
    onClickTarkovGamePathPath();
  };

  const handleToggleLocationScale = () => {
    onLocationScaleChange(!locationScale);
  };

  return (
    <div className="im-quicktools-modal-setting" onMouseDown={(e) => e.stopPropagation()}>
      <div className="im-quicktools-modal-setting-title">
        <span>{t('setting.title')}</span>
      </div>
      <div className="im-quicktools-modal-setting-block">
        {self === top && (
          <button
            className="im-quicktools-modal-setting-button"
            style={{ color: stateColor(!!directoryHandler, directoryPending) }}
            onClick={handleClickEftWatcherPath}
          >
            {stateLabel(!!directoryHandler, directoryPending, {
              active: `${t('setting.realtimeMarker')} ${directoryHandler?.name}`,
              pending: t('setting.resumeMarker'),
              idle: t('setting.enableMarker'),
            })}
          </button>
        )}
        {self === top && (
          <button
            className="im-quicktools-modal-setting-button"
            style={{ color: stateColor(!!tarkovGamePathHandler, tarkovGamePathPending) }}
            onClick={handleClickTarkovGamePathPath}
          >
            {stateLabel(!!tarkovGamePathHandler, tarkovGamePathPending, {
              active: `${t('setting.tarkovGamePath')} ${tarkovGamePathHandler?.name}`,
              pending: t('setting.resumeTarkovGamePath'),
              idle: t('setting.enableTarkovGamePath'),
            })}
          </button>
        )}
        <button
          style={{ color: !locationScale ? '#882828' : '#288828' }}
          className="im-quicktools-modal-setting-button"
          onClick={handleToggleLocationScale}
        >
          {t('setting.markerScale')} ({locationScale ? t('common.enable') : t('common.disable')})
        </button>
      </div>
    </div>
  );
};

export default Index;
