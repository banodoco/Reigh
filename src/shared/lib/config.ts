// Centralized runtime configuration with sensible defaults

export const runtimeConfig = {
  REALTIME_ENABLED: (() => {
    try {
      const v = (import.meta as any)?.env?.VITE_REALTIME_ENABLED;
      if (typeof v === 'string') return v !== 'false' && v !== '0';
    } catch {}
    return true; // default ON
  })(),

  LEGACY_LISTENERS_ENABLED: (() => {
    try {
      const v = (import.meta as any)?.env?.VITE_LEGACY_LISTENERS_ENABLED;
      if (typeof v === 'string') return v === 'true' || v === '1';
    } catch {}
    return false; // default OFF
  })(),

  DEADMODE_FORCE_POLLING_MS: (() => {
    try {
      const v = (import.meta as any)?.env?.VITE_DEADMODE_FORCE_POLLING_MS;
      const n = v != null ? Number(v) : NaN;
      if (!Number.isNaN(n) && n > 0) return n;
    } catch {}
    return undefined;
  })(),
};

export function addJitter(baseMs: number, jitterMs: number = 1000): number {
  const delta = Math.floor((Math.random() * 2 - 1) * jitterMs);
  return Math.max(0, baseMs + delta);
}


