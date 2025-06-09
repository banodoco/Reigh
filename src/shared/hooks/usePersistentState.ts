import { useState, useEffect } from 'react';
import { toast } from 'sonner';

const MAX_LOCAL_STORAGE_ITEM_LENGTH = 4 * 1024 * 1024; // 4MB

function usePersistentState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const storedValue = localStorage.getItem(key);
      if (storedValue) {
        return JSON.parse(storedValue) as T;
      }
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
    }
    return defaultValue;
  });

  useEffect(() => {
    try {
      const serializedState = JSON.stringify(state);
      if (serializedState.length > MAX_LOCAL_STORAGE_ITEM_LENGTH) {
        toast.warning("Could not save settings locally.", {
          description: "The data size exceeds the 4MB limit for local storage.",
        });
        return;
      }
      localStorage.setItem(key, serializedState);
    } catch (error) {
      console.error(`Error writing to localStorage key "${key}":`, error);
      toast.error("Could not save settings locally.", {
        description: "There was an error writing to your browser's local storage."
      });
    }
  }, [key, state]);

  return [state, setState];
}

export default usePersistentState; 