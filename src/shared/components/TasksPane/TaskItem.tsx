import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Settings, Key, Trash2, AlertCircle, Terminal, Coins, Monitor, LogOut, HelpCircle, MoreHorizontal, Play, ImageIcon, ExternalLink, FolderOpen } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { Button } from "@/shared/components/ui/button";
import { Task, TASK_STATUS } from '@/types/tasks';
import { getTaskDisplayName, taskSupportsProgress } from '@/shared/lib/taskConfig';
import { parseTaskParams, extractOrchestratorTaskId, extractOrchestratorRunId } from '@/shared/lib/taskTypeUtils';
import { useCancelTask } from '@/shared/hooks/useTasks';
import { useProject } from '@/shared/contexts/ProjectContext';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useToast } from '@/shared/hooks/use-toast';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { formatDistanceToNow, isValid } from 'date-fns';
import MediaLightbox from '@/shared/components/MediaLightbox';
import { useTaskTimestamp } from '@/shared/hooks/useUpdatingTimestamp';
import { useProcessingTimestamp, useCompletedTimestamp } from '@/shared/hooks/useProcessingTimestamp';
import { GenerationRow } from '@/types/shots';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTaskGenerationMapping } from '@/shared/lib/generationTaskBridge';
import { SharedTaskDetails } from '@/tools/travel-between-images/components/SharedTaskDetails';
import SharedMetadataDetails from '@/shared/components/SharedMetadataDetails';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useTaskType } from '@/shared/hooks/useTaskType';
import { useTaskDetails } from '@/shared/components/ShotImageManager/hooks/useTaskDetails';

// Function to create abbreviated task names for tight spaces
const getAbbreviatedTaskName = (fullName: string): string => {
  const abbreviations: Record<string, string> = {
    'Travel Between Images': 'Travel Video',
    'Image Generation': 'Image Gen',
    'Edit Travel (Kontext)': 'Edit Travel (K)',
    'Edit Travel (Flux)': 'Edit Travel (F)',
    'Training Data Helper': 'Training Data',
    'Video Generation': 'Video Gen',
    'Style Transfer': 'Style Transfer',
  };
  
  return abbreviations[fullName] || fullName;
};

interface TaskItemProps {
  task: Task;
  isNew?: boolean;
  isActive?: boolean;
  onOpenImageLightbox?: (task: Task, media: GenerationRow) => void;
  onOpenVideoLightbox?: (task: Task, media: GenerationRow[], videoIndex: number, initialVariantId?: string) => void;
  isMobileActive?: boolean; // For mobile two-step tap interaction
  onMobileActiveChange?: (taskId: string | null) => void;
  // Project indicator for "All Projects" mode
  showProjectIndicator?: boolean;
  projectName?: string;
}

// Timestamp formatting now handled by useTaskTimestamp hook

const TaskItem: React.FC<TaskItemProps> = ({ task, isNew = false, isActive = false, onOpenImageLightbox, onOpenVideoLightbox, isMobileActive = false, onMobileActiveChange, showProjectIndicator = false, projectName }) => {
  const { toast } = useToast();
  
  // Mobile detection hook - declare early for use throughout component
  const isMobile = useIsMobile();

  // Access project context early so it can be used in other hooks
  const { selectedProjectId, setSelectedProjectId } = useProject();
  
  // Access pane controls for setting active task
  const { setActiveTaskId, setIsTasksPaneOpen, tasksPaneWidth } = usePanes();
  
  // Get live-updating timestamp
  const createdTimeAgo = useTaskTimestamp(task.createdAt || (task as any).created_at);
  
  // Get processing timestamp for In Progress tasks
  const processingTime = useProcessingTimestamp({ 
    generationStartedAt: task.generationStartedAt || (task as any).generation_started_at
  });
  
  // Get completed timestamp for Complete tasks
  const completedTime = useCompletedTimestamp({
    generationProcessedAt: task.generationProcessedAt || (task as any).generation_processed_at
  });

  // Query client for optimistic updates
  const queryClient = useQueryClient();

  // Mutations
  const cancelTaskMutation = useCancelTask(selectedProjectId);

  // Progress checking will be done via direct API calls when needed
  // No longer loading all 1000+ tasks into memory

  // Shot-related hooks
  // Note: Local shot management logic removed (hoisted to TasksPane)
  const { setCurrentShotId } = useCurrentShot();

  // Fetch task type information including content_type
  const { data: taskTypeInfo } = useTaskType(task.taskType);

  // Use display_name from task_types table, with fallback to legacy logic
  const displayTaskType = taskTypeInfo?.display_name || getTaskDisplayName(task.taskType);
  const abbreviatedTaskType = getAbbreviatedTaskName(displayTaskType);
  
  // Debug: Log what task type is being rendered
  console.log('[TaskItem] Rendering task:', task.id.substring(0, 8), '| taskType:', task.taskType, '| displayTaskType:', displayTaskType);

  // Consolidated parameter parsing
  const taskParams = useMemo(() => {
    const parsed = typeof task.params === 'string' ? 
      (() => { try { return JSON.parse(task.params); } catch { return {}; } })() : 
      (task.params || {});
    
    const promptText = parsed?.orchestrator_details?.prompt || parsed?.prompt || '';
    return { parsed, promptText };
  }, [task.params]);

  // Consolidated task type detection using content_type from database
  // With fallback for known image task types that may not have content_type set in DB
  const taskInfo = useMemo(() => {
    const dbContentType = taskTypeInfo?.content_type;
    
    // Fallback: Infer content_type from task type name if not in database
    // This ensures "Open Image" button shows for image editing tasks
    const knownImageTaskTypes = [
      'image_inpaint',
      'qwen_image',
      'qwen_image_2512',
      'z_image_turbo',
      'qwen_image_edit',
      'image_generation',
      'magic_edit',
      'kontext_image_edit',
      'flux_image_edit',
      'upscale_image',
      'style_transfer',
    ];
    const inferredContentType = knownImageTaskTypes.includes(task.taskType) ? 'image' : null;
    const contentType = dbContentType || inferredContentType;
    
    const isVideoTask = contentType === 'video';
    const isImageTask = contentType === 'image';
    // For individual_travel_segment tasks with child_generation_id, show button even without outputLocation
    // (because the variant may not be primary, so outputLocation won't be synced to the task)
    const hasChildGenerationId = task.taskType === 'individual_travel_segment' && !!taskParams.parsed?.child_generation_id;
    const isCompletedVideoTask = isVideoTask && task.status === 'Complete' && (!!task.outputLocation || hasChildGenerationId);
    const isCompletedImageTask = isImageTask && task.status === 'Complete';
    // Show tooltips for all video and image tasks
    const showsTooltip = (isVideoTask || isImageTask);
    
    // DEBUG: Log task type detection
    console.log('[OpenImageButtonDebug] Task type detection:', {
      taskId: task.id?.substring(0, 8),
      taskType: task.taskType,
      dbContentType: dbContentType || 'null',
      inferredContentType: inferredContentType || 'null',
      finalContentType: contentType || 'null',
      isKnownImageType: knownImageTaskTypes.includes(task.taskType),
      isImageTask,
      isCompletedImageTask,
      status: task.status,
      hasOutputLocation: !!task.outputLocation,
    });
    
    return { 
      isVideoTask, 
      isImageTask, 
      isCompletedVideoTask, 
      isCompletedImageTask,
      showsTooltip,
      contentType,
      // Legacy properties for backward compatibility (can be removed later)
      isTravelTask: isVideoTask, 
      isSingleImageTask: isImageTask,
      isCompletedTravelTask: isCompletedVideoTask
    };
  }, [taskTypeInfo?.content_type, task.status, task.outputLocation, task.taskType]);

  // Check if this is a successful Image Generation task with output
  const hasGeneratedImage = React.useMemo(() => {
    return taskInfo.isImageTask && task.status === 'Complete' && task.outputLocation;
  }, [taskInfo.isImageTask, task.status, task.outputLocation]);

  // Fetch the actual generation record for this task
  // Use the generalized bridge for task-to-generation mapping
  const { data: actualGeneration, isLoading: isLoadingGeneration, error: generationError } = useTaskGenerationMapping(
    task.id, 
    hasGeneratedImage ? task.outputLocation : null, 
    task.projectId
  );
  
  // DEBUG: Log generation fetching for image tasks
  React.useEffect(() => {
    if (taskInfo.isImageTask && hasGeneratedImage) {
      console.log('[OpenImageButtonDebug] Generation fetch status:', {
        taskId: task.id?.substring(0, 8),
        taskType: task.taskType,
        hasGeneratedImage,
        outputLocation: task.outputLocation?.substring(0, 50) || 'none',
        isLoadingGeneration,
        hasActualGeneration: !!actualGeneration,
        actualGenerationId: actualGeneration?.id?.substring(0, 8) || 'none',
        generationError: generationError?.message || 'none',
      });
    }
  }, [taskInfo.isImageTask, hasGeneratedImage, task.id, task.taskType, task.outputLocation, isLoadingGeneration, actualGeneration, generationError]);
  
  // Legacy fallback - can be removed once bridge is stable
  const { data: legacyGeneration } = useQuery({
    queryKey: ['generation-for-task-legacy', task.id, task.outputLocation],
    queryFn: async () => {
      if (!hasGeneratedImage || !task.outputLocation || actualGeneration !== undefined) return null;
      
      // Debug: Check if this task has the generation_created flag set
      const { data: taskCheck, error: taskCheckError } = await supabase
        .from('tasks')
        .select('generation_created')
        .eq('id', task.id)
        .single();
      
      if (!taskCheckError && taskCheck) {
        console.log(`[TaskFetchGeneration] Debug: Task ${task.id} generation_created flag:`, taskCheck.generation_created);
      }
      
      // Debug: Check if any generation exists with this output location (project agnostic)
      const { data: anyGeneration, error: anyGenerationError } = await supabase
        .from('generations')
        .select('id, project_id, location')
        .eq('location', task.outputLocation)
        .maybeSingle();
      
      if (!anyGenerationError && anyGeneration) {
        console.log(`[TaskFetchGeneration] Debug: Found generation with location ${task.outputLocation}:`, {
          id: anyGeneration.id,
          project_id: anyGeneration.project_id,
          expected_project_id: task.projectId,
          project_match: anyGeneration.project_id === task.projectId
        });
      } else if (anyGenerationError) {
        console.error(`[TaskFetchGeneration] Debug: Error checking for any generation:`, anyGenerationError);
      } else {
        console.log(`[TaskFetchGeneration] Debug: No generation found with location ${task.outputLocation}`);
      }
      
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .eq('location', task.outputLocation)
        .eq('project_id', task.projectId)
        .maybeSingle();
      
      if (error) {
        console.error('[TaskFetchGeneration] Error fetching generation for task:', {
          taskId: task.id,
          taskType: task.taskType,
          outputLocation: task.outputLocation,
          projectId: task.projectId,
          error: {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            fullError: error
          }
        });
        return null;
      }
      
      if (!data) {
        console.warn('[TaskFetchGeneration] No generation found for completed task:', {
          taskId: task.id,
          taskType: task.taskType,
          outputLocation: task.outputLocation,
          projectId: task.projectId
        });
      }
      
      return data;
    },
    enabled: hasGeneratedImage && !!task.outputLocation,
  });

  // Create GenerationRow data for MediaLightbox using the actual generation
  // Fallback: If no generation record exists, create a minimal GenerationRow from outputLocation
  const generationData: GenerationRow | null = React.useMemo(() => {
    // If we have an outputLocation but no generation record, create a fallback GenerationRow
    // This allows "Open Image" button to work even when generation wasn't created in DB
    if (taskInfo.isImageTask && hasGeneratedImage && task.outputLocation && !actualGeneration) {
      // Extract source generation ID from task params for variant fetching
      // Image edit tasks (qwen_image_edit, image_inpaint, etc.) edit an existing image
      // The source generation is where variants should be fetched from
      const sourceGenerationId = 
        taskParams.parsed?.based_on ||
        taskParams.parsed?.source_generation_id ||
        taskParams.parsed?.generation_id ||
        taskParams.parsed?.input_generation_id ||
        taskParams.parsed?.parent_generation_id;
      
      // DEBUG: Log all task param keys to find the right source field
      console.log('[OpenImageButtonDebug] Creating fallback generationData from outputLocation:');
      console.log('[OpenImageButtonDebug] taskId:', task.id?.substring(0, 8));
      console.log('[OpenImageButtonDebug] taskType:', task.taskType);
      console.log('[OpenImageButtonDebug] outputLocation:', task.outputLocation?.substring(0, 50) || 'none');
      console.log('[OpenImageButtonDebug] sourceGenerationId:', sourceGenerationId?.substring(0, 8) || 'none');
      console.log('[OpenImageButtonDebug] taskParams.parsed keys:', taskParams.parsed ? Object.keys(taskParams.parsed).join(', ') : 'none');
      // Log specific fields that might contain generation ID
      if (taskParams.parsed) {
        console.log('[OpenImageButtonDebug] based_on:', taskParams.parsed?.based_on?.substring(0, 8) || 'none');
        console.log('[OpenImageButtonDebug] source_generation_id:', taskParams.parsed?.source_generation_id?.substring(0, 8) || 'none');
        console.log('[OpenImageButtonDebug] generation_id:', taskParams.parsed?.generation_id?.substring(0, 8) || 'none');
        console.log('[OpenImageButtonDebug] input_generation_id:', taskParams.parsed?.input_generation_id?.substring(0, 8) || 'none');
        console.log('[OpenImageButtonDebug] parent_generation_id:', taskParams.parsed?.parent_generation_id?.substring(0, 8) || 'none');
      }
      
      // Create a minimal GenerationRow from the outputLocation
      // Include parent_generation_id for variant fetching if we found a source
      return {
        id: task.id, // Use task ID as a temporary ID
        location: task.outputLocation,
        imageUrl: task.outputLocation,
        thumbUrl: task.outputLocation, // Use same URL for thumbnail
        type: 'image',
        createdAt: task.createdAt || new Date().toISOString(),
        metadata: task.params || {},
        taskId: task.id,
        // CRITICAL: Set generation_id to the source generation so that magic edit
        // uses the correct based_on value (generation ID, not task ID)
        generation_id: sourceGenerationId || undefined,
        // CRITICAL: Set parent_generation_id for variant fetching
        // MediaLightbox will use this to fetch variants from the source image
        parent_generation_id: sourceGenerationId || undefined,
        // Also set based_on for the "Based On" feature
        based_on: sourceGenerationId || undefined,
      } as GenerationRow;
    }
    
    // DEBUG: Log why generationData might be null for image tasks
    if (taskInfo.isImageTask && (!hasGeneratedImage || !actualGeneration)) {
      console.log('[OpenImageButtonDebug] generationData is null:', {
        taskId: task.id?.substring(0, 8),
        taskType: task.taskType,
        hasGeneratedImage,
        hasActualGeneration: !!actualGeneration,
        hasOutputLocation: !!task.outputLocation,
        taskStatus: task.status,
        outputLocation: task.outputLocation?.substring(0, 50) || 'none',
      });
    }
    
    if (!hasGeneratedImage || !actualGeneration) return null;
    
    // The field in the database is 'based_on' - check for it at the top level
    const basedOnValue = (actualGeneration as any).based_on || (actualGeneration.metadata as any)?.based_on || null;
    
    // Transform shot associations from shot_generations array
    const shotGenerations = (actualGeneration as any).shot_generations || [];
    const shotIds = shotGenerations.map((sg: any) => sg.shot_id);
    const timelineFrames = shotGenerations.reduce((acc: any, sg: any) => {
      acc[sg.shot_id] = sg.timeline_frame;
      return acc;
    }, {});
    
    // Also create all_shot_associations format for compatibility
    const allShotAssociations = shotGenerations.map((sg: any) => ({
      shot_id: sg.shot_id,
      position: sg.timeline_frame,
    }));
    
    // Log what's in actualGeneration to understand what data we have
    console.log('[TasksPane:AddToShot] 📦 Creating generationData from actualGeneration:', {
      taskId: task.id.substring(0, 8),
      generationId: actualGeneration.id.substring(0, 8),
      hasBasedOnAtTopLevel: !!(actualGeneration as any).based_on,
      basedOnAtTopLevel: (actualGeneration as any).based_on?.substring(0, 8) || 'null',
      hasBasedOnInMetadata: !!(actualGeneration.metadata as any)?.based_on,
      basedOnInMetadata: (actualGeneration.metadata as any)?.based_on?.substring(0, 8) || 'null',
      finalBasedOnValue: basedOnValue?.substring(0, 8) || 'null',
      hasShotAssociations: shotGenerations.length > 0,
      shotAssociationsCount: shotGenerations.length,
      shotIds: shotIds.map((id: string) => id.substring(0, 8)),
      hasLocation: !!actualGeneration.location,
      hasThumbnailUrl: !!(actualGeneration as any).thumbnail_url,
      locationPreview: (actualGeneration.location || '').substring(0, 80),
      thumbnailUrlPreview: ((actualGeneration as any).thumbnail_url || '').substring(0, 80),
      finalImageUrl: (actualGeneration.location || (actualGeneration as any).thumbnail_url || '').substring(0, 80),
      finalThumbUrl: ((actualGeneration as any).thumbnail_url || actualGeneration.location || '').substring(0, 80),
      actualGenerationKeys: Object.keys(actualGeneration).join(', '),
      timestamp: Date.now()
    });
    
    // Database fields: location (full image), thumbnail_url (thumb)
    const imageUrl = actualGeneration.location || (actualGeneration as any).thumbnail_url;
    const thumbUrl = (actualGeneration as any).thumbnail_url || actualGeneration.location;
    
    // DEBUG: Log successful generationData creation for image tasks
    if (taskInfo.isImageTask) {
      console.log('[OpenImageButtonDebug] generationData created successfully:', {
        taskId: task.id?.substring(0, 8),
        taskType: task.taskType,
        generationId: actualGeneration.id?.substring(0, 8),
        hasLocation: !!actualGeneration.location,
        hasImageUrl: !!imageUrl,
        hasThumbUrl: !!thumbUrl,
      });
    }
    
    return {
      id: actualGeneration.id, // Use the real generation ID
      location: actualGeneration.location,
      imageUrl,
      thumbUrl,
      type: actualGeneration.type || 'image',
      createdAt: (actualGeneration as any).created_at || actualGeneration.createdAt, // Handle both snake_case and camelCase
      metadata: actualGeneration.metadata || {},
      // CRITICAL: Include based_on field at TOP LEVEL for "Based On" feature in MediaLightbox
      based_on: basedOnValue,
      // Also include as sourceGenerationId for compatibility
      sourceGenerationId: basedOnValue,
      // CRITICAL: Include parent_generation_id for variant fetching in MediaLightbox
      // When viewing a child generation, variants should be fetched from the parent
      parent_generation_id: (actualGeneration as any).parent_generation_id || undefined,
      // Shot associations for "Add to Shot" button state
      shotIds,
      timelineFrames,
      all_shot_associations: allShotAssociations,
      // Include variant name from generation record
      name: (actualGeneration as any).name || undefined,
    } as GenerationRow;
  }, [hasGeneratedImage, actualGeneration, task.id]);

  // State to control when to fetch video generations (on hover)
  const [shouldFetchVideo, setShouldFetchVideo] = useState(false);
  
  // State to track if user clicked the button (not just hovered)
  const [waitingForVideoToOpen, setWaitingForVideoToOpen] = useState(false);
  
  // Fetch video generations for video tasks - only when hovering
  const { data: videoGenerations, isLoading: isLoadingVideoGen } = useQuery({
    queryKey: ['video-generations-for-task', task.id, task.outputLocation],
    queryFn: async () => {
      if (!taskInfo.isVideoTask || task.status !== 'Complete') return null;

      // For individual_travel_segment tasks with child_generation_id, fetch that generation directly
      // This handles the case where make_primary_variant=false (variant location != generation location)
      const childGenerationId = taskParams.parsed?.child_generation_id;
      if (task.taskType === 'individual_travel_segment' && childGenerationId) {
        console.log('[TaskItem] individual_travel_segment: fetching child generation directly', {
          childGenerationId: childGenerationId.substring(0, 8),
          taskId: task.id.substring(0, 8),
        });

        // Fetch the child generation with its variants to get the correct video URL
        const { data: childGen, error: childError } = await supabase
          .from('generations')
          .select('*, generation_variants(*)')
          .eq('id', childGenerationId)
          .single();

        if (!childError && childGen) {
          // Find the variant created by this task (by source_task_id in params) or primary variant
          const variants = (childGen as any).generation_variants || [];
          const taskVariant = variants.find((v: any) => v.params?.source_task_id === task.id);
          const primaryVariant = variants.find((v: any) => v.is_primary);
          const targetVariant = taskVariant || primaryVariant;

          console.log('[TaskItem] individual_travel_segment: found generation with variants', {
            generationId: childGen.id.substring(0, 8),
            variantCount: variants.length,
            taskVariantId: taskVariant?.id?.substring(0, 8) || 'none',
            primaryVariantId: primaryVariant?.id?.substring(0, 8) || 'none',
            targetVariantLocation: targetVariant?.location ? 'has URL' : 'no URL',
          });

          // If we found a specific variant for this task, use its location
          // Otherwise fall back to generation's location (which may be from a different variant)
          if (targetVariant) {
            return [{
              ...childGen,
              location: targetVariant.location,
              thumbnail_url: targetVariant.thumbnail_url || childGen.thumbnail_url,
              // Store variant info for reference
              _variant_id: targetVariant.id,
              _variant_is_primary: targetVariant.is_primary,
            }];
          }
          return [childGen];
        }
      }

      // Try to find generation by output location first (most reliable)
      if (task.outputLocation) {
        const { data: byLocation, error: locError } = await supabase
          .from('generations')
          .select('*')
          .eq('location', task.outputLocation)
          .eq('project_id', task.projectId);

        if (!locError && byLocation && byLocation.length > 0) {
          return byLocation;
        }

        // If not found in generations, check generation_variants by location
        // This handles individual_travel_segment with make_primary_variant=false
        const { data: variantByLocation, error: variantError } = await supabase
          .from('generation_variants')
          .select('id, generation_id, location, thumbnail_url, is_primary, params')
          .eq('location', task.outputLocation)
          .limit(1);

        if (!variantError && variantByLocation && variantByLocation.length > 0) {
          const variant = variantByLocation[0];
          console.log('[TaskItem] Found video in generation_variants by location', {
            variantId: variant.id.substring(0, 8),
            generationId: variant.generation_id.substring(0, 8),
          });

          // Fetch the parent generation separately (safer than join syntax)
          const { data: parentGen, error: parentError } = await supabase
            .from('generations')
            .select('*')
            .eq('id', variant.generation_id)
            .single();

          if (!parentError && parentGen) {
            return [{
              ...parentGen,
              location: variant.location,
              thumbnail_url: variant.thumbnail_url || parentGen.thumbnail_url,
              _variant_id: variant.id,
              _variant_is_primary: variant.is_primary,
            }];
          }
        }
      }

      // Fallback: Search by task ID in the tasks JSONB array
      console.log('[TaskItem] Fallback: searching generations by task ID in JSONB', {
        taskId: task.id.substring(0, 8),
      });
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .filter('tasks', 'cs', JSON.stringify([task.id]))
        .eq('project_id', task.projectId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[TaskItem] Error fetching video generations:', error);
        return null;
      }

      console.log('[TaskItem] Fallback query result', {
        taskId: task.id.substring(0, 8),
        found: data?.length || 0,
      });
      return data || [];
    },
    enabled: shouldFetchVideo && taskInfo.isVideoTask && task.status === 'Complete',
  });

  // Log when videoGenerations changes
  React.useEffect(() => {
    if (task.taskType === 'individual_travel_segment') {
      console.log('[TaskItem] videoGenerations updated', {
        taskId: task.id.substring(0, 8),
        isLoading: isLoadingVideoGen,
        hasData: !!videoGenerations,
        count: videoGenerations?.length || 0,
        firstId: videoGenerations?.[0]?.id?.substring(0, 8) || 'none',
      });
    }
  }, [videoGenerations, isLoadingVideoGen, task.id, task.taskType]);

  // Extract travel-specific data
  const travelData = React.useMemo(() => {
    if (!taskInfo.isVideoTask) return { imageUrls: [], videoOutputs: null };
    
    // For individual_travel_segment, use top-level input_image_paths_resolved (2 images for this segment)
    // For travel_orchestrator, use orchestrator_details (all images)
    const isIndividualSegment = task.taskType === 'individual_travel_segment';
    const imageUrls = isIndividualSegment
      ? (taskParams.parsed?.input_image_paths_resolved || [])
      : (taskParams.parsed?.orchestrator_details?.input_image_paths_resolved || 
         taskParams.parsed?.input_image_paths_resolved || 
         []);
    
    // For edit-video tasks, the REAL parent is in task params, not the generation's parent_generation_id
    // The generation's parent_generation_id points to a placeholder created by GenMigration
    // But we need the ORIGINAL input video (from orchestrator_details.parent_generation_id)
    const taskParentGenerationId = 
      taskParams.parsed?.parent_generation_id ||
      taskParams.parsed?.orchestrator_details?.parent_generation_id ||
      taskParams.parsed?.full_orchestrator_payload?.parent_generation_id;
    
    // Convert video generations from database to GenerationRow format
    const videoOutputs = videoGenerations?.map(gen => {
      const genAny = gen as any; // Type assertion for database fields not in type definition

      // For individual_travel_segment: variants are stored ON the segment generation itself
      // Do NOT pass parent_generation_id so MediaLightbox uses the segment's ID for variant fetching
      // For other tasks: use task params parent_generation_id (original input) over generation's parent (placeholder)
      const isIndividualSegment = task.taskType === 'individual_travel_segment';
      const effectiveParentGenId = isIndividualSegment
        ? undefined  // Let MediaLightbox use the segment's own ID
        : (taskParentGenerationId || genAny.parent_generation_id);

      // DEBUG: Log what we're getting from the database
      console.log('[VariantFetchDebug] Video generation from DB:', {
        id: gen.id?.substring(0, 8),
        taskType: task.taskType,
        isIndividualSegment,
        hasParentGenerationId: !!genAny.parent_generation_id,
        parentGenerationId: genAny.parent_generation_id?.substring(0, 8) || 'none',
        taskParentGenerationId: taskParentGenerationId?.substring(0, 8) || 'none',
        effectiveParentGenId: effectiveParentGenId?.substring(0, 8) || 'none',
        allKeys: Object.keys(gen).join(', '),
      });

      return {
        id: gen.id,
        location: gen.location,
        imageUrl: gen.location,
        thumbUrl: gen.thumbnail_url || gen.location,
        videoUrl: genAny.video_url || gen.location,
        type: gen.type || 'video',
        createdAt: gen.created_at,
        taskId: genAny.task_id, // ✅ Include taskId for proper task details display
        metadata: gen.params || {},
        name: genAny.name || undefined, // ✅ Include variant name from generation record
        // CRITICAL: For individual_travel_segment, don't set parent_generation_id
        // (variants are on the segment itself, not a parent)
        // For other tasks: include parent_generation_id for variant fetching in MediaLightbox
        parent_generation_id: effectiveParentGenId || undefined,
        // Preserve variant info for initial variant selection in MediaLightbox
        _variant_id: genAny._variant_id,
        _variant_is_primary: genAny._variant_is_primary,
      } as GenerationRow;
    }) || null;
    
    return {
      imageUrls,
      videoOutputs
    };
  }, [taskInfo.isVideoTask, taskParams.parsed, videoGenerations]);

  const imagesToShow = travelData.imageUrls.slice(0, 4);
  const extraImageCount = Math.max(0, travelData.imageUrls.length - imagesToShow.length);

  // Extract shot_id for video tasks
  const shotId: string | null = React.useMemo(() => {
    if (!taskInfo.isVideoTask) return null;
    
    const params = task.params as any;
    
    // Try different locations where shot_id might be stored based on task type
    return (
      params?.orchestrator_details?.shot_id ||           // travel_orchestrator, wan_2_2_i2v
      params?.full_orchestrator_payload?.shot_id ||      // travel_stitch, wan_2_2_i2v fallback
      params?.shot_id ||                                 // direct shot_id
      null
    );
  }, [task, taskInfo.isVideoTask]);

  // Navigation setup
  const navigate = useNavigate();
  
  // State for hover functionality
  const [isHoveringTaskItem, setIsHoveringTaskItem] = useState<boolean>(false);
  
  // Trigger video fetch when hovering over completed video tasks
  useEffect(() => {
    if (isHoveringTaskItem && taskInfo.isCompletedVideoTask && !shouldFetchVideo) {
      setShouldFetchVideo(true);
    }
  }, [isHoveringTaskItem, taskInfo.isCompletedVideoTask, shouldFetchVideo]);
  
  // State for video lightbox
  // No longer need video lightbox state - hoisted to TasksPane
  
  // State for ID copy indicator
  const [idCopied, setIdCopied] = useState<boolean>(false);
  
  // Task details no longer needed here - handled by TasksPane
  
  // Fetch the actual error message if this is a cascaded failure
  const cascadedTaskIdMatch = task.errorMessage?.match(/Cascaded failed from related task ([a-f0-9-]+)/i);
  const cascadedTaskId = cascadedTaskIdMatch ? cascadedTaskIdMatch[1] : null;
  
  const { data: cascadedTask, isLoading: isCascadedTaskLoading } = useQuery({
    queryKey: ['cascaded-task-error', cascadedTaskId],
    queryFn: async () => {
      if (!cascadedTaskId) return null;
      
      console.log('[TaskItem] Fetching cascaded task error for:', cascadedTaskId);
      
      const { data, error } = await supabase
        .from('tasks')
        .select('error_message, task_type')
        .eq('id', cascadedTaskId)
        .single();
      
      if (error) {
        console.error('[TaskItem] Failed to fetch cascaded task error:', error);
        return null;
      }
      
      console.log('[TaskItem] Cascaded task data:', {
        task_type: data?.task_type,
        has_error_message: !!data?.error_message,
        error_message: data?.error_message
      });
      
      return data;
    },
    enabled: !!cascadedTaskId && task.status === 'Failed',
  });
  
  // Lightbox state no longer tracked here

  // Local state to show progress percentage temporarily
  const [progressPercent, setProgressPercent] = useState<number | null>(null);

  const handleCancel = () => {
    // Optimistically update this task to 'Cancelled' status immediately
    // This will hide the "Check Progress" button instantly
    const taskId = task.id;
    
    // Update all paginated queries that might contain this task
    queryClient.setQueriesData(
      { queryKey: ['tasks', 'paginated', selectedProjectId] },
      (oldData: any) => {
        if (!oldData?.tasks) return oldData;
        
        return {
          ...oldData,
          tasks: oldData.tasks.map((t: any) => {
            if (t.id === taskId) {
              return { ...t, status: 'Cancelled' };
            }
            return t;
          }),
        };
      }
    );
    
    // Cancel task (subtasks will be automatically cancelled if this is an orchestrator)
    cancelTaskMutation.mutate(task.id, {
      onError: (error) => {
        // Revert the optimistic update on error
        // The task status will be restored when queries are refetched
        queryClient.invalidateQueries({ queryKey: ['tasks', 'paginated', selectedProjectId] });
        
        toast({
          title: 'Cancellation Failed',
          description: error.message || 'Could not cancel the task.',
          variant: 'destructive',
        });
      },
    });
  };

  // Check progress for orchestrator tasks by querying subtasks directly
  const handleCheckProgress = async () => {
    if (!selectedProjectId) return;

    // Get orchestrator ID from this task's params
    const params = parseTaskParams(task.params);
    const orchestratorDetails = params.orchestrator_details || {};
    const orchestratorId = orchestratorDetails.orchestrator_task_id || params.orchestrator_task_id || params.task_id || task.id;

    try {
      // Query subtasks directly using server-side filtering (matches backend logic)
      const { data: subtasks, error } = await supabase
        .from('tasks')
        .select('id, status')
        .eq('project_id', selectedProjectId)
        .neq('id', task.id)
        .or([
          `params->>orchestrator_task_id_ref.eq.${orchestratorId}`,
          `params->>orchestrator_task_id.eq.${orchestratorId}`,
          `params->orchestrator_details->>orchestrator_task_id.eq.${orchestratorId}`,
        ].join(','));

      if (error) throw error;

      // Calculate progress
      const total = subtasks?.length || 0;
      const completed = subtasks?.filter(t => t.status === 'Complete').length || 0;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

      // Show inline for 5s
      setProgressPercent(percent);
      setTimeout(() => setProgressPercent(null), 5000);
    } catch (error) {
      console.error('[TaskItem] Error checking progress:', error);
      toast({
        title: "Error",
        description: "Failed to check progress",
        variant: "destructive",
      });
    }
  };

  // Handler for visiting shot
  const handleVisitShot = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent any parent click handlers
    e.preventDefault(); // Prevent default behavior
    if (!shotId) return;
    
    // Reset hover state immediately
    setIsHoveringTaskItem(false);
    
    setCurrentShotId(shotId);
    navigate(`/tools/travel-between-images#${shotId}`, { state: { fromShotClick: true } });
  };

  // Handler for opening video lightbox
  const handleViewVideo = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    console.log('[TaskItem] handleViewVideo clicked', {
      taskId: task.id.substring(0, 8),
      taskType: task.taskType,
      hasOnOpenVideoLightbox: !!onOpenVideoLightbox,
      hasVideoOutputs: !!travelData.videoOutputs,
      videoOutputsLength: travelData.videoOutputs?.length || 0,
      shouldFetchVideo,
      isLoadingVideoGen,
      childGenerationId: taskParams.parsed?.child_generation_id?.substring(0, 8) || 'none',
    });

    // Reset hover state immediately
    setIsHoveringTaskItem(false);

    // If video data is already loaded, open lightbox immediately
    if (onOpenVideoLightbox && travelData.videoOutputs && travelData.videoOutputs.length > 0) {
      const initialVariantId = (travelData.videoOutputs[0] as any)?._variant_id;
      console.log('[TaskItem] Opening lightbox immediately with videoOutputs', {
        firstOutputId: travelData.videoOutputs[0]?.id?.substring(0, 8),
        firstOutputLocation: travelData.videoOutputs[0]?.location?.substring(0, 60),
        variantId: initialVariantId?.substring(0, 8) || 'none',
      });
      onOpenVideoLightbox(task, travelData.videoOutputs, 0, initialVariantId);
    } else {
      // Video data not loaded yet - trigger fetch and wait for it
      // This fixes the race condition where user clicks before hovering
      console.log('[TaskItem] Video data not ready, triggering fetch and waiting', {
        shouldFetchVideo,
        waitingForVideoToOpen,
      });
      if (!isMobile) {
        setActiveTaskId(task.id);
        setIsTasksPaneOpen(true);
      }
      setShouldFetchVideo(true);
      setWaitingForVideoToOpen(true);
    }
  };

  // Auto-open lightbox when video data becomes available after clicking (not just hovering)
  useEffect(() => {
    if (waitingForVideoToOpen) {
      console.log('[TaskItem] waitingForVideoToOpen effect', {
        taskId: task.id.substring(0, 8),
        hasVideoOutputs: !!travelData.videoOutputs,
        videoOutputsLength: travelData.videoOutputs?.length || 0,
        hasOnOpenVideoLightbox: !!onOpenVideoLightbox,
      });
    }
    if (waitingForVideoToOpen && travelData.videoOutputs && travelData.videoOutputs.length > 0) {
      const initialVariantId = (travelData.videoOutputs[0] as any)?._variant_id;
      console.log('[TaskItem] Auto-opening lightbox after fetch', {
        taskId: task.id.substring(0, 8),
        firstOutputId: travelData.videoOutputs[0]?.id?.substring(0, 8),
        variantId: initialVariantId?.substring(0, 8) || 'none',
      });
      if (onOpenVideoLightbox) {
        onOpenVideoLightbox(task, travelData.videoOutputs, 0, initialVariantId);
      }
      setWaitingForVideoToOpen(false); // Reset the flag
    }
  }, [travelData.videoOutputs, waitingForVideoToOpen, onOpenVideoLightbox, task]);

  // Handler for opening image lightbox
  const handleViewImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Reset hover state immediately
    setIsHoveringTaskItem(false);
    
    if (generationData) {
      // Use callback if provided
      if (onOpenImageLightbox) {
        onOpenImageLightbox(task, generationData);
      } else {
        // Fallback: maintain old behavior if no callback
        if (!isMobile) {
          setActiveTaskId(task.id);
          setIsTasksPaneOpen(true);
        }
        // (No local state to set since it's been removed)
      }
    }
  };

  const containerClass = cn(
    "relative p-3 mb-2 bg-zinc-800/95 rounded-md shadow border transition-colors overflow-hidden",
    isNew ? "border-teal-400 animate-[flash_3s_ease-in-out]" : 
    isActive ? "border-blue-500 bg-blue-900/20 ring-2 ring-blue-400/50" :
    "border-zinc-600 hover:border-zinc-400"
  );


  
  // Fetch video outputs for completed travel tasks - DISABLED to avoid per-item query spam in Tasks pane
  const videoOutputs: GenerationRow[] = React.useMemo(() => {
    return travelData.videoOutputs || [];
  }, [travelData.videoOutputs]);

  // Handler for mobile tap - two-step interaction: first tap reveals buttons, second tap uses them
  const handleMobileTap = (e: React.MouseEvent) => {
    if (!isMobile) return; // Only handle on mobile
    
    e.stopPropagation();
    e.preventDefault();
    
    // Check if this task has actionable content (buttons to show)
    // Note: For completed video tasks, we consider them actionable even before video data is loaded,
    // because we'll fetch videos on first tap and show "Loading..." button state
    const hasActionableContent = 
      taskInfo.isCompletedVideoTask || // Completed video tasks are always actionable (will load videos)
      (taskInfo.isVideoTask && shotId) ||
      (taskInfo.isImageTask && generationData);
    
    // For tasks with actionable content, use two-step flow
    if (hasActionableContent) {
      // If this task is already active (buttons revealed), execute the action
      if (isMobileActive) {
        // For completed video tasks - open video lightbox if video data is available
        if (taskInfo.isCompletedVideoTask && onOpenVideoLightbox && travelData.videoOutputs && travelData.videoOutputs.length > 0) {
          onMobileActiveChange?.(null); // Clear active state
          const initialVariantId = (travelData.videoOutputs[0] as any)?._variant_id;
          onOpenVideoLightbox(task, travelData.videoOutputs, 0, initialVariantId);
          return;
        }
        
        // For video tasks without loaded videos - navigate to shot to see videos
        if (taskInfo.isVideoTask && shotId) {
          onMobileActiveChange?.(null); // Clear active state
          setCurrentShotId(shotId);
          navigate(`/tools/travel-between-images#${shotId}`, { state: { fromShotClick: true } });
          return;
        }
        
        // For image generation tasks - open image if available
        if (taskInfo.isImageTask && generationData && onOpenImageLightbox) {
          onMobileActiveChange?.(null); // Clear active state
          onOpenImageLightbox(task, generationData);
          return;
        }
      } else {
        // First tap: reveal the action buttons by setting this task as active
        onMobileActiveChange?.(task.id);
        // Trigger video data fetch for video tasks
        if (taskInfo.isVideoTask && !shouldFetchVideo) {
          setShouldFetchVideo(true);
        }
        return;
      }
    }
    
    // For tasks without actionable content (e.g., Queued/In Progress), just toggle active state
    if (isMobileActive) {
      onMobileActiveChange?.(null);
    } else {
      onMobileActiveChange?.(task.id);
    }
  };

  const taskItemContent = (
    <div 
      className={containerClass}
      onMouseEnter={() => setIsHoveringTaskItem(true)}
      onMouseLeave={() => setIsHoveringTaskItem(false)}
      onClick={handleMobileTap}
    >
      <div className="flex justify-between items-center mb-1 gap-2">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-sm font-light text-zinc-200 whitespace-nowrap overflow-hidden text-ellipsis cursor-default min-w-0">
            {abbreviatedTaskType}
          </span>
          {/* Always-visible action buttons - pushed to right */}
          <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto">
            {/* ID copy button - always visible */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(task.id);
                    setIdCopied(true);
                    setTimeout(() => setIdCopied(false), 2000);
                  }}
                  className={cn(
                    "px-1 py-0.5 text-xs rounded transition-colors",
                    idCopied 
                      ? "text-green-400" 
                      : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700"
                  )}
                >
                  {idCopied ? 'copied' : 'id'}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {idCopied ? 'Copied!' : 'Copy task ID'}
              </TooltipContent>
            </Tooltip>
            
            {/* Project indicator - shown in "All Projects" mode (except current project) */}
            {showProjectIndicator && projectName && task.projectId !== selectedProjectId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      // Switch to this task's project
                      setSelectedProjectId(task.projectId);
                      // Navigate to home page after switching
                      navigate('/');
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedProjectId(task.projectId);
                      navigate('/');
                    }}
                    className={cn(
                      "p-1 rounded transition-colors text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700",
                      isMobile && "min-w-[32px] min-h-[32px] flex items-center justify-center"
                    )}
                    title={`Go to project: ${projectName}`}
                  >
                    <FolderOpen className={cn(isMobile ? "w-4 h-4" : "w-3 h-3")} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {projectName}
                </TooltipContent>
              </Tooltip>
            )}
            
            {/* Open Video button - show immediately for completed video tasks, fetch data on click if needed */}
            {taskInfo.isCompletedVideoTask && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleViewVideo}
                    onTouchEnd={(e) => {
                      // Reliable touch handling for iPad
                      e.preventDefault();
                      e.stopPropagation();
                      if (!(isLoadingVideoGen && waitingForVideoToOpen)) {
                        handleViewVideo(e as unknown as React.MouseEvent);
                      }
                    }}
                    className={cn(
                      "rounded transition-colors text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700",
                      isMobile ? "p-2 min-w-[32px] min-h-[32px]" : "p-1" // Larger touch target on mobile
                    )}
                    disabled={isLoadingVideoGen && waitingForVideoToOpen}
                  >
                    <Play className={cn(isMobile ? "w-4 h-4" : "w-3 h-3", isLoadingVideoGen && waitingForVideoToOpen && "animate-pulse")} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {isLoadingVideoGen && waitingForVideoToOpen ? 'Loading...' : 'Open Video'}
                </TooltipContent>
              </Tooltip>
            )}
            
            {/* Open Image button - for completed image tasks */}
            {taskInfo.isImageTask && generationData && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleViewImage}
                    onTouchEnd={(e) => {
                      // Reliable touch handling for iPad
                      e.preventDefault();
                      e.stopPropagation();
                      handleViewImage(e as unknown as React.MouseEvent);
                    }}
                    className={cn(
                      "rounded transition-colors text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700",
                      isMobile ? "p-2 min-w-[32px] min-h-[32px]" : "p-1" // Larger touch target on mobile
                    )}
                  >
                    <ImageIcon className={isMobile ? "w-4 h-4" : "w-3 h-3"} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Open Image
                </TooltipContent>
              </Tooltip>
            )}
            
            {/* Visit Shot button - when task has associated shot */}
            {shotId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleVisitShot}
                    onTouchEnd={(e) => {
                      // Reliable touch handling for iPad
                      e.preventDefault();
                      e.stopPropagation();
                      handleVisitShot(e as unknown as React.MouseEvent);
                    }}
                    className={cn(
                      "rounded transition-colors text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700",
                      isMobile ? "p-2 min-w-[32px] min-h-[32px]" : "p-1" // Larger touch target on mobile
                    )}
                  >
                    <ExternalLink className={isMobile ? "w-4 h-4" : "w-3 h-3"} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Visit Shot
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        <span
          className={`px-2 py-0.5 text-xs rounded-full flex-shrink-0 ${
            task.status === 'In Progress' ? 'bg-blue-500 text-blue-100' :
            task.status === 'Complete' ? 'bg-green-500 text-green-100' :
            task.status === 'Failed' ? 'bg-red-500 text-red-100' :
            task.status === 'Queued' ? 'bg-purple-500 text-purple-100' :
            task.status === 'Cancelled' ? 'bg-orange-500 text-orange-100' : 'bg-gray-500 text-gray-100'
          }`}
        >
          {task.status}
        </span>
      </div>
      {/* Image previews for Travel Between Images task */}
      {imagesToShow.length > 0 && (
        <div 
          className="flex items-center overflow-x-auto mb-1 mt-2"
        >
          <div className="flex items-center">
            {imagesToShow.map((url, idx) => (
              <img
                key={idx}
                src={url}
                alt={`input-${idx}`}
                className="w-12 h-12 object-cover rounded mr-1 border border-zinc-700"
              />
            ))}
            {extraImageCount > 0 && (
              <span className="text-xs text-zinc-400 ml-1">+ {extraImageCount}</span>
            )}
          </div>
        </div>
      )}
      {/* Show prompt for Image Generation tasks (not video tasks like travel) */}
      {taskParams.promptText && !taskInfo.isVideoTask && (
        <div className="mb-1 mt-3">
          <div className="bg-blue-500/10 border border-blue-400/20 rounded px-2 py-1.5 flex items-center justify-between">
            <div className="text-xs text-zinc-200 flex-1 min-w-0 pr-2">
              "{taskParams.promptText.length > 50 ? `${taskParams.promptText.substring(0, 50)}...` : taskParams.promptText}"
            </div>
            {/* Tiny thumbnail for successful Image Generation tasks */}
            {generationData && (
              <button
                onClick={() => onOpenImageLightbox && onOpenImageLightbox(task, generationData)}
                className="w-8 h-8 rounded border border-zinc-500 overflow-hidden hover:border-zinc-400 transition-colors flex-shrink-0"
              >
                <img
                  src={generationData.imageUrl}
                  alt="Generated image"
                  className="w-full h-full object-cover"
                />
              </button>
            )}
          </div>
        </div>
      )}
      <div className="flex items-center text-[11px] text-zinc-400">
        <span className="flex-1">
          {task.status === 'In Progress' && processingTime ? 
            processingTime : 
            task.status === 'Complete' && completedTime ?
            completedTime :
            `Created ${createdTimeAgo}`
          }
        </span>
        
        {/* Variant Name - Same line as timestamp */}
        {(() => {
          // For video tasks, use the first video's name; for image tasks, use generationData's name
          const variantName = taskInfo.isVideoTask 
            ? travelData.videoOutputs?.[0]?.name 
            : generationData?.name;
          
          if (!variantName) return null;
          
          return (
            <span className="ml-2 px-1.5 py-0.5 bg-black/50 text-white text-[10px] rounded-md flex-shrink-0">
              {variantName}
            </span>
          );
        })()}
        
        {/* Action buttons for queued/in progress tasks */}
        {(task.status === 'Queued' || task.status === 'In Progress') && (
          <div className="flex items-center flex-shrink-0">
            {taskSupportsProgress(task.taskType) && task.status === 'In Progress' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCheckProgress}
                disabled={progressPercent !== null}
                className="px-2 py-1 min-w-[80px] h-auto text-blue-400 hover:bg-blue-900/20 hover:text-blue-300 flex flex-col items-center justify-center"
              >
                <div className="text-xs leading-tight">
                  {progressPercent === null ? (
                    <>
                      <div>Check</div>
                      <div>Progress</div>
                    </>
                  ) : (
                    <>
                      <div>{progressPercent}%</div>
                      <div>Complete</div>
                    </>
                  )}
                </div>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={cancelTaskMutation.isPending}
              className="px-2 py-0.5 text-red-400 hover:bg-red-900/20 hover:text-red-300"
            >
              {cancelTaskMutation.isPending ? 'Cancelling...' : 'Cancel'}
            </Button>
          </div>
        )}
        
      </div>
      
      {/* Error message for failed tasks - only shows on hover */}
      {task.status === 'Failed' && task.errorMessage && isHoveringTaskItem && (
        <div className="mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-200 animate-in slide-in-from-top-2 duration-200">
          <div className="font-semibold text-red-300 mb-1">Error:</div>
          {cascadedTaskId ? (
            <div>
              {isCascadedTaskLoading ? (
                <div className="text-zinc-400 text-[10px] mb-1">Loading error from related task...</div>
              ) : cascadedTask?.error_message ? (
                <div>
                  <div className="text-zinc-400 text-[10px] mb-1">
                    Cascaded from related task ({getTaskDisplayName(cascadedTask.task_type)}):
                  </div>
                  <div className="whitespace-pre-wrap break-words">{cascadedTask.error_message}</div>
                </div>
              ) : (
                <div>
                  <div className="text-zinc-400 text-[10px] mb-1">
                    Cascaded from related task{cascadedTask ? ` (${getTaskDisplayName(cascadedTask.task_type)})` : ''}:
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400">No error message available</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(cascadedTaskId);
                        toast({
                          title: 'Task ID Copied',
                          description: 'Related task ID copied to clipboard',
                          variant: 'default',
                        });
                      }}
                      className="px-1.5 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded transition-colors border border-zinc-600 hover:border-zinc-400"
                      title="Copy related task ID"
                    >
                      copy id
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-words">{task.errorMessage}</div>
          )}
        </div>
      )}
      
      {/* Add more task details as needed, e.g., from task.params */}
      {/* <pre className="text-xs text-zinc-500 whitespace-pre-wrap break-all">{JSON.stringify(task.params, null, 2)}</pre> */}
      

    </div>
  );

  // ENHANCED Debug logging for single image tasks - why no tooltip?
  // IMPORTANT: This useEffect must be called before any conditional returns to follow Rules of Hooks
  React.useEffect(() => {
    if (taskInfo.isImageTask) {
      console.log('[TaskTooltipDebug] Single image task tooltip analysis:', {
        taskId: task.id,
        taskType: task.taskType,
        status: task.status,
        hasActualGeneration: !!actualGeneration,
        actualGenerationData: actualGeneration ? {
          id: actualGeneration.id,
          hasMetadata: !!actualGeneration.metadata,
          metadataKeys: actualGeneration.metadata ? Object.keys(actualGeneration.metadata) : [],
          location: actualGeneration.location,
          metadata: actualGeneration.metadata
        } : null,
        hasOutputLocation: !!task.outputLocation,
        outputLocation: task.outputLocation,
        hasPromptText: !!taskParams.promptText,
        promptText: taskParams.promptText.substring(0, 50) + (taskParams.promptText.length > 50 ? '...' : ''),
        hasTaskParams: !!task.params,
        taskParamsPreview: task.params ? (typeof task.params === 'string' ? 'STRING_PARAMS' : Object.keys(task.params).join(',')) : null,
        conditionBreakdown: {
          isImageTask: taskInfo.isImageTask,
          hasMetadata: !!actualGeneration?.metadata,
          isComplete: task.status === 'Complete',
          hasParamsOrPrompt: !!(task.params || taskParams.promptText),
          showsTooltip: taskInfo.showsTooltip
        },
        shouldShowTooltip: taskInfo.showsTooltip,
        WHY_NO_TOOLTIP: !taskInfo.isImageTask ? 'NOT_IMAGE_TASK' : 'SHOULD_SHOW',
        timestamp: Date.now()
      });
    }
  }, [taskInfo.isImageTask, task.id, task.taskType, task.status, actualGeneration, task.outputLocation, taskParams.promptText, task.params]);

  // Unified tooltip wrapper for both travel and image tasks
  // Don't show tooltips on mobile to improve performance and UX
  const mainContent = taskInfo.showsTooltip && !isMobile ? (() => {
    const isTravel = taskInfo.isVideoTask;
    const hasClickableContent = taskInfo.isVideoTask ? 
      (taskInfo.isCompletedVideoTask && travelData.videoOutputs && travelData.videoOutputs.length > 0) : 
      !!generationData;
    
    const handleTooltipClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      
      // Reset hover state immediately when clicking tooltip
      setIsHoveringTaskItem(false);
      
      if (taskInfo.isVideoTask && hasClickableContent && onOpenVideoLightbox && travelData.videoOutputs && travelData.videoOutputs.length > 0) {
        const initialVariantId = (travelData.videoOutputs[0] as any)?._variant_id;
        onOpenVideoLightbox(task, travelData.videoOutputs, 0, initialVariantId);
      } else if (!taskInfo.isVideoTask && hasClickableContent && onOpenImageLightbox && generationData) {
        onOpenImageLightbox(task, generationData);
      }
    };

    return (
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          {taskItemContent}
        </TooltipTrigger>
        <TooltipContent 
          side="left" 
          className={cn(
            "p-0 border-0 bg-background/95 backdrop-blur-sm z-[100001]",
            taskInfo.isVideoTask ? "max-w-lg" : "max-w-md"
          )}
          sideOffset={15}
          collisionPadding={10}
        >
          <div 
            className="relative cursor-pointer hover:bg-background/90 transition-colors rounded-lg group"
            onClick={handleTooltipClick}
          >
            {taskInfo.isVideoTask ? (
              <SharedTaskDetails
                task={task}
                inputImages={travelData.imageUrls}
                variant="hover"
                isMobile={false}
              />
            ) : (
              <SharedMetadataDetails
                metadata={{
                  prompt: taskParams.promptText,
                  tool_type: task.taskType,
                  // Include original task parameters to access LoRA data
                  originalParams: task.params,
                  ...actualGeneration?.metadata
                }}
                variant="hover"
                isMobile={false}
                showUserImage={true}
              />
            )}
            
            {/* Click to view indicator */}
            {hasClickableContent && (
              <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-zinc-900/90 via-zinc-800/60 to-transparent p-2 rounded-t-lg opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="text-xs text-zinc-100 text-center font-medium drop-shadow-md">
                  {taskInfo.isVideoTask ? "Click to view video" : "Click to view image"}
                </div>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  })() : taskItemContent;

  return (
    <>
      {mainContent}
      
      {/* MediaLightbox now rendered centrally in TasksPane to persist across pagination */}
    </>
  );
};

export default TaskItem; 