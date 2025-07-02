export function sanitizeSettings(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeSettings);
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    cleaned[k] = sanitizeSettings(v);
  }
  return cleaned;
}

export function deepEqual(a: any, b: any): boolean {
  return JSON.stringify(sanitizeSettings(a)) === JSON.stringify(sanitizeSettings(b));
} 