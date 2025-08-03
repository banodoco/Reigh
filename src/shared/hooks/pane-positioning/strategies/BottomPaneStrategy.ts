import { BasePanePositionStrategy } from './PanePositionStrategy';
import { PanePosition } from '@/shared/config/panes';

export class BottomPanePositionStrategy extends BasePanePositionStrategy {
  getStyle(position: PanePosition): React.CSSProperties {
    const { dimension, offsets, isVisible } = position;
    const horizontalOffset = offsets.horizontal || 0;
    
    return {
      ...this.getBaseStyle(),
      left: '50%',
      bottom: '0px',
      // Centre within visible width by shifting half the horizontalOffset.
      // translateX(-50%) centres on viewport; additional translateX accounts for
      // asymmetrical side panes (e.g. shots/tasks) so the control remains centred
      // within the bottom pane itself.
      transform: `translateX(-50%) translateX(${horizontalOffset / 2}px) translateY(${isVisible ? -dimension : 0}px)`,
    };
  }
} 