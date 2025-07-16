import { toast } from 'sonner';

// Create throttled versions of toast functions
const TOAST_THROTTLE_MS = 1000; // 1 second throttle

// Map to store last toast times by message
const lastToastTimes = new Map<string, number>();

// Helper to check if toast should be shown
const shouldShowToast = (message: string, throttleMs: number = TOAST_THROTTLE_MS): boolean => {
  const now = Date.now();
  const lastTime = lastToastTimes.get(message) || 0;
  
  if (now - lastTime > throttleMs) {
    lastToastTimes.set(message, now);
    return true;
  }
  
  return false;
};

// Throttled toast functions
export const throttledToast = {
  info: (message: string, options?: any) => {
    if (shouldShowToast(message)) {
      toast.info(message, options);
    }
  },
  
  success: (message: string, options?: any) => {
    if (shouldShowToast(message)) {
      // Success toast removed
    }
  },
  
  error: (message: string, options?: any) => {
    if (shouldShowToast(message, 500)) { // Errors get shorter throttle
      toast.error(message, options);
    }
  },
  
  warning: (message: string, options?: any) => {
    if (shouldShowToast(message)) {
      toast.warning(message, options);
    }
  }
};

// Simple debounce implementation
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options?: { leading?: boolean; trailing?: boolean }
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  let lastArgs: Parameters<T> | null = null;
  
  return function (...args: Parameters<T>) {
    lastArgs = args;
    
    if (options?.leading && !timeout) {
      func(...args);
    }
    
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(() => {
      if (options?.trailing !== false && lastArgs) {
        func(...lastArgs);
      }
      timeout = null;
      lastArgs = null;
    }, wait);
  };
}

// Debounced task update toast
export const debouncedTaskUpdateToast = debounce(
  (projectId: string, taskCount: number) => {
    toast.info(`${taskCount} tasks updated`, {
      description: `Project ${projectId}`,
      duration: 2000,
    });
  },
  2000,
  { leading: true, trailing: false }
); 