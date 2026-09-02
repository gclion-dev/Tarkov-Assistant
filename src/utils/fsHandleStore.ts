/**
 * 目录句柄的本地持久化。
 *
 * FileSystemDirectoryHandle 只支持 structured clone，无法 JSON 序列化，
 * 因此既存不进 localStorage，也发不到服务端 —— IndexedDB 是唯一选择。
 * 它同时和 origin + 浏览器 profile 绑定，跨设备本身就没有意义。
 */

const DB_NAME = 'tarkov-assistant';
const DB_VERSION = 1;
const STORE_NAME = 'fs-handles';

export const FS_HANDLE_KEYS = {
  /** 塔科夫截图目录，用于自动获取坐标。 */
  screenshotDir: 'eft-screenshot-dir',
  /** 塔科夫游戏目录，用于读取日志、获取战局信息。 */
  gameDir: 'eft-game-dir',
} as const;

export type FsHandleKey = (typeof FS_HANDLE_KEYS)[keyof typeof FS_HANDLE_KEYS];

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = () => {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('当前环境不支持 IndexedDB'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
          req.result.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      // 另一个标签页正在做版本升级时会被阻塞，直接失败让调用方走「未绑定」分支。
      req.onblocked = () => reject(new Error('IndexedDB 被其他标签页阻塞'));
    }).catch((err) => {
      // 失败后允许下次重试，不要把 rejected promise 永久缓存下来。
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
};

const withStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const req = run(tx.objectStore(STORE_NAME));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.onabort = () => reject(tx.error);
  });
};

export const saveHandle = async (key: FsHandleKey, handle: FileSystemHandle) => {
  try {
    await withStore('readwrite', (store) => store.put(handle, key));
  } catch (err) {
    // 存不下只影响「刷新后免重绑」这个便利，当前会话依然可用，不该打断用户。
    console.warn('[fsHandleStore] 保存目录句柄失败：', err);
  }
};

export const loadHandle = async (
  key: FsHandleKey,
): Promise<FileSystemDirectoryHandle | undefined> => {
  try {
    const value = await withStore<unknown>('readonly', (store) => store.get(key) as IDBRequest);
    // 结构化克隆回来的对象需要确认还是个句柄：浏览器换版本或用户清了数据都可能拿到脏值。
    if (value && typeof (value as FileSystemDirectoryHandle).queryPermission === 'function') {
      return value as FileSystemDirectoryHandle;
    }
    return undefined;
  } catch (err) {
    console.warn('[fsHandleStore] 读取目录句柄失败：', err);
    return undefined;
  }
};

export const removeHandle = async (key: FsHandleKey) => {
  try {
    await withStore('readwrite', (store) => store.delete(key));
  } catch (err) {
    console.warn('[fsHandleStore] 删除目录句柄失败：', err);
  }
};

export type HandlePermissionState = 'granted' | 'prompt' | 'denied' | 'unsupported';

/**
 * 查询句柄当前的读权限。
 *
 * F5 刷新时权限通常还在（浏览器的授权在该 origin 还有标签页存在期间有效），
 * 所以这里大概率返回 granted，可以零点击直接恢复监听。
 * 关掉所有标签后重开则会是 prompt，需要一次用户手势才能 requestPermission。
 */
export const queryHandlePermission = async (
  handle: FileSystemDirectoryHandle,
): Promise<HandlePermissionState> => {
  if (typeof handle.queryPermission !== 'function') {
    return 'unsupported';
  }
  try {
    return (await handle.queryPermission({ mode: 'read' })) as HandlePermissionState;
  } catch {
    return 'denied';
  }
};

/** 必须在用户手势（点击等）中调用，否则浏览器会直接拒绝。 */
export const requestHandlePermission = async (
  handle: FileSystemDirectoryHandle,
): Promise<HandlePermissionState> => {
  if (typeof handle.requestPermission !== 'function') {
    return 'unsupported';
  }
  try {
    return (await handle.requestPermission({ mode: 'read' })) as HandlePermissionState;
  } catch {
    return 'denied';
  }
};
