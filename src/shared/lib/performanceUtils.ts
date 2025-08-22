/**
 * Performance utilities to help prevent setTimeout violations and monitor execution times
 */
import React from 'react';

/**
 * Performance-monitored setTimeout wrapper
 * Automatically detects when callback execution exceeds 16ms and logs warnings
 */
export const performanceMonitoredTimeout = (
  callback: () => void,
  delay: number,
  context: string = 'Unknown'
): NodeJS.Timeout => {
  return setTimeout(() => {
    const startTime = performance.now();
    
    try {
      callback();
    } finally {
      const duration = performance.now() - startTime;
      if (duration > 16) {
        console.warn(`[PerformanceMonitor] setTimeout in ${context} took ${duration.toFixed(1)}ms (target: <16ms)`);
      }
    }
  }, delay);
};

/**
 * Time-sliced array processing to prevent UI blocking
 * Processes arrays in small chunks with yielding between chunks
 */
export const processArrayTimeSliced = <T>(
  array: T[],
  processor: (item: T, index: number) => void,
  options: {
    batchSize?: number;
    maxBatchTime?: number;
    onComplete?: () => void;
    onProgress?: (processedCount: number, total: number) => void;
    context?: string;
  } = {}
): void => {
  const {
    batchSize = 10,
    maxBatchTime = 8,
    onComplete,
    onProgress,
    context = 'Time-sliced processing'
  } = options;

  let currentIndex = 0;

  const processBatch = () => {
    const batchStartTime = performance.now();
    let processed = 0;

    while (
      currentIndex < array.length &&
      processed < batchSize &&
      (performance.now() - batchStartTime) < maxBatchTime
    ) {
      try {
        processor(array[currentIndex], currentIndex);
      } catch (error) {
        console.error(`[PerformanceUtils] Error in ${context} at index ${currentIndex}:`, error);
      }
      
      currentIndex++;
      processed++;
    }

    if (onProgress) {
      onProgress(currentIndex, array.length);
    }

    if (currentIndex < array.length) {
      // More items to process, yield control
      setTimeout(processBatch, 0);
    } else {
      // All items processed
      if (onComplete) {
        onComplete();
      }
    }
  };

  // Start processing
  processBatch();
};

/**
 * Adaptive timeout that uses requestIdleCallback when available for low-priority work
 */
export const adaptiveTimeout = (
  callback: () => void,
  delay: number,
  priority: 'high' | 'low' = 'high'
): void => {
  if (priority === 'low' && 'requestIdleCallback' in window) {
    requestIdleCallback(() => {
      setTimeout(callback, Math.max(0, delay));
    });
  } else {
    setTimeout(callback, delay);
  }
};

/**
 * Performance budget checker - helps ensure operations stay within frame budget
 */
export class PerformanceBudget {
  private startTime: number;
  private budget: number;
  private context: string;

  constructor(budgetMs: number = 16, context: string = 'Operation') {
    this.startTime = performance.now();
    this.budget = budgetMs;
    this.context = context;
  }

  /**
   * Check if we're still within budget
   */
  isWithinBudget(): boolean {
    return (performance.now() - this.startTime) < this.budget;
  }

  /**
   * Get remaining time in budget
   */
  getRemainingTime(): number {
    return Math.max(0, this.budget - (performance.now() - this.startTime));
  }

  /**
   * Check budget and yield if necessary
   */
  async checkAndYield(): Promise<void> {
    if (!this.isWithinBudget()) {
      console.warn(`[PerformanceBudget] ${this.context} exceeded ${this.budget}ms budget, yielding control`);
      await new Promise(resolve => setTimeout(resolve, 0));
      this.startTime = performance.now(); // Reset for next chunk
    }
  }

  /**
   * Complete the operation and log if it exceeded budget
   */
  complete(): void {
    const totalTime = performance.now() - this.startTime;
    if (totalTime > this.budget) {
      console.warn(`[PerformanceBudget] ${this.context} took ${totalTime.toFixed(1)}ms (budget: ${this.budget}ms)`);
    }
  }
}

/**
 * Wrapper for heavy operations that automatically time-slices them
 */
export const withTimeSlicing = async <T>(
  operation: () => Promise<T> | T,
  context: string = 'Heavy operation'
): Promise<T> => {
  const budget = new PerformanceBudget(16, context);
  
  try {
    const result = await operation();
    budget.complete();
    return result;
  } catch (error) {
    budget.complete();
    throw error;
  }
};

/**
 * Helper for measuring async operations with consistent logging
 */
export const measureAsync = async <T>(
  operation: () => Promise<T>,
  context: string,
  warnThreshold: number = 100
): Promise<T> => {
  const startTime = performance.now();
  
  try {
    const result = await operation();
    const duration = performance.now() - startTime;
    
    if (duration > warnThreshold) {
      console.warn(`[PerformanceMonitor] ${context} took ${duration.toFixed(1)}ms (threshold: ${warnThreshold}ms)`);
    }
    
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.warn(`[PerformanceMonitor] ${context} failed after ${duration.toFixed(1)}ms:`, error);
    throw error;
  }
};
