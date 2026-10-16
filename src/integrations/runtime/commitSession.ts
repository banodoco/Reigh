import { generateUUID } from '@/shared/lib/taskCreation/ids.ts';

export type CommitSessionStorage = Pick<Storage, 'getItem' | 'setItem'>;

// A new navigation must not adopt sessionStorage copied from an opener or a
// duplicated tab. Reload/back-forward may reopen the same tab's draft. Inspect
// navigation only once per document, not each time React recreates a provider.
const initializedStorage = new WeakMap<CommitSessionStorage, Set<string>>();
export function browserCommitSessionStorage(namespace: string): { storage: CommitSessionStorage | null; fresh: boolean } {
  try {
    const storage = window.sessionStorage;
    let namespaces = initializedStorage.get(storage);
    if (!namespaces) { namespaces = new Set(); initializedStorage.set(storage, namespaces); }
    const first = !namespaces.has(namespace);
    namespaces.add(namespace);
    const navigation = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
    // Without navigation identity we cannot distinguish a copied tab from a
    // reload. Keep commits available, but do not claim durable draft recovery.
    if (!navigation || !['navigate', 'reload', 'back_forward'].includes(navigation.type)) {
      return { storage: null, fresh: false };
    }
    return { storage, fresh: first && navigation.type === 'navigate' };
  } catch {
    return { storage: null, fresh: false };
  }
}

/** The existing request session and its allocation high-water mark, never auth. */
export class RuntimeCommitSession {
  id = generateUUID();
  private sequence = 0;
  private storage: CommitSessionStorage | null;
  private readonly key: string;

  constructor(storage: CommitSessionStorage | null, namespace: string, fresh = false) {
    this.storage = storage;
    this.key = `reigh.runtime-commit-session.v1:${namespace}`;
    try {
      const stored = fresh ? null : this.read();
      if (stored) {
        this.id = stored.id;
        this.sequence = stored.sequence;
      }
      this.persist();
    } catch {
      this.storage = null;
      this.id = generateUUID();
      this.sequence = 0;
    }
  }

  get recoverable(): boolean { return this.storage !== null; }

  private read(): { id: string; sequence: number } | null {
    const raw = this.storage?.getItem(this.key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (typeof value?.id !== 'string' || !value.id
      || !Number.isSafeInteger(value.sequence) || value.sequence < 0) {
      throw new Error('Invalid Runtime commit session context');
    }
    return value;
  }

  private persist(): void {
    if (!this.storage) return;
    const value = JSON.stringify({ id: this.id, sequence: this.sequence });
    this.storage.setItem(this.key, value);
    if (this.storage.getItem(this.key) !== value) throw new Error('Runtime commit session context was not retained');
  }

  next(after = 0): { id: string; sequence: number } {
    try {
      const stored = this.read();
      if (this.storage && stored?.id !== this.id) throw new Error('Runtime commit session context changed');
      this.sequence = Math.max(this.sequence, stored?.sequence ?? 0, after) + 1;
      if (!Number.isSafeInteger(this.sequence)) throw new Error('Runtime commit session sequence exhausted');
      // Reserve before transport: an uncertain request must never reuse a number
      // for different bytes after reload. Gaps are legal; retries keep old bytes.
      this.persist();
    } catch {
      // Keep ordinary saves available without sending an unpersisted sequence
      // under the old durable identity. Such an ephemeral session has no draft key.
      this.storage = null;
      this.id = generateUUID();
      this.sequence = 1;
    }
    return { id: this.id, sequence: this.sequence };
  }
}
