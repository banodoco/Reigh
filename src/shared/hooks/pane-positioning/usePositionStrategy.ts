import { useMemo } from 'react';
import { PanePosition, PaneSide } from '@/shared/config/panes';
import { LeftPanePositionStrategy } from './strategies/LeftPaneStrategy';
import { RightPanePositionStrategy } from './strategies/RightPaneStrategy';
import { BottomPanePositionStrategy } from './strategies/BottomPaneStrategy';
import { PanePositionStrategy } from './strategies/PanePositionStrategy';

const strategies: Record<PaneSide, PanePositionStrategy> = {
  left: new LeftPanePositionStrategy(),
  right: new RightPanePositionStrategy(),
  bottom: new BottomPanePositionStrategy(),
};

export const usePositionStrategy = (position: PanePosition): React.CSSProperties => {
  return useMemo(() => {
    const strategy = strategies[position.side];
    return strategy.getStyle(position);
  }, [position]);
}; 