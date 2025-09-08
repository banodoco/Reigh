// Corruption timeline ring buffer and helper

export let __CORRUPTION_TIMELINE__: Array<{ event: string; timestamp: number; data: any; stack?: string }> = [];

export function addCorruptionEvent(event: string, data: any = {}) {
  __CORRUPTION_TIMELINE__.push({
    event,
    timestamp: Date.now(),
    data,
    stack: new Error().stack?.split('\n').slice(2, 5).join(' -> ')
  });
  if (__CORRUPTION_TIMELINE__.length > 100) __CORRUPTION_TIMELINE__.shift();
}


