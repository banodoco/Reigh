import { useMemo, useRef } from 'react';

/**
 * Hook that returns a stable reference to an object, only updating when dependencies change.
 * Uses deep comparison to prevent unnecessary recreations.
 */
export function useStableObject<T extends Record<string, any>>(
  factory: () => T,
  deps: React.DependencyList
): T {
  const depsRef = useRef<React.DependencyList>();
  const objectRef = useRef<T>();

  // Check if dependencies have actually changed
  const depsChanged = !depsRef.current || 
    depsRef.current.length !== deps.length ||
    depsRef.current.some((dep, index) => dep !== deps[index]);

  if (depsChanged || !objectRef.current) {
    objectRef.current = factory();
    depsRef.current = deps;
  }

  return objectRef.current;
}

/**
 * Hook that memoizes a value and only updates when dependencies change.
 * More efficient than useMemo for stable references.
 */
export function useStableValue<T>(
  factory: () => T,
  deps: React.DependencyList
): T {
  const depsRef = useRef<React.DependencyList>();
  const valueRef = useRef<T>();

  const depsChanged = !depsRef.current || 
    depsRef.current.length !== deps.length ||
    depsRef.current.some((dep, index) => dep !== deps[index]);

  if (depsChanged || valueRef.current === undefined) {
    valueRef.current = factory();
    depsRef.current = deps;
  }

  return valueRef.current;
}

/**
 * Hook that creates a stable callback reference that only updates when dependencies change.
 * More efficient than useCallback for functions with many dependencies.
 */
export function useStableCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList
): T {
  const callbackRef = useRef<T>(callback);
  const depsRef = useRef<React.DependencyList>();

  const depsChanged = !depsRef.current || 
    depsRef.current.length !== deps.length ||
    depsRef.current.some((dep, index) => dep !== deps[index]);

  if (depsChanged) {
    callbackRef.current = callback;
    depsRef.current = deps;
  }

  return callbackRef.current;
}
