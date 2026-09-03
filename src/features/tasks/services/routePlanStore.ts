import type { GeneratedRoutePlan } from './routePlanApi';

const PREFIX = 'tarkov-route-plan:';
const TTL_MS = 6 * 60 * 60 * 1000;

interface StoredPlan {
  plan: GeneratedRoutePlan;
  expires: number;
}

export const saveRoutePlan = (plan: GeneratedRoutePlan) => {
  const id = crypto.randomUUID();
  const payload: StoredPlan = { plan, expires: Date.now() + TTL_MS };
  try {
    localStorage.setItem(`${PREFIX}${id}`, JSON.stringify(payload));
  } catch {
    // 配额或隐私模式写失败时，新标签页读不到方案，调用方仍会打开地图。
  }
  return id;
};

export const readRoutePlan = (id: string): GeneratedRoutePlan | null => {
  if (!id || /[^a-zA-Z0-9-]/.test(id)) {
    return null;
  }
  try {
    const raw = localStorage.getItem(`${PREFIX}${id}`);
    if (!raw) {
      return null;
    }
    const stored = JSON.parse(raw) as StoredPlan;
    if (!stored?.plan || typeof stored.expires !== 'number' || stored.expires < Date.now()) {
      localStorage.removeItem(`${PREFIX}${id}`);
      return null;
    }
    return stored.plan;
  } catch {
    return null;
  }
};

export const clearRoutePlan = (id: string) => {
  if (!id || /[^a-zA-Z0-9-]/.test(id)) {
    return;
  }
  localStorage.removeItem(`${PREFIX}${id}`);
};
