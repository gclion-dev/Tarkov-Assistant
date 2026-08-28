export interface MapTaskQuestItem {
  id: string;
  name: string;
  shortName: string;
  image: string;
}

export interface MapTaskObjective {
  id: string;
  type: string;
  description: string;
  questItem?: MapTaskQuestItem;
  possibleLocations?: Array<{
    mapId: string;
    positions: InteractiveMap.Position[];
  }>;
  zones?: InteractiveMap.TaskZone[];
}

export interface MapTask {
  id: string;
  name: string;
  normalizedName: string;
  objectives: MapTaskObjective[];
}

interface JsonTasksPayload {
  data: {
    tasks: Record<string, any>;
    questItems?: Record<string, any>;
  };
}

const translate = (dict: Record<string, string>, value?: string | null) => {
  if (!value) {
    return '';
  }
  return dict[value] || value;
};

const asMapId = (value: any) => {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return value.id || '';
};

export const transformTasks = (
  payload: JsonTasksPayload,
  zh: Record<string, string> = {},
): MapTask[] => {
  const { tasks, questItems = {} } = payload.data || { tasks: {}, questItems: {} };
  return Object.values(tasks || {})
    .map((task: any) => {
      const objectives = (task.objectives || [])
        .map((obj: any) => {
          const questItemId = typeof obj.questItem === 'string' ? obj.questItem : obj.questItem?.id;
          const questItem = questItemId ? questItems[questItemId] : undefined;
          const possibleLocations = (obj.possibleLocations || [])
            .map((loc: any) => ({
              mapId: asMapId(loc.map),
              positions: loc.positions || [],
            }))
            .filter((loc: { mapId: string; positions: InteractiveMap.Position[] }) => {
              return loc.mapId && loc.positions.length > 0;
            });
          const zones = (obj.zones || [])
            .map((zone: any) => ({
              id: zone.id,
              mapId: asMapId(zone.map),
              position: zone.position,
              outline: zone.outline || [],
              top: zone.top,
              bottom: zone.bottom,
            }))
            .filter((zone: InteractiveMap.TaskZone) => zone.mapId && zone.position);
          if (!possibleLocations.length && !zones.length) {
            return null;
          }
          const objective: MapTaskObjective = {
            id: obj.id,
            type: obj.type,
            description: translate(zh, obj.description) || obj.description,
            questItem: questItem
              ? {
                id: questItem.id || questItemId,
                name: translate(zh, questItem.name) || questItem.normalizedName || questItem.id,
                shortName: translate(zh, questItem.shortName) || questItem.shortName || '',
                image: questItem.baseImageLink || questItem.iconLink || '',
              }
              : undefined,
            possibleLocations,
            zones,
          };
          return objective;
        })
        .filter((objective: MapTaskObjective | null): objective is MapTaskObjective => {
          return Boolean(objective);
        });
      return {
        id: task.id,
        name: translate(zh, task.name) || task.normalizedName || task.id,
        normalizedName: task.normalizedName || task.id,
        objectives,
      };
    })
    .filter((task) => task.objectives.length);
};
