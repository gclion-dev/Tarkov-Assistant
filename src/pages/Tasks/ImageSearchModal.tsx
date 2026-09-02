import { ChangeEvent, DragEvent, useCallback, useMemo, useRef, useState } from 'react';

import classNames from 'classnames';

import { CatalogTask } from '@/data/taskCatalog';
import { getErrorMessage } from '@/features/auth/services/http';
import { MAX_CURRENT_TASKS } from '@/features/preferences/types';
import {
  ACCEPT_TYPES,
  compressImageToDataUrl,
  MAX_SOURCE_BYTES,
} from '@/features/tasks/services/compressImage';
import { searchTasksByImages } from '@/features/tasks/services/imageSearchApi';
import useI18N from '@/i18n';

import './imageSearchModal.less';

/** 与服务端 validators.ts 的 MAX_IMAGES 保持一致。 */
const MAX_IMAGES = 5;
const ACCEPT_TYPE_SET = new Set<string>(ACCEPT_TYPES);

export interface AddTasksResult {
  /** 实际新加入当前任务的数量。 */
  added: number;
  /** 识别到但本来就在当前任务里的数量。 */
  already: number;
  /** 因为当前任务已满而没能加入的数量。 */
  overLimit: number;
}

interface ImageSearchModalProps {
  lang: string;
  tasks: CatalogTask[];
  currentTaskIds: string[];
  onAddTasks: (ids: string[]) => AddTasksResult;
  onClose: () => void;
}

type Phase = 'idle' | 'loading' | 'done' | 'error';

interface PickedImage {
  id: number;
  dataUrl: string;
}

const ImageSearchModal = ({
  lang,
  tasks,
  currentTaskIds,
  onAddTasks,
  onClose,
}: ImageSearchModalProps) => {
  const { t } = useI18N(lang);
  const inputRef = useRef<HTMLInputElement>(null);
  // 带 id 是为了让预览列表有稳定的 key：删掉中间一张时不该让其余预览重新挂载。
  const [images, setImages] = useState<PickedImage[]>([]);
  const nextImageId = useRef(0);
  const [compressing, setCompressing] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [matchedTasks, setMatchedTasks] = useState<CatalogTask[]>([]);
  const [summary, setSummary] = useState('');
  const [addResult, setAddResult] = useState<AddTasksResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // 目录有 500+ 条，别在每次 render 时重建。
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const slotsLeft = MAX_CURRENT_TASKS - currentTaskIds.length;

  const appendFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) {
        return;
      }
      setError('');
      setCompressing(true);
      try {
        const next: PickedImage[] = [];
        for (const file of list) {
          if (images.length + next.length >= MAX_IMAGES) {
            setError(t('tasks.imageSearchMaxImages').replace('{n}', String(MAX_IMAGES)));
            break;
          }
          if (!ACCEPT_TYPE_SET.has(file.type)) {
            setError(t('tasks.imageSearchInvalidType'));
            continue;
          }
          if (file.size > MAX_SOURCE_BYTES) {
            setError(
              t('tasks.imageSearchTooLarge').replace(
                '{n}',
                String(Math.round(MAX_SOURCE_BYTES / 1024 / 1024)),
              ),
            );
            continue;
          }
          try {
            // 压缩到 1600px / JPEG，避免把十几 MB 的原图直接传上去。
            const dataUrl = await compressImageToDataUrl(file);
            nextImageId.current += 1;
            next.push({ id: nextImageId.current, dataUrl });
          } catch {
            setError(t('tasks.imageSearchReadError'));
          }
        }
        if (next.length > 0) {
          setImages((prev) => [...prev, ...next].slice(0, MAX_IMAGES));
        }
      } finally {
        setCompressing(false);
      }
    },
    [images.length, t],
  );

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      appendFiles(e.target.files).catch(() => undefined);
      e.target.value = '';
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) {
      appendFiles(e.dataTransfer.files).catch(() => undefined);
    }
  };

  const handleAnalyze = async () => {
    if (images.length === 0 || phase === 'loading' || compressing) {
      return;
    }
    setPhase('loading');
    setError('');
    setMatchedTasks([]);
    setSummary('');
    setAddResult(null);
    try {
      const result = await searchTasksByImages(images.map((item) => item.dataUrl));
      const matched = result.taskIds
        .map((id) => taskById.get(id))
        .filter((task): task is CatalogTask => Boolean(task));
      setMatchedTasks(matched);
      setSummary(result.summary);
      setAddResult(onAddTasks(result.taskIds));
      setPhase('done');
    } catch (err) {
      setError(getErrorMessage(err, t('tasks.imageSearchFailed')));
      setPhase('error');
    }
  };

  const removeImage = (id: number) => {
    setImages((prev) => prev.filter((item) => item.id !== id));
  };

  const busy = compressing || phase === 'loading';

  return (
    <div className="tasks-image-modal-mask" onClick={onClose}>
      <div
        className="tasks-image-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('tasks.imageSearch')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tasks-image-modal-head">
          <h2>{t('tasks.imageSearch')}</h2>
          <button
            type="button"
            className="tasks-image-modal-close"
            aria-label={t('tasks.imageSearchCancel')}
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <p className="tasks-image-modal-desc">{t('tasks.imageSearchHint')}</p>

        <div
          className={classNames('tasks-image-modal-drop', { active: dragOver })}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_TYPES.join(',')}
            multiple
            hidden
            onChange={handleFileChange}
          />
          <span>{t('tasks.imageSearchDrop')}</span>
          <span className="tasks-image-modal-drop-meta">
            {t('tasks.imageSearchDropMeta').replace('{n}', String(MAX_IMAGES))}
          </span>
        </div>

        {images.length > 0 && (
          <div className="tasks-image-modal-previews">
            {images.map((item) => (
              <div key={item.id} className="tasks-image-modal-preview">
                <img src={item.dataUrl} alt="" />
                <button
                  type="button"
                  className="tasks-image-modal-preview-remove"
                  aria-label={t('tasks.imageSearchRemove')}
                  onClick={() => removeImage(item.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {slotsLeft <= 0 && (
          <p className="tasks-image-modal-warn">
            {t('tasks.currentLimit').replace('{n}', String(MAX_CURRENT_TASKS))}
          </p>
        )}

        {error && <p className="tasks-image-modal-error">{error}</p>}

        {compressing && (
          <p className="tasks-image-modal-status">{t('tasks.imageSearchCompressing')}</p>
        )}
        {phase === 'loading' && (
          <p className="tasks-image-modal-status">{t('tasks.imageSearchLoading')}</p>
        )}

        {phase === 'done' && (
          <div className="tasks-image-modal-result">
            {summary && <p className="tasks-image-modal-summary">{summary}</p>}
            {matchedTasks.length === 0 ? (
              <p className="tasks-image-modal-empty">{t('tasks.imageSearchNoMatch')}</p>
            ) : (
              <>
                <p className="tasks-image-modal-result-title">
                  {t('tasks.imageSearchMatched').replace('{n}', String(matchedTasks.length))}
                </p>
                <ul className="tasks-image-modal-matches">
                  {matchedTasks.map((task) => (
                    <li key={task.id}>
                      <img src={task.image} alt="" />
                      <div>
                        <div className="tasks-image-modal-match-name">{task.name}</div>
                        <div className="tasks-image-modal-match-meta">{task.traderName}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {addResult && addResult.added > 0 && (
              <p className="tasks-image-modal-added">
                {t('tasks.imageSearchAdded').replace('{n}', String(addResult.added))}
              </p>
            )}
            {addResult && addResult.already > 0 && (
              <p className="tasks-image-modal-status">
                {t('tasks.imageSearchAlready').replace('{n}', String(addResult.already))}
              </p>
            )}
            {addResult && addResult.overLimit > 0 && (
              <p className="tasks-image-modal-warn">
                {t('tasks.imageSearchOverLimit')
                  .replace('{n}', String(addResult.overLimit))
                  .replace('{max}', String(MAX_CURRENT_TASKS))}
              </p>
            )}
          </div>
        )}

        <div className="tasks-image-modal-actions">
          <button type="button" onClick={onClose}>
            {phase === 'done' ? t('tasks.imageSearchDone') : t('tasks.imageSearchCancel')}
          </button>
          <button
            type="button"
            className="primary"
            disabled={images.length === 0 || busy || slotsLeft <= 0}
            onClick={() => {
              handleAnalyze().catch(() => undefined);
            }}
          >
            {phase === 'loading' ? t('tasks.imageSearchLoading') : t('tasks.imageSearchAnalyze')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageSearchModal;
