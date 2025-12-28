import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

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
}

interface IncomingTasksContextValue {
  /** List of all incoming tasks currently being prepared */
  incomingTasks: IncomingTask[];

  /** Add a new incoming task. Returns the generated ID for later removal. */
  addIncomingTask: (task: Omit<IncomingTask, 'id' | 'startedAt'>) => string;

  /** Remove an incoming task by ID (call when real tasks appear or on error) */
  removeIncomingTask: (id: string) => void;

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

  const hasIncomingTasks = incomingTasks.length > 0;

  const value = useMemo(() => ({
    incomingTasks,
    addIncomingTask,
    removeIncomingTask,
    hasIncomingTasks,
  }), [incomingTasks, addIncomingTask, removeIncomingTask, hasIncomingTasks]);

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
