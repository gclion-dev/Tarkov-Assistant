import { atom } from 'recoil';

import type { MapMark } from '@/features/room/types';

/**
 * 自己在地图上打的坐标标记。
 *
 * 只存自己的那一份：队友的标记随 room:state 下发，直接从 roomState 里读，
 * 两边合并成一个列表会在断线重连时产生重复项。
 *
 * 和画笔笔迹一样是会话内数据，不进偏好：标记是一局战局内的临时战术信息，
 * 而且偏好 payload 有 8KB 的服务端上限，不适合承载会持续增长的列表。
 */
const mapMarkState = atom<MapMark[]>({
  key: 'mapMarkState',
  default: [],
});

export default mapMarkState;
