import compactCatalog from '../data/tasks-compact.json' with { type: 'json' };

/** 喂给大模型做匹配的最小任务信息。 */
export interface CompactTask {
  id: string;
  name: string;
  trader: string;
  maps: string[];
  objectives: string[];
}

/**
 * 任务目录由服务端持有，不接受调用方上传。
 *
 * 两个原因：目录是 100KB 级的静态数据，每次请求重传纯属浪费；
 * 更重要的是它会被拼进 prompt，一旦允许上传，本接口就等于一个可注入的通用大模型代理。
 *
 * 数据由 `npm run update-tasks` 从 json.tarkov.dev 拉取后生成，
 * 因此更新游戏数据时要重新构建 room-server 镜像。
 */
const catalog: CompactTask[] = (compactCatalog as CompactTask[]).filter(
  (task) => task && typeof task.id === 'string' && task.id.length > 0 && Boolean(task.name),
);

const catalogIds = new Set(catalog.map((task) => task.id));

export const getTaskCatalog = () => catalog;

/** 模型可能凭空编 id，返回结果必须过这一层白名单。 */
export const isKnownTaskId = (id: string) => catalogIds.has(id);

export const taskCatalogSize = catalog.length;
