import { runtimeConfig } from '@/shared/lib/config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDebugEnabled = (): boolean => {
  try {
    // Opt-in flag; default to true in development if not specified
    const flag = (runtimeConfig as any)?.REALTIME_DEBUG;
    if (typeof flag === 'boolean') return flag;
    return import.meta?.env?.MODE !== 'production';
  } catch {
    return true;
  }
};

export function createLogger(tag: string) {
  const enabled = isDebugEnabled();
  const prefix = `[${tag}]`;

  const log = (level: LogLevel, ...args: any[]) => {
    if (!enabled && level === 'debug') return;
    const fn = level === 'debug' ? console.log : level === 'info' ? console.info : level === 'warn' ? console.warn : console.error;
    try {
      fn(prefix, ...args);
    } catch {
      // no-op
    }
  };

  return {
    debug: (...args: any[]) => log('debug', ...args),
    info: (...args: any[]) => log('info', ...args),
    warn: (...args: any[]) => log('warn', ...args),
    error: (...args: any[]) => log('error', ...args),
  };
}


