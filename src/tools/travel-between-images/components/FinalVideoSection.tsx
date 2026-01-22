/**
 * FinalVideoSection - Prominent final video display with output selector
 * 
 * Shows the final joined video output at the top of the shot editor,
 * with a dropdown to switch between different generation outputs.
 * Styled similar to ChildGenerationsView's "Final Video" section.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Check, Film, Loader2, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Separator } from '@/shared/components/ui/separator';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
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
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVariantBadges } from '@/shared/hooks/useVariantBadges';
import { VariantBadge } from '@/shared/components/VariantBadge';

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
  /** Loading state from parent (when in controlled mode) */
  isParentLoading?: boolean;
  /** Cached final video count for showing skeleton during load */
  getFinalVideoCount?: (shotId: string | null) => number | null;
  /** Delete handler for the final video generation */
  onDelete?: (generationId: string) => void;
  /** Whether a delete is in progress */
  isDeleting?: boolean;
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
  isParentLoading = false,
  getFinalVideoCount,
  onDelete,
  isDeleting = false,
}) => {
  const isMobile = useIsMobile();
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  
  // Determine if we're in controlled mode (props provided from parent)
  const isControlled = controlledSelectedParentId !== undefined && onSelectedParentChange !== undefined;

  // Always fetch segment outputs data - needed for realtime updates when tasks complete
  // Even in controlled mode, we need fresh data; controlled mode only affects selectedParentId state
  const hookResult = useSegmentOutputsForShot(
    shotId,
    projectId,
    undefined,
    controlledSelectedParentId,
    onSelectedParentChange
  );

  // Use hook result for parentGenerations (always fresh from cache/realtime)
  // Only use props as fallback if hook hasn't loaded yet
  const parentGenerations = hookResult.parentGenerations.length > 0
    ? hookResult.parentGenerations
    : (parentGenerationsFromProps || []);
  const selectedParentId = isControlled ? controlledSelectedParentId : hookResult.selectedParentId;
  const setSelectedParentId = isControlled ? onSelectedParentChange! : hookResult.setSelectedParentId;
  const segmentProgress = hookResult.segmentProgress.total > 0
    ? hookResult.segmentProgress
    : (segmentProgressFromProps || hookResult.segmentProgress);
  const isLoading = hookResult.isLoading;
  
  // Derive selectedParent from parentGenerations (works in both controlled and uncontrolled mode)
  const selectedParent = useMemo(() => {
    if (!selectedParentId) return null;
    return parentGenerations.find((p: any) => p.id === selectedParentId) || null;
  }, [parentGenerations, selectedParentId]);
  
  const hasFinalOutput = !!(selectedParent?.location);

  // Get variant badge data for the selected parent
  const { getBadgeData } = useVariantBadges(
    selectedParentId ? [selectedParentId] : [],
    !!selectedParentId && hasFinalOutput
  );
  const badgeData = selectedParentId ? getBadgeData(selectedParentId) : null;

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

  // Check for active join_clips_orchestrator tasks for this shot
  // Include parentGenerations IDs in query key so we can match by parent_generation_id
  const parentGenIdsForQuery = useMemo(() => parentGenerations.map(p => p.id), [parentGenerations]);
  const { data: activeJoinTask } = useQuery({
    queryKey: ['active-join-clips-task', shotId, projectId, parentGenIdsForQuery],
    queryFn: async () => {
      if (!shotId || !projectId) return null;

      // Query for join_clips_orchestrator tasks that are queued or generating
      const { data, error } = await supabase
        .from('tasks')
        .select('id, status, params')
        .eq('task_type', 'join_clips_orchestrator')
        .eq('project_id', projectId)
        .in('status', ['Queued', 'In Progress'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[FinalVideoSection] Error checking for active join tasks:', error);
        return null;
      }

      console.log('[FinalVideoSection] Found active join tasks:', data?.length, 'for project:', projectId.substring(0, 8));

      // Filter to find tasks that have this shot_id in their params
      // Also check parent_generation_id as fallback for tasks created before shot_id was added
      const parentGenIds = new Set(parentGenIdsForQuery);

      const matchingTask = (data || []).find((task: any) => {
        const params = task.params as Record<string, any>;
        const taskShotId = params?.orchestrator_details?.shot_id || params?.shot_id;
        const taskParentGenId = params?.orchestrator_details?.parent_generation_id || params?.parent_generation_id;

        // Match by shot_id (preferred)
        if (taskShotId === shotId) {
          console.log('[FinalVideoSection] Task matches by shot_id:', task.id.substring(0, 8));
          return true;
        }

        // Fallback: match by parent_generation_id (for tasks without shot_id)
        if (taskParentGenId && parentGenIds.has(taskParentGenId)) {
          console.log('[FinalVideoSection] Task matches by parent_generation_id:', task.id.substring(0, 8), 'parent:', taskParentGenId.substring(0, 8));
          return true;
        }

        return false;
      });

      if (matchingTask) {
        console.log('[FinalVideoSection] Found matching join task:', matchingTask.id.substring(0, 8), 'status:', matchingTask.status);
      } else if (data && data.length > 0) {
        console.log('[FinalVideoSection] No matching join task for this shot. Tasks found:', data.map((t: any) => ({
          id: t.id.substring(0, 8),
          shot_id: (t.params?.orchestrator_details?.shot_id || t.params?.shot_id)?.substring(0, 8) || 'NONE',
          parent_gen_id: (t.params?.orchestrator_details?.parent_generation_id || t.params?.parent_generation_id)?.substring(0, 8) || 'NONE'
        })));
      }

      return matchingTask || null;
    },
    enabled: !!shotId && !!projectId,
    refetchInterval: 3000, // Poll every 3 seconds to catch status changes
    staleTime: 1000,
  });

  const hasActiveJoinTask = !!activeJoinTask;

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

  // Handle delete
  const handleDelete = useCallback(() => {
    console.log('[FinalVideoDelete] handleDelete called', {
      selectedParentId: selectedParentId?.substring(0, 8),
      hasOnDelete: !!onDelete,
      isDeleting,
    });
    if (selectedParentId && onDelete) {
      console.log('[FinalVideoDelete] Calling onDelete with:', selectedParentId.substring(0, 8));
      onDelete(selectedParentId);
    } else {
      console.log('[FinalVideoDelete] Missing selectedParentId or onDelete');
    }
  }, [selectedParentId, onDelete, isDeleting]);
  
  // Determine if currently loading
  const isCurrentlyLoading = isLoading || isParentLoading;

  // Show skeleton when we know there will be a final video (from cache) but don't have it yet
  // The cache counts only completed videos (with location), so it's reliable for skeleton display
  // Show skeleton when:
  // 1. Cache says there's a final video (willHaveFinalVideo)
  // 2. No video is currently showing (!hasFinalOutput)
  // 3. Either: still loading data OR data loaded and has generations
  //    (The parentGenerations.length check handles stale cache after delete - if we finished
  //    loading and have no generations, the cache count is stale so don't show skeleton)
  const cachedFinalVideoCount = getFinalVideoCount?.(shotId) ?? null;
  const willHaveFinalVideo = cachedFinalVideoCount !== null && cachedFinalVideoCount > 0;
  const shouldShowSkeleton = willHaveFinalVideo && !hasFinalOutput && (isCurrentlyLoading || parentGenerations.length > 0);

  // [FinalVideoDelete] Debug logging for delete state
  console.log('[FinalVideoDelete] Render state', {
    selectedParentId: selectedParentId?.substring(0, 8),
    hasFinalOutput,
    parentGenerationsCount: parentGenerations.length,
    parentGenerationIds: parentGenerations.map((p: any) => p.id?.substring(0, 8)),
    isDeleting,
    hasOnDelete: !!onDelete,
  });

  // [FinalVideoSkeleton] Debug logging
  console.log('[FinalVideoSkeleton]', {
    shotId: shotId?.substring(0, 8),
    shouldShowSkeleton,
    cachedFinalVideoCount,
    willHaveFinalVideo,
    hasFinalOutput,
    selectedParentId: selectedParentId?.substring(0, 8),
    parentGenerationsCount: parentGenerations.length,
  });

  return (
    <div className="w-full">
      <Card className="border rounded-xl shadow-sm">
        <CardContent className="p-4 sm:p-6">
          {/* Header with title and output selector */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-base sm:text-lg font-light flex items-center gap-2">
              <Film className="w-5 h-5 text-muted-foreground" />
              Final Video
              {/* Variant count and NEW badge */}
              {hasFinalOutput && badgeData && (badgeData.derivedCount > 0 || badgeData.hasUnviewedVariants) && (
                <VariantBadge
                  derivedCount={badgeData.derivedCount}
                  unviewedVariantCount={badgeData.unviewedVariantCount}
                  hasUnviewedVariants={badgeData.hasUnviewedVariants}
                  variant="inline"
                  size="md"
                />
              )}
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
          {shouldShowSkeleton ? (
            // Skeleton state - reserve space for video that will load
            <div className="flex justify-center mt-4">
              <div
                style={(() => {
                  if (!projectAspectRatio) {
                    return { width: '50%' };
                  }
                  const [w, h] = projectAspectRatio.split(':').map(Number);
                  if (w && h) {
                    const ratio = w / h;
                    if (h > w) {
                      return { width: `min(100%, calc(60vh * ${ratio}))` };
                    }
                    return { width: '50%' };
                  }
                  return { width: '50%' };
                })()}
              >
                <Skeleton
                  className="w-full rounded-lg"
                  style={{
                    aspectRatio: projectAspectRatio
                      ? projectAspectRatio.replace(':', '/')
                      : '16/9'
                  }}
                />
              </div>
            </div>
          ) : hasFinalOutput && parentVideoRow ? (
            <div className="flex justify-center mt-4">
              {/* Constrain video size based on aspect ratio */}
              <div
                className="relative group"
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
                {/* Delete button overlay */}
                {onDelete && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="destructive"
                          size="icon"
                          className="h-8 w-8 bg-red-600/80 hover:bg-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete();
                          }}
                          disabled={isDeleting}
                        >
                          {isDeleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete final video</TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center pt-4 pb-1 text-muted-foreground">
              {isCurrentlyLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading...</span>
                </div>
              ) : hasActiveJoinTask ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Generating joined clip...</span>
                </div>
              ) : currentProgress.total > 0 && currentProgress.completed < currentProgress.total ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
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

