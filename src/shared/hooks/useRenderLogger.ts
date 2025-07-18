import { useEffect, useRef } from 'react';
import { log } from '@/shared/lib/logger';

/**
 * Reports every render of a component along with a running count.
 * Example:
 *   const MyComponent = (props) => {
 *     useRenderLogger('MyComponent', props);
 *     return <div/>;
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useRenderLogger(tag: string, propsSnapshot?: any): void {
  const renderCount = useRef(0);

  // Increment synchronously before effect to catch first render.
  renderCount.current += 1;

  useEffect(() => {
    log(`PerfDebug:Render:${tag}`, {
      count: renderCount.current,
      props: propsSnapshot,
    });
    // We do not want to log on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });
} 