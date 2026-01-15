/**
 * FinalVideoSection - Prominent final video display with output selector
 * 
 * Shows the final joined video output at the top of the shot editor,
 * with a dropdown to switch between different generation outputs.
 * Styled similar to ChildGenerationsView's "Final Video" section.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Check, Film, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Separator } from '@/shared/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { useSegmentOutputsForShot } from '../hooks/useSegmentOutputsForShot';
import { VideoItem } from './VideoGallery/components/VideoItem';
import MediaLightbox from '@/shared/components/MediaLightbox';
import { GenerationRow } from '@/types/shots';
import { formatDistanceToNow } from 'date-fns';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useTaskFromUnifiedCache } from '@/shared/hooks/useUnifiedGenerations';
import { useGetTask } from '@/shared/hooks/useTasks';

// Stable empty function reference to avoid re-renders from inline () => {}
const noop = () => {};

interface FinalVideoSectionProps {
  shotId: string;
  projectId: string;
  projectAspectRatio?: string;
  onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
  onJoinSegmentsClick?: () => void;
  /** Optional controlled selected parent ID (shared with other components) */
  selectedParentId?: string | null;
  /** Optional callback when selected parent changes (for controlled mode) */
  onSelectedParentChange?: (id: string | null) => void;
  /** Parent generations passed from parent (to avoid duplicate fetch) */
  parentGenerations?: any[];
  /** Segment progress passed from parent */
  segmentProgress?: { completed: number; total: number };
}

export const FinalVideoSection: React.FC<FinalVideoSectionProps> = ({
  shotId,
  projectId,
  projectAspectRatio,
  onApplySettingsFromTask,
  onJoinSegmentsClick,
  selectedParentId: controlledSelectedParentId,
  onSelectedParentChange,
  parentGenerations: parentGenerationsFromProps,
  segmentProgress: segmentProgressFromProps,
}) => {
  const isMobile = useIsMobile();
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  
  // Determine if we're in controlled mode (props provided from parent)
  const isControlled = controlledSelectedParentId !== undefined && onSelectedParentChange !== undefined;
  
  // Fetch segment outputs data - only needed if not in controlled mode
  const hookResult = useSegmentOutputsForShot(
    isControlled ? null : shotId, // Don't fetch if controlled
    isControlled ? null : projectId,
    undefined,
    controlledSelectedParentId,
    onSelectedParentChange
  );
  
  // Use props if controlled, otherwise use hook result
  const parentGenerations = parentGenerationsFromProps || hookResult.parentGenerations;
  const selectedParentId = isControlled ? controlledSelectedParentId : hookResult.selectedParentId;
  const setSelectedParentId = isControlled ? onSelectedParentChange! : hookResult.setSelectedParentId;
  const segmentProgress = segmentProgressFromProps || hookResult.segmentProgress;
  const isLoading = hookResult.isLoading;
  
  // Derive selectedParent from parentGenerations (works in both controlled and uncontrolled mode)
  const selectedParent = useMemo(() => {
    if (!selectedParentId) return null;
    return parentGenerations.find((p: any) => p.id === selectedParentId) || null;
  }, [parentGenerations, selectedParentId]);
  
  const hasFinalOutput = !!(selectedParent?.location);
  
  // Transform selected parent for VideoItem/Lightbox
  const parentVideoRow = useMemo(() => {
    if (!selectedParent) return null;
    // The hook's transformer already sets created_at to updated_at, so we just use it directly
    return {
      ...selectedParent,
      type: 'video',
    } as GenerationRow;
  }, [selectedParent]);
  
  // Get task data for lightbox task details
  const { data: taskMapping } = useTaskFromUnifiedCache(selectedParentId || '');
  const taskId = typeof taskMapping?.taskId === 'string' ? taskMapping.taskId : '';
  const { data: task, isLoading: isLoadingTask, error: taskError } = useGetTask(taskId);
  
  // Derive input images from task params for lightbox
  const inputImages: string[] = useMemo(() => {
    if (!task?.params) return [];
    const params = task.params as any;
    
    // Try different sources for input images
    const orchestratorDetails = params.orchestrator_details || {};
    const inputPaths = params.input_image_paths_resolved ||
                      orchestratorDetails.input_image_paths_resolved ||
                      params.input_images ||
                      [];
    
    return Array.isArray(inputPaths) ? inputPaths : [];
  }, [task]);
  
  // Get selected index for display
  const selectedIndex = parentGenerations.findIndex(p => p.id === selectedParentId);
  
  // Calculate progress for currently selected parent
  const currentProgress = segmentProgress;
  
  // Handle lightbox open
  const handleLightboxOpen = useCallback(() => {
    setIsLightboxOpen(true);
  }, []);
  
  // Handle lightbox close
  const handleLightboxClose = useCallback(() => {
    setIsLightboxOpen(false);
  }, []);
  
  // Handle output selection change
  const handleOutputSelect = useCallback((id: string) => {
    setSelectedParentId(id);
  }, [setSelectedParentId]);
  
  // Mobile tap handler (simplified - just opens lightbox)
  const handleMobileTap = useCallback(() => {
    handleLightboxOpen();
  }, [handleLightboxOpen]);
  
  // Don't render if no parent generations
  if (parentGenerations.length === 0 && !isLoading) {
    return null;
  }
  
  // Show loading state
  if (isLoading && parentGenerations.length === 0) {
    return null; // Don't show skeleton, will just show nothing until data loads
  }
  
  return (
    <div className="w-full">
      <Card className="border rounded-xl shadow-sm">
        <CardContent className="p-4 sm:p-6">
          {/* Header with title and output selector */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-base sm:text-lg font-light flex items-center gap-2">
              <Film className="w-5 h-5 text-muted-foreground" />
              Final Video
            </h2>
            
            <div className="flex items-center gap-3">
              {/* Output Selector Dropdown */}
              {parentGenerations.length > 1 && (
                <Select value={selectedParentId || ''} onValueChange={handleOutputSelect}>
                  <SelectTrigger className="w-auto min-w-[160px] h-8 text-sm">
                    <SelectValue placeholder="Select output">
                      {selectedParentId && (
                        <span className="flex items-center gap-1.5">
                          Output {selectedIndex + 1} of {parentGenerations.length}
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {parentGenerations.map((parent, index) => {
                      const createdAt = parent.created_at || (parent as any).createdAt;
                      const timeAgo = createdAt ? formatDistanceToNow(new Date(createdAt), { addSuffix: true }) : '';
                      const hasOutput = !!parent.location;
                      
                      return (
                        <SelectItem key={parent.id} value={parent.id}>
                          <div className="flex items-center gap-2">
                            <span>Output {index + 1}</span>
                            {hasOutput && <Check className="w-3 h-3 text-green-500" />}
                            <span className="text-xs text-muted-foreground">{timeAgo}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
              
              {/* Progress indicator */}
              {currentProgress.total > 0 && currentProgress.completed === currentProgress.total && onJoinSegmentsClick && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onJoinSegmentsClick}
                >
                  Join clips
                </Button>
              )}
            </div>
          </div>
          
          <Separator className="my-3" />
          
          {/* Video Display */}
          {hasFinalOutput && parentVideoRow ? (
            <div className="flex justify-center mt-4">
              {/* Constrain video size based on aspect ratio */}
              <div 
                style={(() => {
                  if (!projectAspectRatio) {
                    return { width: '50%' };
                  }
                  const [w, h] = projectAspectRatio.split(':').map(Number);
                  if (w && h) {
                    const ratio = w / h;
                    // Portrait: constrain by height (max 60vh), calculate width from aspect ratio
                    if (h > w) {
                      return { 
                        width: `min(100%, calc(60vh * ${ratio}))`,
                      };
                    }
                    // Landscape/square: constrain by width (max 50%)
                    return { width: '50%' };
                  }
                  return { width: '50%' };
                })()}
              >
                <VideoItem
                  video={parentVideoRow}
                  index={0}
                  originalIndex={0}
                  shouldPreload="metadata"
                  isMobile={isMobile}
                  projectAspectRatio={projectAspectRatio}
                  projectId={projectId}
                  onLightboxOpen={handleLightboxOpen}
                  onMobileTap={handleMobileTap}
                  onDelete={noop}
                  deletingVideoId={null}
                  onHoverStart={noop}
                  onHoverEnd={noop}
                  onMobileModalOpen={noop}
                  selectedVideoForDetails={null}
                  showTaskDetailsModal={false}
                  onApplySettingsFromTask={onApplySettingsFromTask || noop}
                  hideActions={true}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center pt-4 pb-1 text-muted-foreground">
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading...</span>
                </div>
              ) : currentProgress.total > 0 && currentProgress.completed < currentProgress.total ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm">{currentProgress.completed}/{currentProgress.total} segments generated...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 opacity-40" />
                  <span className="text-sm">No final video yet</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Lightbox for viewing final video */}
      {isLightboxOpen && parentVideoRow && (
        <MediaLightbox
          media={parentVideoRow}
          onClose={handleLightboxClose}
          showNavigation={false}
          showImageEditTools={false}
          showDownload={true}
          hasNext={false}
          hasPrevious={false}
          starred={(parentVideoRow as any).starred ?? false}
          shotId={shotId}
          showTaskDetails={true}
          showVideoTrimEditor={true}
          taskDetailsData={{
            task,
            isLoading: isLoadingTask,
            error: taskError,
            inputImages,
            taskId: taskId || null,
            onApplySettingsFromTask: onApplySettingsFromTask,
            onClose: handleLightboxClose,
          }}
        />
      )}
    </div>
  );
};

export default FinalVideoSection;

