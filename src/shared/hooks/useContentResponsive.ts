import { usePanes } from '@/shared/contexts/PanesContext';

// Local fallback type definition (mirrors original)
export interface ContentBreakpoints {
  isSm: boolean;
  isMd: boolean;
  isLg: boolean;
  isXl: boolean;
  is2Xl: boolean;
  contentWidth: number;
  contentHeight: number;
}

/**
 * Hook for content-aware responsive breakpoints
 * 
 * Unlike CSS media queries that respond to viewport size, this hook responds to
 * the actual available content area, accounting for locked panes that reduce
 * the usable space.
 * 
 * @example
 * ```tsx
 * const { isLg, isSm, contentWidth } = useContentResponsive();
 * 
 * // Use for conditional rendering
 * return (
 *   <div className={isLg ? "flex-row" : "flex-col"}>
 *     {isSm ? <LargeComponent /> : <SmallComponent />}
 *   </div>
 * );
 * ```
 */
export const useContentResponsive = (): ContentBreakpoints => {
  const panes = usePanes();

  // If PanesContext still provides contentBreakpoints, use them
  // (preferred – accounts for locked panes width)
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  if ((panes as any).contentBreakpoints) {
    return (panes as any).contentBreakpoints as ContentBreakpoints;
  }

  // Fallback: derive simple viewport-based breakpoints so the hook never throws
  const width = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const height = typeof window !== 'undefined' ? window.innerHeight : 800;

  return {
    isSm: width >= 640,
    isMd: width >= 768,
    isLg: width >= 1024,
    isXl: width >= 1280,
    is2Xl: width >= 1536,
    contentWidth: width,
    contentHeight: height,
  };
};

/**
 * Helper to get responsive values based on content width
 * 
 * @example
 * ```tsx
 * const columns = useContentResponsiveValue({
 *   base: 1,      // < 640px content width
 *   sm: 2,        // >= 640px content width  
 *   lg: 3,        // >= 1024px content width
 * });
 * ```
 */
export const useContentResponsiveValue = <T>(values: {
  base: T;
  sm?: T;
  md?: T;
  lg?: T;
  xl?: T;
  '2xl'?: T;
}): T => {
  const { isSm, isMd, isLg, isXl, is2Xl } = useContentResponsive();
  
  if (is2Xl && values['2xl'] !== undefined) return values['2xl'];
  if (isXl && values.xl !== undefined) return values.xl;
  if (isLg && values.lg !== undefined) return values.lg;
  if (isMd && values.md !== undefined) return values.md;
  if (isSm && values.sm !== undefined) return values.sm;
  
  return values.base;
};

/**
 * Helper to get responsive grid columns based on content width
 * 
 * @example
 * ```tsx
 * const gridCols = useContentResponsiveColumns({
 *   base: 1,
 *   sm: 2,
 *   lg: 3,
 * });
 * 
 * return (
 *   <div style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}>
 *     {items.map(item => <Item key={item.id} />)}
 *   </div>
 * );
 * ```
 */
export const useContentResponsiveColumns = (columns: {
  base: number;
  sm?: number;
  md?: number;
  lg?: number;
  xl?: number;
  '2xl'?: number;
}): number => {
  return useContentResponsiveValue(columns);
};

/**
 * Helper to determine layout direction based on content width
 * 
 * @example
 * ```tsx
 * const direction = useContentResponsiveDirection({
 *   base: 'column',
 *   lg: 'row',
 * });
 * 
 * return <div style={{ flexDirection: direction }}>...</div>;
 * ```
 */
export const useContentResponsiveDirection = (directions: {
  base: 'row' | 'column';
  sm?: 'row' | 'column';
  md?: 'row' | 'column';
  lg?: 'row' | 'column';
  xl?: 'row' | 'column';
  '2xl'?: 'row' | 'column';
}): 'row' | 'column' => {
  return useContentResponsiveValue(directions);
}; 