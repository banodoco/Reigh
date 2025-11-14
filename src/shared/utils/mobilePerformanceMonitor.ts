/**
 * Mobile Performance Monitor
 * Use this to identify performance issues causing device heating
 * Tag: [MobileHeatDebug]
 */

interface PerformanceMetrics {
  fps: number;
  memory?: number;
  renderCount: number;
  activeTimers: number;
  activeAnimations: number;
}

class MobilePerformanceMonitor {
  private frameCount = 0;
  private lastTime = performance.now();
  private fps = 0;
  private renderCounts = new Map<string, number>();
  private isMonitoring = false;
  private rafId: number | null = null;
  private logInterval: number | null = null;

  start() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    console.log('[MobileHeatDebug] Performance monitoring started');
    
    // Track FPS
    this.trackFPS();
    
    // Log metrics every 2 seconds
    this.logInterval = window.setInterval(() => {
      this.logMetrics();
    }, 2000);
  }

  stop() {
    this.isMonitoring = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.logInterval) {
      clearInterval(this.logInterval);
      this.logInterval = null;
    }
    console.log('[MobileHeatDebug] Performance monitoring stopped');
  }

  private trackFPS() {
    const measure = () => {
      if (!this.isMonitoring) return;
      
      this.frameCount++;
      const currentTime = performance.now();
      const elapsed = currentTime - this.lastTime;
      
      if (elapsed >= 1000) {
        this.fps = Math.round((this.frameCount * 1000) / elapsed);
        this.frameCount = 0;
        this.lastTime = currentTime;
      }
      
      this.rafId = requestAnimationFrame(measure);
    };
    
    this.rafId = requestAnimationFrame(measure);
  }

  trackComponentRender(componentName: string) {
    const count = this.renderCounts.get(componentName) || 0;
    this.renderCounts.set(componentName, count + 1);
  }

  private getMetrics(): PerformanceMetrics {
    // Count active timers and intervals
    // @ts-ignore - These are available in browser
    const activeTimers = window.setInterval.length || 0;
    
    return {
      fps: this.fps,
      memory: (performance as any).memory?.usedJSHeapSize 
        ? Math.round((performance as any).memory.usedJSHeapSize / 1048576) 
        : undefined,
      renderCount: Array.from(this.renderCounts.values()).reduce((a, b) => a + b, 0),
      activeTimers,
      activeAnimations: 0 // Would need to track separately
    };
  }

  private logMetrics() {
    const metrics = this.getMetrics();
    
    console.log('[MobileHeatDebug] === Performance Metrics ===');
    console.log('[MobileHeatDebug] FPS:', metrics.fps);
    if (metrics.memory) {
      console.log('[MobileHeatDebug] Memory (MB):', metrics.memory);
    }
    console.log('[MobileHeatDebug] Total renders (last interval):', metrics.renderCount);
    
    // Log top rendering components
    if (this.renderCounts.size > 0) {
      console.log('[MobileHeatDebug] Top rendering components:');
      const sorted = Array.from(this.renderCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);
      
      sorted.forEach(([name, count]) => {
        console.log(`[MobileHeatDebug]   ${name}: ${count} renders`);
      });
    }
    
    // Reset render counts for next interval
    this.renderCounts.clear();
    
    // Warnings
    if (metrics.fps < 30) {
      console.warn('[MobileHeatDebug] ⚠️ LOW FPS - Possible cause of heating');
    }
    if (metrics.memory && metrics.memory > 500) {
      console.warn('[MobileHeatDebug] ⚠️ HIGH MEMORY USAGE');
    }
  }

  // Track specific operations
  async measureOperation<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const start = performance.now();
    console.log(`[MobileHeatDebug] Starting: ${name}`);
    
    try {
      const result = await operation();
      const duration = performance.now() - start;
      console.log(`[MobileHeatDebug] Completed: ${name} (${duration.toFixed(2)}ms)`);
      
      if (duration > 100) {
        console.warn(`[MobileHeatDebug] ⚠️ SLOW OPERATION: ${name} took ${duration.toFixed(2)}ms`);
      }
      
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      console.error(`[MobileHeatDebug] Failed: ${name} (${duration.toFixed(2)}ms)`, error);
      throw error;
    }
  }
}

// Singleton instance
export const perfMonitor = new MobilePerformanceMonitor();

// React hook for tracking component renders
export function useRenderTracking(componentName: string) {
  if (import.meta.env.DEV) {
    perfMonitor.trackComponentRender(componentName);
  }
}

// Make it available in window for console access
if (typeof window !== 'undefined') {
  (window as any).__perfMonitor = perfMonitor;
}

