import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';

// Auto-cleanup stale incoming tasks after this many seconds
const STALE_TASK_TIMEOUT_SECONDS = 60;

/**
 * Generic incoming task - represents a task that is being prepared/created
 * but hasn't yet appeared in the database. This allows for immediate UI feedback
 * while background operations (like AI prompt generation) complete.
 *
 * Designed to work with any task type, not just image generation.
 */
export interface IncomingTask {
  id: string;
  startedAt: Date;
  taskType: string;       // e.g., 'image_generation', 'travel_video', 'upscale', etc.
  label: string;          // Display text (e.g., "cinematic shot of...", "Travel video")
  expectedCount?: number; // Optional: expected number of tasks to create
  baselineCount?: number; // DB count when placeholder was added (for accurate count calculation)
}

interface IncomingTasksContextValue {
  /** List of all incoming tasks currently being prepared */
  incomingTasks: IncomingTask[];

  /** Add a new incoming task. Returns the generated ID for later removal. */
  addIncomingTask: (task: Omit<IncomingTask, 'id' | 'startedAt'>) => string;

  /** Remove an incoming task by ID (call when real tasks appear or on error) */
  removeIncomingTask: (id: string) => void;

  /**
   * Complete an incoming task: remove it and update remaining placeholders' baselines.
   * Call this after refetching queries to ensure a clean count swap.
   * @param id - The task to remove
   * @param newBaseline - The current DB count (remaining placeholders will use this as their new baseline)
   */
  completeIncomingTask: (id: string, newBaseline: number) => void;

  /** Quick check if there are any incoming tasks */
  hasIncomingTasks: boolean;
}

const IncomingTasksContext = createContext<IncomingTasksContextValue | null>(null);

let idCounter = 0;
const generateId = () => `incoming-${Date.now()}-${++idCounter}`;

export const IncomingTasksProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [incomingTasks, setIncomingTasks] = useState<IncomingTask[]>([]);

  const addIncomingTask = useCallback((task: Omit<IncomingTask, 'id' | 'startedAt'>): string => {
    const id = generateId();
    const newTask: IncomingTask = {
      ...task,
      id,
      startedAt: new Date(),
    };

    console.log('[IncomingTasks] Adding incoming task:', newTask);
    setIncomingTasks(prev => [newTask, ...prev]);
    return id;
  }, []);

  const removeIncomingTask = useCallback((id: string) => {
    console.log('[IncomingTasks] Removing incoming task:', id);
    setIncomingTasks(prev => prev.filter(task => task.id !== id));
  }, []);

  const completeIncomingTask = useCallback((id: string, newBaseline: number) => {
    console.log('[IncomingTasks] Completing incoming task:', id, 'new baseline for remaining:', newBaseline);
    setIncomingTasks(prev =>
      prev
        .filter(task => task.id !== id)  // Remove completed task
        .map(task => ({ ...task, baselineCount: newBaseline }))  // Update remaining baselines
    );
  }, []);

  const hasIncomingTasks = incomingTasks.length > 0;

  // Auto-cleanup stale incoming tasks that have been sitting too long
  // This prevents stuck placeholders if completeIncomingTask is never called (e.g., due to errors)
  useEffect(() => {
    if (incomingTasks.length === 0) return;

    const interval = setInterval(() => {
      const now = new Date();
      setIncomingTasks(prev => {
        const staleTasks = prev.filter(task => {
          const ageSeconds = (now.getTime() - task.startedAt.getTime()) / 1000;
          return ageSeconds > STALE_TASK_TIMEOUT_SECONDS;
        });

        if (staleTasks.length > 0) {
          console.log('[IncomingTasks] Auto-removing stale tasks:', staleTasks.map(t => t.id));
          return prev.filter(task => {
            const ageSeconds = (now.getTime() - task.startedAt.getTime()) / 1000;
            return ageSeconds <= STALE_TASK_TIMEOUT_SECONDS;
          });
        }
        return prev;
      });
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [incomingTasks.length]);

  const value = useMemo(() => ({
    incomingTasks,
    addIncomingTask,
    removeIncomingTask,
    completeIncomingTask,
    hasIncomingTasks,
  }), [incomingTasks, addIncomingTask, removeIncomingTask, completeIncomingTask, hasIncomingTasks]);

  return (
    <IncomingTasksContext.Provider value={value}>
      {children}
    </IncomingTasksContext.Provider>
  );
};

export const useIncomingTasks = (): IncomingTasksContextValue => {
  const context = useContext(IncomingTasksContext);
  if (!context) {
    throw new Error('useIncomingTasks must be used within an IncomingTasksProvider');
  }
  return context;
};

export default IncomingTasksContext;
