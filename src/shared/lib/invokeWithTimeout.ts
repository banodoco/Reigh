import { supabase } from '@/integrations/supabase/client';

type InvokeOptions = {
  body?: any;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
};

/**
 * Calls supabase.functions.invoke with a client-side timeout and abort propagation.
 * Ensures long-running invocations do not stall the UI indefinitely.
 */
export async function invokeWithTimeout<T = any>(functionName: string, options: InvokeOptions = {}): Promise<T> {
  const { body, headers, timeoutMs = 20000, signal } = options;

  const controller = new AbortController();
  const signals: AbortSignal[] = [];
  if (signal) signals.push(signal);
  signals.push(controller.signal);

  // Compose signals: abort if any provided signal aborts
  const composed = new AbortController();
  const onAbort = () => composed.abort();
  signals.forEach(s => {
    if (s.aborted) composed.abort();
    else s.addEventListener('abort', onAbort, { once: true });
  });

  const tid = setTimeout(() => {
    try { controller.abort(); } catch {}
  }, timeoutMs);

  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
      headers,
      signal: composed.signal,
    });
    if (error) {
      throw new Error(error.message || `Function ${functionName} failed`);
    }
    return data as T;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Function ${functionName} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(tid);
  }
}


