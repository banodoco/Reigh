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

export function deepMerge(target: any, source: any): any {
  if (!source) return target;
  if (!target) return source;
  
  const output = { ...target };
  
  Object.keys(source).forEach(key => {
    if (source[key] === undefined) return;
    
    // Special handling for arrays - always deep clone to prevent reference sharing
    if (Array.isArray(source[key])) {
      // For arrays, we replace entirely but deep clone to prevent mutations
      output[key] = JSON.parse(JSON.stringify(source[key]));
    } else if (typeof source[key] === 'object' && source[key] !== null) {
      // For objects (but not arrays), merge recursively
      output[key] = deepMerge(target[key], source[key]);
    } else {
      // For primitives, just assign the value
      output[key] = source[key];
    }
  });
  
  return output;
} 