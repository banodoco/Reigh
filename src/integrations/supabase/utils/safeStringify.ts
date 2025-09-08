// Safe JSON stringify with cycle handling for diagnostics

export function safeStringify(obj: any, maxDepth = 3): string {
  const seen = new WeakSet();
  const replacer = (key: string, value: any, depth = 0): any => {
    if (depth > maxDepth) return '[MAX_DEPTH_REACHED]';
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return '[CIRCULAR_REFERENCE]';
    seen.add(value);
    if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack?.split('\n').slice(0, 3) };
    if (value instanceof WebSocket) return { readyState: value.readyState, url: value.url };
    if (typeof value === 'function') return '[FUNCTION]';
    return value;
  };
  try {
    return JSON.stringify(obj, (key, value) => replacer(key, value), 2);
  } catch {
    return '[STRINGIFY_FAILED]';
  }
}


