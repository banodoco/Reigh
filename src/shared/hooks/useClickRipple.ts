import { useState, useCallback } from 'react';

export interface ClickRippleState {
  isActive: boolean;
  position: { x: number; y: number };
}

export interface UseClickRippleOptions {
  duration?: number;
  targetSelector?: string;
}

export const useClickRipple = (options: UseClickRippleOptions = {}) => {
  const { duration = 700, targetSelector } = options;
  const [rippleState, setRippleState] = useState<ClickRippleState>({
    isActive: false,
    position: { x: 0, y: 0 }
  });

  const triggerRipple = useCallback((e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
    
    // Find the target element for positioning calculation
    let targetElement: HTMLElement;
    if (targetSelector) {
      targetElement = e.currentTarget.querySelector(targetSelector) as HTMLElement;
    } else {
      targetElement = e.currentTarget as HTMLElement;
    }
    
    if (targetElement) {
      const rect = targetElement.getBoundingClientRect();
      // Calculate pixel offset from center
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const offsetX = clickX - centerX;
      const offsetY = clickY - centerY;
      
      // Set position first, then trigger animation in next frame
      setRippleState({
        isActive: false, // Keep inactive initially
        position: { x: offsetX, y: offsetY }
      });
      
      // Use requestAnimationFrame to ensure position is set before animation starts
      requestAnimationFrame(() => {
        setRippleState(prev => ({
          ...prev,
          isActive: true // Now trigger the animation
        }));
        
        // Reset after animation duration
        setTimeout(() => {
          setRippleState(prev => ({ ...prev, isActive: false }));
        }, duration);
      });
    }
  }, [duration, targetSelector]);

  const triggerRippleAtCenter = useCallback(() => {
    setRippleState({
      isActive: true,
      position: { x: 0, y: 0 } // Center position
    });
    
    requestAnimationFrame(() => {
      setTimeout(() => {
        setRippleState(prev => ({ ...prev, isActive: false }));
      }, duration);
    });
  }, [duration]);

  // CSS custom properties for the ripple position
  const rippleStyles = {
    '--ripple-x': `${rippleState.position.x}px`,
    '--ripple-y': `${rippleState.position.y}px`
  } as React.CSSProperties;

  return {
    rippleState,
    triggerRipple,
    triggerRippleAtCenter,
    rippleStyles,
    isRippleActive: rippleState.isActive
  };
};
