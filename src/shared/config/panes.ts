export const PANE_CONFIG = {
  dimensions: {
    DEFAULT_HEIGHT: 350,
    DEFAULT_WIDTH: 300,
  },
  timing: {
    HOVER_DELAY: 100,
    ANIMATION_DURATION: 300,
  },
  zIndex: {
    PANE: 60,
    CONTROL_LOCKED: 101,
    CONTROL_UNLOCKED: 102,
  },
  transition: {
    EASING: 'ease-smooth',
    PROPERTIES: {
      TRANSFORM_ONLY: 'transition-transform',
      TRANSFORM_OPACITY: 'transition-[transform,opacity]',
    }
  }
} as const;

export type PaneSide = 'left' | 'right' | 'bottom';

export interface PaneOffsets {
  bottom?: number;
  horizontal?: number;
}

export interface PanePosition {
  side: PaneSide;
  dimension: number;
  offsets: PaneOffsets;
  isVisible: boolean;
} 