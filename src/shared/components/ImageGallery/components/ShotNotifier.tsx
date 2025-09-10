import React, { useMemo } from "react";
import { Button } from "@/shared/components/ui/button";

export interface ShotNotifierProps {
  formAssociatedShotId?: string | null;
  shotFilter: string;
  showShotFilter: boolean;
  allShots: Array<{ id: string; name: string }>;
  onSwitchToAssociatedShot?: (shotId: string) => void;
  onShowAllShots?: () => void;
  onVisitShot?: (shotId: string) => void;
}

export const ShotNotifier: React.FC<ShotNotifierProps> = ({
  formAssociatedShotId,
  shotFilter,
  showShotFilter,
  allShots,
  onSwitchToAssociatedShot,
  onShowAllShots,
  onVisitShot,
}) => {
  // Determine if we should show the shot notifier
  // Show when: 1) There's a form/shot mismatch, OR 2) Filtering for a specific shot
  const shouldShowShotNotifier = useMemo(() => {
    const hasFormShotMismatch = !!(formAssociatedShotId && showShotFilter && shotFilter !== formAssociatedShotId);
    const isFilteringSpecificShot = !!(showShotFilter && shotFilter !== 'all');
    
    return hasFormShotMismatch || isFilteringSpecificShot;
  }, [formAssociatedShotId, shotFilter, showShotFilter]);

  // Get the names and text for the notifier
  const { currentShotDisplayText, switchButtonText, showAllButtonText, visitShotButtonText } = useMemo(() => {
    const currentShot = allShots.find(shot => shot.id === shotFilter);
    const associatedShot = allShots.find(shot => shot.id === formAssociatedShotId);
    const associatedShotName = associatedShot?.name || 'Unknown';
    const currentShotName = currentShot?.name || 'Unknown';
    
    const hasFormShotMismatch = !!(formAssociatedShotId && shotFilter !== formAssociatedShotId);
    const isFilteringSpecificShot = shotFilter !== 'all';
    
    if (hasFormShotMismatch && shotFilter === 'all') {
      // Case 1: Form has associated shot but we're viewing all shots
      return {
        currentShotDisplayText: "You're viewing images for all shots",
        switchButtonText: `View images related to ${associatedShotName}`,
        showAllButtonText: null, // Don't show "Show All" when already viewing all
        visitShotButtonText: null,
      };
    } else if (hasFormShotMismatch && isFilteringSpecificShot) {
      // Case 2: Form has associated shot but we're viewing a different specific shot - SHOW BOTH BUTTONS
      return {
        currentShotDisplayText: `You're viewing images for ${currentShotName}`,
        switchButtonText: `Switch to ${associatedShotName}`,
        showAllButtonText: "Show images related to all shots",
        visitShotButtonText: `Visit ${currentShotName}`,
      };
    } else if (isFilteringSpecificShot && !hasFormShotMismatch) {
      // Case 3: Filtering for a specific shot (no form mismatch) - show "Show All" and "Visit Shot"
      return {
        currentShotDisplayText: `You're filtering for images related to ${currentShotName}`,
        switchButtonText: null,
        showAllButtonText: "Show images related to all shots",
        visitShotButtonText: `Visit ${currentShotName}`,
      };
    } else {
      // Fallback (shouldn't happen if shouldShowShotNotifier logic is correct)
      return {
        currentShotDisplayText: "You're viewing images for all shots",
        switchButtonText: null,
        showAllButtonText: "Show images related to all shots",
        visitShotButtonText: null,
      };
    }
  }, [allShots, shotFilter, formAssociatedShotId]);

  if (!shouldShowShotNotifier) {
    return null;
  }

  const handleSwitchToAssociated = () => {
    if (formAssociatedShotId && onSwitchToAssociatedShot) {
      onSwitchToAssociatedShot(formAssociatedShotId);
    }
  };

  const handleVisitShot = () => {
    if (shotFilter !== 'all' && onVisitShot) {
      onVisitShot(shotFilter);
    }
  };

  return (
    <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200">
      <span className="text-sm">
        <strong>{currentShotDisplayText}</strong>
      </span>
      <div className="flex items-center gap-2 ml-3">
        {/* Switch to Associated Shot button (when there's a form mismatch) */}
        {switchButtonText && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSwitchToAssociated}
            className="text-green-700 border-green-300 hover:bg-green-100 dark:text-green-200 dark:border-green-700 dark:hover:bg-green-800"
          >
            {switchButtonText}
          </Button>
        )}
        
        {/* Visit Shot button */}
        {visitShotButtonText && (
          <Button
            variant="default"
            size="sm"
            onClick={handleVisitShot}
            className="bg-green-600 hover:bg-green-700 text-white border-green-600 hover:border-green-700 dark:bg-green-700 dark:hover:bg-green-600 dark:border-green-700 dark:hover:border-green-600"
          >
            {visitShotButtonText}
          </Button>
        )}

        {/* Show All Shots button */}
        {showAllButtonText && (
          <Button
            variant="outline"
            size="sm"
            onClick={onShowAllShots}
            className="text-green-700 border-green-300 hover:bg-green-100 dark:text-green-200 dark:border-green-700 dark:hover:bg-green-800"
          >
            {showAllButtonText}
          </Button>
        )}
      </div>
    </div>
  );
};
