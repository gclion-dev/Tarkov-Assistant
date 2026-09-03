import type { CatalogTask } from '@/data/taskCatalog';
import type { MapTask } from '@/data/transformTasks';

import type { RoutePlanLocationInput } from './routePlanApi';

const CLUSTER = 12;

export const collectRouteLocations = (
  tasks: CatalogTask[],
  mapTasks: MapTask[],
  mapId: string,
): RoutePlanLocationInput[] => {
  const mapTaskById = new Map(mapTasks.map((task) => [task.id, task]));
  const locations: RoutePlanLocationInput[] = [];
  let index = 0;

  tasks.forEach((task) => {
    if (!task.mapIds.includes(mapId)) {
      return;
    }
    const mapTask = mapTaskById.get(task.id);
    if (!mapTask) {
      return;
    }
    const seen = new Set<string>();
    const push = (
      x: number,
      y: number,
      z: number,
      type: string,
      description: string,
    ) => {
      if (!Number.isFinite(x) || !Number.isFinite(z)) {
        return;
      }
      const bucket = `${Math.round(x / CLUSTER)}_${Math.round(z / CLUSTER)}`;
      if (seen.has(bucket)) {
        return;
      }
      seen.add(bucket);
      locations.push({
        key: `n${index}`,
        taskId: task.id,
        type,
        description: (description || '').slice(0, 160),
        x,
        y: Number.isFinite(y) ? y : 0,
        z,
      });
      index += 1;
    };

    mapTask.objectives.forEach((objective) => {
      objective.zones
        ?.filter((zone) => zone.mapId === mapId && zone.position)
        .forEach((zone) => {
          push(
            zone.position.x,
            zone.position.y,
            zone.position.z,
            objective.type,
            objective.description,
          );
        });
      objective.possibleLocations
        ?.filter((loc) => loc.mapId === mapId)
        .forEach((loc) => {
          loc.positions.forEach((position) => {
            push(position.x, position.y, position.z, objective.type, objective.description);
          });
        });
    });
  });

  return locations.slice(0, 80);
};
