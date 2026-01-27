import { BasePanePositionStrategy } from './PanePositionStrategy';
import { PanePosition } from '@/shared/config/panes';

export class LeftPanePositionStrategy extends BasePanePositionStrategy {
  getStyle(position: PanePosition): React.CSSProperties {
    const { dimension, offsets, isVisible } = position;
    const bottomOffset = offsets.bottom || 0;

    // Use 50dvh (dynamic viewport height) to stay centered as iOS Safari
    // browser chrome shows/hides. Safari animates the chrome smoothly,
    // so the button movement feels controlled rather than jumpy.
    // Falls back to 50vh for older browsers.
    return {
      ...this.getBaseStyle(),
      top: '50dvh',
      left: '0px',
      transform: `translateX(${isVisible ? dimension : 0}px) translateY(calc(-50% - ${bottomOffset / 2}px))`,
    };
  }
} 