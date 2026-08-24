const DEFAULT_DAY_CACHE_LIMIT = 32;

export function normalizeDayTimestamp(value) {
  const date = new Date(Number(value));
  if (!Number.isFinite(date.getTime())) return 0;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function dayViewRevision(settings = {}, runtime = {}) {
  const analysis = runtime.smartAnalysis || {};
  return [
    String(settings.language || ""),
    String(settings.analysisEngine || "builtin"),
    Number(settings.retentionHours || 0),
    Number(settings.intentRulesChangedAt || 0),
    Number(analysis.signal?.lastRunAt || 0),
    Number(analysis.semantic?.lastRunAt || 0),
  ].join(":");
}

export function selectedDayRefreshToken(selectedDay, lastEventAt, eventCount = 0) {
  const observedAt = new Date(lastEventAt || 0).getTime();
  if (!Number.isFinite(observedAt) || normalizeDayTimestamp(observedAt) !== normalizeDayTimestamp(selectedDay)) return "historical";
  return `${observedAt}:${Math.max(0, Number(eventCount || 0))}`;
}

export function createDayViewCache(limit = DEFAULT_DAY_CACHE_LIMIT) {
  const entries = new Map();
  const maximum = Math.max(2, Math.min(370, Number(limit) || DEFAULT_DAY_CACHE_LIMIT));
  const keyFor = (day, revision = "") => `${normalizeDayTimestamp(day)}|${String(revision)}`;
  return {
    get(day, revision = "") {
      const key = keyFor(day, revision);
      if (!entries.has(key)) return null;
      const value = entries.get(key);
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(day, revision = "", value = null) {
      if (!value || !Array.isArray(value.sessions)) return null;
      const key = keyFor(day, revision);
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > maximum) entries.delete(entries.keys().next().value);
      return value;
    },
    clear() { entries.clear(); },
    size() { return entries.size; },
  };
}

export function nextActivityLimit(current, total, batch = 12) {
  const maximum = Math.max(0, Number(total) || 0);
  const step = Math.max(1, Number(batch) || 12);
  return Math.min(maximum, Math.max(step, (Number(current) || 0) + step));
}
