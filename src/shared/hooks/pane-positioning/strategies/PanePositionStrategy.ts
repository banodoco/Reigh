import { PanePosition } from '@/shared/config/panes';

export interface PanePositionStrategy {
  getStyle(position: PanePosition): React.CSSProperties;
}

export abstract class BasePanePositionStrategy implements PanePositionStrategy {
  abstract getStyle(position: PanePosition): React.CSSProperties;
  
  protected getBaseStyle(): React.CSSProperties {
    return {
      position: 'fixed' as const,
    };
  }
} 