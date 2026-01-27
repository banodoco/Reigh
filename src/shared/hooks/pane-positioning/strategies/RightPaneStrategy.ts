import { BasePanePositionStrategy } from './PanePositionStrategy';
import { PanePosition } from '@/shared/config/panes';

export class RightPanePositionStrategy extends BasePanePositionStrategy {
  getStyle(position: PanePosition): React.CSSProperties {
    const { dimension, offsets, isVisible } = position;
    const bottomOffset = offsets.bottom || 0;

    // Use 50svh (small viewport height) instead of 50% to prevent jumping
    // when iOS Safari browser chrome shows/hides during scroll.
    // svh represents the viewport with browser chrome visible, so it stays stable.
    // Falls back to 50vh for older browsers (acceptable since the jump is minor).
    return {
      ...this.getBaseStyle(),
      top: '50svh',
      right: '0px',
      transform: `translateX(${isVisible ? -dimension : 0}px) translateY(calc(-50% - ${bottomOffset / 2}px))`,
    };
  }
} 