/**
 * Global Settings Write Queue
 * 
 * Prevents network exhaustion by serializing and coalescing settings writes.
 * 
 * Features:
 * - Global concurrency limit (default: 1 in-flight write)
 * - Per-target debouncing (coalesces rapid updates)
 * - Merge-on-write (latest patch wins per field)
 * - Best-effort flush on page unload
 * 
 * @see settings_system.md for the full settings architecture
 */

export interface QueuedWrite {
  scope: 'user' | 'project' | 'shot';
  entityId: string;
  toolId: string;
  patch: Record<string, unknown>;
}

interface PendingWrite {
  write: QueuedWrite;
  resolvers: Array<{ resolve: (value: any) => void; reject: (error: any) => void }>;
  timerId: NodeJS.Timeout | null;
  enqueuedAt: number;
}

// Configuration
const DEBOUNCE_MS = 300;
const MAX_CONCURRENT = 1;

// State
const pendingByTarget = new Map<string, PendingWrite>();
let inFlightCount = 0;
const flushQueue: Array<{ targetKey: string; pending: PendingWrite }> = [];

// The actual write function - injected to avoid circular imports
let writeFunction: ((write: QueuedWrite) => Promise<any>) | null = null;

/**
 * Set the write function that performs the actual DB update.
 * Must be called once at app init (in useToolSettings.ts).
 */
export function setSettingsWriteFunction(fn: (write: QueuedWrite) => Promise<any>) {
  writeFunction = fn;
}

/**
 * Create a unique key for deduplication
 */
function targetKey(write: QueuedWrite): string {
  return `${write.scope}:${write.entityId}:${write.toolId}`;
}

/**
 * Deep merge two objects (shallow merge of nested objects)
 */
function mergePatch(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  return { ...existing, ...incoming };
}

/**
 * Process the next item in the flush queue
 */
async function processQueue() {
  if (inFlightCount >= MAX_CONCURRENT || flushQueue.length === 0) {
    return;
  }

  const next = flushQueue.shift();
  if (!next) return;

  const { targetKey: key, pending } = next;
  
  // Remove from pending map (we're about to process it)
  pendingByTarget.delete(key);
  
  inFlightCount++;
  
  try {
    if (!writeFunction) {
      throw new Error('[SettingsWriteQueue] Write function not initialized');
    }
    
    console.log('[SettingsWriteQueue] 🚀 Flushing write:', {
      scope: pending.write.scope,
      entityId: pending.write.entityId?.substring(0, 8),
      toolId: pending.write.toolId,
      queuedFor: Date.now() - pending.enqueuedAt + 'ms',
    });
    
    const result = await writeFunction(pending.write);
    
    // Resolve all waiters
    for (const { resolve } of pending.resolvers) {
      resolve(result);
    }
  } catch (error) {
    console.error('[SettingsWriteQueue] ❌ Write failed:', error);
    
    // Reject all waiters
    for (const { reject } of pending.resolvers) {
      reject(error);
    }
  } finally {
    inFlightCount--;
    
    // Process next item
    processQueue();
  }
}

/**
 * Schedule a pending write for flush
 */
function scheduleFlush(key: string, pending: PendingWrite) {
  // Clear existing timer
  if (pending.timerId) {
    clearTimeout(pending.timerId);
    pending.timerId = null;
  }
  
  // Add to flush queue and process
  flushQueue.push({ targetKey: key, pending });
  processQueue();
}

/**
 * Enqueue a settings write.
 * 
 * Returns a promise that resolves when the write completes.
 * Multiple writes to the same target within the debounce window are merged.
 * 
 * @param write - The write to enqueue
 * @param mode - 'debounced' (default) waits for debounce window; 'immediate' flushes now
 */
export function enqueueSettingsWrite(
  write: QueuedWrite,
  mode: 'debounced' | 'immediate' = 'debounced'
): Promise<any> {
  const key = targetKey(write);
  
  return new Promise((resolve, reject) => {
    const existing = pendingByTarget.get(key);
    
    if (existing) {
      // Merge with existing pending write
      existing.write.patch = mergePatch(existing.write.patch, write.patch);
      existing.resolvers.push({ resolve, reject });
      
      console.log('[SettingsWriteQueue] ♻️ Merged with pending write:', {
        scope: write.scope,
        entityId: write.entityId?.substring(0, 8),
        toolId: write.toolId,
        pendingResolvers: existing.resolvers.length,
      });
      
      if (mode === 'immediate') {
        // Cancel debounce timer and flush now
        scheduleFlush(key, existing);
      }
      // else: existing timer will handle it
      
    } else {
      // Create new pending write
      const pending: PendingWrite = {
        write: { ...write, patch: { ...write.patch } },
        resolvers: [{ resolve, reject }],
        timerId: null,
        enqueuedAt: Date.now(),
      };
      
      pendingByTarget.set(key, pending);
      
      if (mode === 'immediate') {
        scheduleFlush(key, pending);
      } else {
        // Set debounce timer
        pending.timerId = setTimeout(() => {
          scheduleFlush(key, pending);
        }, DEBOUNCE_MS);
      }
    }
  });
}

/**
 * Flush all pending writes for a specific target immediately.
 */
export function flushTarget(scope: 'user' | 'project' | 'shot', entityId: string, toolId: string): Promise<any> | undefined {
  const key = `${scope}:${entityId}:${toolId}`;
  const pending = pendingByTarget.get(key);
  
  if (pending) {
    return new Promise((resolve, reject) => {
      pending.resolvers.push({ resolve, reject });
      scheduleFlush(key, pending);
    });
  }
  
  return undefined;
}

/**
 * Flush all pending writes immediately.
 * Best-effort: returns without waiting.
 */
export function flushAll(): void {
  for (const [key, pending] of pendingByTarget.entries()) {
    if (pending.timerId) {
      clearTimeout(pending.timerId);
      pending.timerId = null;
    }
    flushQueue.push({ targetKey: key, pending });
  }
  pendingByTarget.clear();
  processQueue();
}

/**
 * Get count of pending writes (for debugging)
 */
export function getPendingCount(): number {
  return pendingByTarget.size + flushQueue.length;
}

/**
 * Check if there are any pending writes for a target
 */
export function hasPendingWrite(scope: 'user' | 'project' | 'shot', entityId: string, toolId: string): boolean {
  const key = `${scope}:${entityId}:${toolId}`;
  return pendingByTarget.has(key) || flushQueue.some(item => item.targetKey === key);
}

// Best-effort flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushAll();
  });
}
