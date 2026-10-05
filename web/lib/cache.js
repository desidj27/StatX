const store = new Map();

export function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return hit.value;
}

export function cacheSet(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export async function cacheGetOrSet(key, ttlMs, loader) {
  const existing = cacheGet(key);
  if (existing !== undefined) return existing;
  const value = await loader();
  return cacheSet(key, value, ttlMs);
}
