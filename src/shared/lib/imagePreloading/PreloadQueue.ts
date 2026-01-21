/**
 * PreloadQueue
 *
 * A priority queue for image preloading that limits concurrent requests
 * to avoid overwhelming the browser.
 *
 * Features:
 * - Priority-based ordering (higher priority loads first)
 * - Concurrent request limiting
 * - Cancellation support
 * - Promise-based API
 */

interface QueueItem {
  url: string;
  priority: number;
  resolve: () => void;
  reject: (err: Error) => void;
  aborted: boolean;
}

export class PreloadQueue {
  private queue: QueueItem[] = [];
  private active = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Add a URL to the preload queue.
   * Returns a promise that resolves when the image is loaded.
   *
   * @param url - The image URL to preload
   * @param priority - Higher numbers load first (default: 0)
   */
  add(url: string, priority = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      const item: QueueItem = {
        url,
        priority,
        resolve,
        reject,
        aborted: false,
      };

      // Insert sorted by priority (higher first)
      const insertIdx = this.queue.findIndex((q) => q.priority < priority);
      if (insertIdx === -1) {
        this.queue.push(item);
      } else {
        this.queue.splice(insertIdx, 0, item);
      }

      this.processNext();
    });
  }

  /**
   * Clear all pending items from the queue.
   * Active loads will complete but their callbacks are ignored.
   */
  clear(): void {
    this.queue.forEach((item) => {
      item.aborted = true;
    });
    this.queue = [];
  }

  /**
   * Get the current queue size (pending items only)
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Get the number of currently active loads
   */
  get activeCount(): number {
    return this.active;
  }

  private async processNext(): Promise<void> {
    if (this.active >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift()!;

    // Skip if already aborted
    if (item.aborted) {
      this.processNext();
      return;
    }

    this.active++;

    try {
      await this.loadImage(item.url);
      if (!item.aborted) {
        item.resolve();
      }
    } catch (err) {
      if (!item.aborted) {
        item.reject(err as Error);
      }
    } finally {
      this.active--;
      // Process next item after a microtask to avoid blocking
      queueMicrotask(() => this.processNext());
    }
  }

  private loadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        img.onload = null;
        img.onerror = null;
        resolve();
      };

      img.onerror = () => {
        img.onload = null;
        img.onerror = null;
        reject(new Error(`Failed to load image: ${url}`));
      };

      img.src = url;
    });
  }
}
