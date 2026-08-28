export interface SlimItem {
  id: string;
  name: string;
  shortName: string;
  image: string;
  category: string;
  categoryName: string;
  categoryImage?: string;
}

export const UNKNOWN_LOOT_CATEGORY = 'unknown';

const fallbackItem = (id: string): SlimItem => ({
  id,
  name: id,
  shortName: id,
  image: `https://assets.tarkov.dev/${id}-base-image.webp`,
  category: UNKNOWN_LOOT_CATEGORY,
  categoryName: '其他',
});

export const resolveLootLoose = (
  lootLoose: Array<{
    position: InteractiveMap.Position;
    itemIds?: string[];
    items?: SlimItem[];
  }> = [],
  items: Record<string, SlimItem> = {},
): InteractiveMap.LootLoose[] => {
  return lootLoose
    .filter((loot) => loot?.position)
    .map((loot) => {
      if (loot.items?.length) {
        return {
          position: loot.position,
          items: loot.items,
        };
      }
      const resolved = (loot.itemIds || []).map((id) => items[id] || fallbackItem(id));
      return {
        position: loot.position,
        items: resolved,
      };
    })
    .filter((loot) => loot.items.length > 0);
};

export const getLootCategories = (lootLoose: InteractiveMap.LootLoose[] = []) => {
  const byKey = new Map<string, { key: string; name: string; image?: string }>();
  lootLoose.forEach((loot) => {
    loot.items?.forEach((item) => {
      if (!byKey.has(item.category)) {
        byKey.set(item.category, {
          key: item.category,
          name: item.categoryName || item.category,
          image: item.categoryImage || item.image,
        });
      }
    });
  });
  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh'));
};
