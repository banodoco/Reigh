// Lightweight logging helper that can be enabled/disabled via Vite env
// Usage:
//   import { log, time, timeEnd } from '@/shared/lib/logger';
//   log('MyTag', 'Some message', optionalData);
//   time('MyTag', 'expensive-operation');
//   ...do work...
//   timeEnd('MyTag', 'expensive-operation');
//
// Logs are only printed when `VITE_DEBUG_LOGS` is set to `true`.
// This avoids polluting the console in production while still allowing
// rich diagnostics for performance investigations.
//
// All logs share the same shape so they can be filtered easily.
// Tag format guideline (keep short & consistent):
//   [Area][Specific] e.g. [TaskPoller], [Render:GenerationsPane]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shouldLog(): boolean {
  // Browser via Vite uses import.meta.env; Node uses process.env.
  // We defensively read from both to allow shared usage.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const flag = (typeof import.meta !== 'undefined' && import.meta.env) ? (import.meta.env.VITE_DEBUG_LOGS as string | undefined) : process.env.VITE_DEBUG_LOGS;
  return flag === 'true' || flag === '1';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function log(tag: string, ...args: any[]): void {
  if (!shouldLog()) return;
  // Group for easier collapsing in DevTools
  // Chrome automatically collapses identical consecutive console.log lines when groupCollapsed is used.
  // We want a simple prefix though, so stick with ordinary log.
  // Tag is wrapped in [] to make it searchable.
  // eslint-disable-next-line no-console
  console.log(`[${tag}]`, ...args);
}

export function time(tag: string, label: string): void {
  if (!shouldLog()) return;
  // eslint-disable-next-line no-console
  console.time(`[${tag}] ${label}`);
}

export function timeEnd(tag: string, label: string): void {
  if (!shouldLog()) return;
  // eslint-disable-next-line no-console
  console.timeEnd(`[${tag}] ${label}`);
}

// Dedicated onRender callback for React Profiler so callers don't need to re-implement it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function reactProfilerOnRender(...rawArgs: any[]): void {
  const [id, phase, actualDuration, baseDuration, startTime, commitTime, interactions] = rawArgs;
  log('ReactProfiler', {
    id,
    phase,
    actualDuration: `${actualDuration?.toFixed?.(2) ?? actualDuration}ms`,
    baseDuration: `${baseDuration?.toFixed?.(2) ?? baseDuration}ms`,
    startTime: `${startTime?.toFixed?.(2) ?? startTime}ms`,
    commitTime: `${commitTime?.toFixed?.(2) ?? commitTime}ms`,
    interactionsCount: interactions?.size ?? 0,
  });
} 