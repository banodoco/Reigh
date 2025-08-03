import { BasePanePositionStrategy } from './PanePositionStrategy';
import { PanePosition } from '@/shared/config/panes';

export class RightPanePositionStrategy extends BasePanePositionStrategy {
  getStyle(position: PanePosition): React.CSSProperties {
    const { dimension, offsets, isVisible } = position;
    const bottomOffset = offsets.bottom || 0;
    
    return {
      ...this.getBaseStyle(),
      top: '50%',
      right: '0px',
      transform: `translateX(${isVisible ? -dimension : 0}px) translateY(calc(-50% - ${bottomOffset / 2}px))`,
    };
  }
} 