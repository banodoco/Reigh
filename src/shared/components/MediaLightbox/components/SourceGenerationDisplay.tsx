import React from 'react';
import { GenerationRow } from '@/types/shots';
import { Badge } from '@/shared/components/ui/badge';

interface SourceGenerationDisplayProps {
  sourceGeneration: GenerationRow;
  onNavigate: (generationId: string) => Promise<void>;
  variant?: 'compact' | 'full';
  className?: string;
  currentShotId?: string; // Optional: to check if parent is in same shot
  currentShotName?: string; // Optional: to display shot name in badge
  allShots?: Array<{ id: string; name: string }>; // Optional: to look up shot names
  currentMediaId?: string; // The current image being viewed
  isCurrentMediaPositioned?: boolean; // Whether current image has a timeline position
  onReplaceInShot?: (parentGenerationId: string, currentMediaId: string, parentTimelineFrame: number, currentShotId: string) => Promise<void>;
}

export const SourceGenerationDisplay: React.FC<SourceGenerationDisplayProps> = ({
  sourceGeneration,
  onNavigate,
  variant = 'full',
  className = '',
  currentShotId,
  currentShotName,
  allShots,
  currentMediaId,
  isCurrentMediaPositioned,
  onReplaceInShot
}) => {
  // Check if parent is positioned in the current shot
  const parentShotAssociation = currentShotId 
    ? (sourceGeneration as any).all_shot_associations?.find(
        (assoc: any) => assoc.shot_id === currentShotId
      )
    : null;
  
  const isParentInCurrentShot = !!parentShotAssociation;
  const parentTimelineFrame = parentShotAssociation?.timeline_frame;
  const isParentPositioned = parentTimelineFrame !== null && parentTimelineFrame !== undefined;
  
  // Determine shot name - use prop or look up in allShots
  const shotName = currentShotName || allShots?.find(s => s.id === currentShotId)?.name || 'Shot';
  
  // Show "Replace in shot" CTA if parent is positioned but current item is not
  const showReplaceCTA = isParentPositioned && !isCurrentMediaPositioned && onReplaceInShot && currentMediaId;
  
  // Debug logging
  console.log('[ReplaceInShot] SourceGenerationDisplay render', {
    hasCurrentShotId: !!currentShotId,
    currentShotId: currentShotId?.substring(0, 8),
    allShotsCount: allShots?.length || 0,
    allShotsIds: allShots?.map(s => ({ id: s.id.substring(0, 8), name: s.name })),
    foundShotName: shotName,
    usedCurrentShotName: !!currentShotName,
    hasParentAssociations: !!(sourceGeneration as any).all_shot_associations,
    parentAssociationsCount: (sourceGeneration as any).all_shot_associations?.length || 0,
    parentAssociations: (sourceGeneration as any).all_shot_associations?.map((a: any) => ({
      shotId: a.shot_id?.substring(0, 8),
      frame: a.timeline_frame
    })),
    isParentInCurrentShot,
    parentTimelineFrame,
    isParentPositioned,
    isCurrentMediaPositioned,
    hasOnReplaceInShot: !!onReplaceInShot,
    hasCurrentMediaId: !!currentMediaId,
    showReplaceCTA
  });
  const handleClick = async () => {
    console.log('[BasedOnNav] 🖼️ SourceGenerationDisplay clicked - Navigating to source generation', {
      sourceId: sourceGeneration.id.substring(0, 8),
      clearingDerivedContext: true,
      timestamp: Date.now()
    });
    // Clear derived context by not passing it - exits derived nav mode
    console.log('[BasedOnNav] 🎯 Calling onNavigate WITHOUT derivedContext to exit derived mode');
    await onNavigate(sourceGeneration.id);
    console.log('[BasedOnNav] ✅ onNavigate completed');
  };

  const handleReplace = async () => {
    if (!onReplaceInShot || !currentMediaId || !currentShotId || parentTimelineFrame === null || parentTimelineFrame === undefined) {
      return;
    }
    
    console.log('[ReplaceInShot] Replace button clicked', {
      parentId: sourceGeneration.id.substring(0, 8),
      currentMediaId: currentMediaId.substring(0, 8),
      parentFrame: parentTimelineFrame,
      shotId: currentShotId.substring(0, 8)
    });
    
    await onReplaceInShot(sourceGeneration.id, currentMediaId, parentTimelineFrame, currentShotId);
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center gap-2">
        <button
          onClick={handleClick}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group"
        >
          <span>Based on:</span>
          <div className={`relative ${variant === 'compact' ? 'w-8 h-8' : 'w-10 h-10'} rounded border border-border overflow-hidden group-hover:border-primary transition-colors`}>
            <img
              src={(sourceGeneration as any).thumbUrl || sourceGeneration.location}
              alt="Source generation"
              className="w-full h-full object-cover"
            />
          </div>
          <span className="group-hover:underline">Click to view</span>
        </button>
      </div>
      
      {/* Show "Replace in shot" CTA if parent is positioned but current item is not */}
      {showReplaceCTA && (
        <button
          onClick={handleReplace}
          className="text-xs text-muted-foreground hover:text-foreground underline self-start"
        >
          Replace in {shotName}
        </button>
      )}
    </div>
  );
};

export default SourceGenerationDisplay;

