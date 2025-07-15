import { useState, useEffect } from 'react';
import { toast } from 'sonner';

const MAX_LOCAL_STORAGE_ITEM_LENGTH = 4 * 1024 * 1024; // 4MB

const PERSISTENT_STATE_EVENT = 'persistentStateChange';

// Check if localStorage is available (can fail in iOS Safari private mode)
function isLocalStorageAvailable(): boolean {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

function usePersistentState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    // Mobile Safari in private mode can throw on localStorage access
    if (!isLocalStorageAvailable()) {
      console.warn(`[usePersistentState] localStorage not available for key "${key}", using default value`);
      return defaultValue;
    }

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

  // Listen for updates from other components using the same key
  useEffect(() => {
    function handleExternalUpdate(e: Event) {
      const customEvt = e as CustomEvent<{ key: string; value: unknown }>;
      if (customEvt.detail?.key === key) {
        setState(customEvt.detail.value as T);
      }
    }

    window.addEventListener(PERSISTENT_STATE_EVENT, handleExternalUpdate);
    return () => window.removeEventListener(PERSISTENT_STATE_EVENT, handleExternalUpdate);
  }, [key]);

  useEffect(() => {
    // Skip localStorage writes if not available
    if (!isLocalStorageAvailable()) {
      return;
    }

    try {
      const serializedState = JSON.stringify(state);
      if (serializedState.length > MAX_LOCAL_STORAGE_ITEM_LENGTH) {
        toast.warning("Could not save settings locally.", {
          description: "The data size exceeds the 4MB limit for local storage.",
        });
        return;
      }
      localStorage.setItem(key, serializedState);

      // Broadcast change to other hook instances in the same tab
      window.dispatchEvent(
        new CustomEvent(PERSISTENT_STATE_EVENT, {
          detail: { key, value: state },
        })
      );
    } catch (error) {
      console.error(`Error writing to localStorage key "${key}":`, error);
      // Different error message for mobile users
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const errorDescription = isMobile 
        ? "Local storage may be disabled in private browsing mode. Settings will be lost when the tab is closed."
        : "There was an error writing to your browser's local storage.";
      
      toast.error("Could not save settings locally.", {
        description: errorDescription
      });
    }
  }, [key, state]);

  return [state, setState];
}

export default usePersistentState; 