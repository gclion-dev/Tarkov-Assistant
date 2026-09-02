/**
 * File System Access API 里 lib.dom.d.ts 尚未收录的部分。
 *
 * TypeScript 自带的 DOM 类型只有 FileSystemHandle / FileSystemDirectoryHandle 的基础成员，
 * 权限查询、目录迭代、目录选择器都缺失，改造前这些调用都是靠 `as any` 或直接报错绕过的。
 * 集中声明一次，让目录句柄持久化那部分代码能被正常类型检查。
 */

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission?(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>;
  requestPermission?(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>;
}

interface FileSystemDirectoryHandle {
  /** 异步迭代目录内容。lib.dom.d.ts 里没有，实际所有支持该 API 的浏览器都实现了。 */
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  keys(): AsyncIterableIterator<string>;
  values(): AsyncIterableIterator<FileSystemHandle>;
}

interface DirectoryPickerOptions {
  id?: string;
  mode?: 'read' | 'readwrite';
  startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
}

interface Window {
  /** 仅 Chromium 系浏览器提供，其他浏览器为 undefined，调用前必须判空。 */
  showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
}
