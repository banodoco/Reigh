import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useGenerations, useDeleteGeneration } from '@/shared/hooks/useGenerations';
import { GenerationRow } from '@/types/shots';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Separator } from '@/shared/components/ui/separator';
import { VideoItem } from './VideoItem';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { ChevronLeft, ChevronDown, ChevronUp, Film, Loader2, Check, RotateCcw, Clock, Scissors, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/shared/hooks/use-toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/shared/components/ui/tooltip';
import { createJoinClipsTask } from '@/shared/lib/tasks/joinClips';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { JoinClipsSettingsForm, DEFAULT_JOIN_CLIPS_PHASE_CONFIG, BUILTIN_JOIN_CLIPS_DEFAULT_ID } from '@/tools/join-clips/components/JoinClipsSettingsForm';
import { useJoinClipsSettings } from '@/tools/join-clips/hooks/useJoinClipsSettings';
import { invalidateGenerationUpdate } from '@/shared/hooks/useGenerationInvalidation';
import { 
    validateClipsForJoin, 
    type ClipFrameInfo,
} from '@/tools/join-clips/utils/validation';
import MediaLightbox from '@/shared/components/MediaLightbox';
import { useLoraManager, type LoraModel, type ActiveLora } from '@/shared/hooks/useLoraManager';
import { useListPublicResources } from '@/shared/hooks/useResources';
import { getDisplayUrl } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useProject } from '@/shared/contexts/ProjectContext';
import { createMobileTapHandler, deriveInputImages, extractSegmentImages } from '../utils/gallery-utils';
import { useTaskFromUnifiedCache } from '@/shared/hooks/useUnifiedGenerations';
import { useGetTask } from '@/shared/hooks/useTasks';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { normalizeSegmentParams } from '@/shared/lib/normalizeSegmentParams';
import { SegmentRegenerateControls } from '@/shared/components/SegmentRegenerateControls';

// TypeScript declaration for global mobile video preload map
declare global {
  interface Window {
    mobileVideoPreloadMap?: Map<number, () => void>;
  }
}

interface ChildGenerationsViewProps {
    parentGenerationId: string;
    projectId: string | null;
    onBack: () => void;
    shotId?: string | null;
}

// Stable empty function reference to avoid re-renders from inline () => {}
const noop = () => {};

// Stable empty object for taskDetailsData.onApplySettingsFromTask
const noopTaskApply = () => {};

export const ChildGenerationsView: React.FC<ChildGenerationsViewProps> = ({
    parentGenerationId,
    projectId,
    onBack,
    shotId: shotIdProp,
}) => {
    const { toast } = useToast();
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [isParentLightboxOpen, setIsParentLightboxOpen] = useState(false);
    // State for opening lightbox in trim mode
    const [openInTrimMode, setOpenInTrimMode] = useState(false);
    // State for segment input image lightbox (lifted from SegmentCard for proper z-index)
    const [segmentImageLightbox, setSegmentImageLightbox] = useState<{
        segmentIndex: number;
        imageIndex: 0 | 1; // 0 = start, 1 = end
        startImage: { url: string; generationId?: string; based_on?: string | null } | null;
        endImage: { url: string; generationId?: string; based_on?: string | null } | null;
    } | null>(null);
    // State for segment deletion
    const [deletingChildId, setDeletingChildId] = useState<string | null>(null);
    const deleteGeneration = useDeleteGeneration();
    const isMobile = useIsMobile();
    const { isTasksPaneLocked, tasksPaneWidth, isShotsPaneLocked, shotsPaneWidth } = usePanes();
    
    // Get current project's aspect ratio for resolution calculation (similar to VideoTravelToolPage)
    const { projects } = useProject();
    const currentProject = projects.find(p => p.id === projectId);
    const projectAspectRatio = currentProject?.aspectRatio;
    const projectResolution = projectAspectRatio ? ASPECT_RATIO_TO_RESOLUTION[projectAspectRatio] : undefined;
    
    // Refs for mobile double-tap detection
    const lastTouchTimeRef = React.useRef<number>(0);
    const doubleTapTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

    // Mobile tap handler
    const handleMobileTap = useMemo(() => {
        console.log('[MobileTapFlow:ChildView] Creating handleMobileTap via useMemo');
        return createMobileTapHandler(
            lastTouchTimeRef,
            doubleTapTimeoutRef,
            (index) => {
                console.log('[MobileTapFlow:ChildView] ✅ LIGHTBOX OPEN callback invoked', { 
                    index,
                    isParentIndex: index === -1,
                    currentLightboxIndex: lightboxIndex,
                    currentIsParentLightboxOpen: isParentLightboxOpen,
                    timestamp: Date.now()
                });
                if (index === -1) {
                    console.log('[MobileTapFlow:ChildView] Setting isParentLightboxOpen = true');
                    setIsParentLightboxOpen(true);
                } else {
                    console.log('[MobileTapFlow:ChildView] Setting lightboxIndex =', index);
                    setLightboxIndex(index);
                }
                console.log('[MobileTapFlow:ChildView] State setters called', { 
                    index,
                    timestamp: Date.now()
                });
            },
            (index) => {
                console.log('[MobileTapFlow:ChildView] Preload callback invoked', { 
                    index,
                    hasPreloadMap: !!window.mobileVideoPreloadMap,
                    preloadMapHasIndex: window.mobileVideoPreloadMap?.has(index),
                    timestamp: Date.now()
                });
                // First tap action: Preload video
                if (window.mobileVideoPreloadMap && window.mobileVideoPreloadMap.has(index)) {
                    window.mobileVideoPreloadMap.get(index)?.();
                }
            }
        );
    // Note: lightboxIndex and isParentLightboxOpen are captured but only used for logging
    // which is stripped in production, so they don't need to be dependencies
    }, []);
    
    // Fetch available LoRAs for the motion control
    const publicLorasQuery = useListPublicResources('lora');
    const availableLoras: LoraModel[] = React.useMemo(() => {
        return ((publicLorasQuery.data || []) as any[]).map(resource => resource.metadata || {});
    }, [publicLorasQuery.data]);

    // Fetch child generations for this parent
    const { data, isLoading, refetch } = useGenerations(
        projectId,
        1,
        50,
        true,
        {
            parentGenerationId,
            includeChildren: true,
        }
    );

    // Transform children to match GenerationRow format expected by VideoItem and SegmentCard
    const children = React.useMemo(() => {
        const items = (data as any)?.items || [];
        
        // Debug: Log raw data structure to see if thumbUrl exists
        if (items.length > 0) {
            console.log('[ChildGenThumbDebug] Raw items from useGenerations:', {
                itemCount: items.length,
                firstItem: {
                    id: items[0].id?.substring(0, 8),
                    hasThumbUrl: !!items[0].thumbUrl,
                    thumbUrl: items[0].thumbUrl?.substring(0, 50),
                    hasThumbnail_url: !!items[0].thumbnail_url,
                    thumbnail_url: items[0].thumbnail_url?.substring(0, 50),
                    url: items[0].url?.substring(0, 50),
                    location: items[0].location?.substring(0, 50),
                    allKeys: Object.keys(items[0])
                },
                timestamp: Date.now()
            });
        }
        
        return items.map((item: any) => {
            // Use updated_at for timestamp display (when video was generated), fallback to created_at
            const timestampToShow = item.updatedAt || item.updated_at || item.createdAt || item.created_at;
            const transformed = {
                ...item,
                // Map GeneratedImageWithMetadata format to GenerationRow format
                location: item.url || item.location,
                imageUrl: item.url || item.imageUrl,
                thumbUrl: item.thumbUrl || item.thumbnail_url || item.url || item.location, // Explicitly map thumbUrl
                params: item.metadata || item.params, // params are stored in metadata by transformer
                created_at: timestampToShow, // Show when video was generated, not when parent was created
            };
            
            // Debug first transformed item
            if (item === items[0]) {
                console.log('[ChildGenThumbDebug] Transformed first item:', {
                    id: transformed.id?.substring(0, 8),
                    hasThumbUrl: !!transformed.thumbUrl,
                    thumbUrl: transformed.thumbUrl?.substring(0, 50),
                    location: transformed.location?.substring(0, 50),
                    timestamp: Date.now()
                });
            }
            
            return transformed;
        });
    }, [data]);

    // Log raw data to understand structure
    React.useEffect(() => {
        if (children.length > 0) {
            const firstChild = children[0];
            const childParams = firstChild.params as any;
            console.log('[SegmentCardPopulation] Transformed children data', {
                hasData: !!data,
                dataKeys: data ? Object.keys(data) : [],
                itemsCount: children.length,
                firstChild: {
                    id: firstChild.id?.substring(0, 8),
                    location: firstChild.location,
                    imageUrl: firstChild.imageUrl,
                    thumbUrl: firstChild.thumbUrl,
                    hasParams: !!firstChild.params,
                    paramsType: typeof firstChild.params,
                    paramsIsString: typeof firstChild.params === 'string',
                    paramsKeys: firstChild.params && typeof firstChild.params === 'object' ? Object.keys(firstChild.params) : [],
                    paramsPreview: firstChild.params ? (typeof firstChild.params === 'string' ? firstChild.params.substring(0, 200) : JSON.stringify(firstChild.params).substring(0, 200)) : 'null',
                    allKeys: Object.keys(firstChild),
                    // EXPLICIT base_prompt logging
                    base_prompt: childParams?.base_prompt ? childParams.base_prompt.substring(0, 100) : '>>> EMPTY/MISSING <<<',
                    prompt: childParams?.prompt ? childParams.prompt.substring(0, 100) : '>>> EMPTY/MISSING <<<',
                    orch_base_prompt: childParams?.orchestrator_details?.base_prompt ? childParams.orchestrator_details.base_prompt.substring(0, 100) : '>>> EMPTY/MISSING <<<',
                },
                timestamp: Date.now()
            });
        } else {
            console.log('[SegmentCardPopulation] Transformed children data', {
                hasData: !!data,
                dataKeys: data ? Object.keys(data) : [],
                itemsCount: 0,
                firstChild: null,
                timestamp: Date.now()
            });
        }
    }, [data, children]);

    // Sort children by child_order
    const sortedChildren = React.useMemo(() => {
        return [...children].sort((a, b) => {
            const orderA = (a as any).child_order ?? 0;
            const orderB = (b as any).child_order ?? 0;
            return orderA - orderB;
        });
    }, [children]);

    // Join Clips State
    const [isJoiningClips, setIsJoiningClips] = useState(false);
    const [joinClipsSuccess, setJoinClipsSuccess] = useState(false);
    const queryClient = useQueryClient();
    
    // Use project-persisted join clips settings (shared with JoinClipsPage)
    const joinSettings = useJoinClipsSettings(projectId);
    const {
        prompt: joinPrompt = '',
        negativePrompt: joinNegativePrompt = '',
        contextFrameCount: joinContextFrames = 15,
        gapFrameCount: joinGapFrames = 23,
        replaceMode: joinReplaceMode = true,
        keepBridgingImages = false,
        useIndividualPrompts = false,
        loras: joinLoras = [],
        // Motion preset settings
        motionMode: joinMotionMode = 'basic',
        phaseConfig: joinPhaseConfig,
        selectedPhasePresetId: joinSelectedPhasePresetId,
        randomSeed: joinRandomSeed = true,
    } = joinSettings.settings;
    
    // Helper to check if a generation is a travel segment (not a join output)
    // Segments have segment_index in params; join outputs don't
    const isSegment = useCallback((child: any): boolean => {
        return typeof (child.params as any)?.segment_index === 'number';
    }, []);

    // Filter sortedChildren to only include segments (exclude join outputs)
    // This ensures the child generation view only displays main variants (segments)
    const sortedSegments = React.useMemo(() => {
        return sortedChildren.filter(isSegment);
    }, [sortedChildren, isSegment]);

    // Calculate validation result for join clips based on segment frame counts
    const joinValidationResult = useMemo((): ValidationResult | null => {
        // Use sortedSegments which already filters to only segments
        const segmentsOnly = sortedSegments;
        
        if (segmentsOnly.length < 2) return null;
        
        // Build clip frame info from segment metadata
        const clipFrameInfos: ClipFrameInfo[] = segmentsOnly.map((child, index) => {
            // Get num_frames from child params/metadata
            const params = child.params as any;
            const numFrames = params?.num_frames || 
                              params?.orchestrator_details?.segment_frames_target || 
                              61; // Default to 61 if unknown
            
            return {
                index,
                name: `Segment ${index + 1}`,
                frameCount: numFrames,
                source: params?.num_frames ? 'metadata' : 'estimated',
            };
        });
        
        return validateClipsForJoin(
            clipFrameInfos,
            joinContextFrames,
            joinGapFrames,
            joinReplaceMode
        );
    }, [sortedSegments, joinContextFrames, joinGapFrames, joinReplaceMode]);

    // Fetch parent generation details to check for final output
    const { data: parentGeneration } = useQuery({
        queryKey: ['generation', parentGenerationId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('generations')
                .select('*')
                .eq('id', parentGenerationId)
                .single();
            
            if (error) throw error;
            return data;
        },
        enabled: !!parentGenerationId,
    });

    // Get shot_id: prefer prop (from shot_generations lookup), fall back to parent params
    const parentShotId = useMemo(() => {
        // Priority 1: Prop passed from SegmentsPage (reliable - from shot_generations table)
        if (shotIdProp) {
            console.log('[ChildGenerationsView] Using shotId from prop:', shotIdProp?.substring(0, 8));
            return shotIdProp;
        }
        // Priority 2: Extract from parent generation params (may not exist for older generations)
        const parentParams = parentGeneration?.params as any;
        const paramsShot = parentParams?.shot_id || parentParams?.orchestrator_details?.shot_id;
        if (paramsShot) {
            console.log('[ChildGenerationsView] Using shotId from parent params:', paramsShot?.substring(0, 8));
        }
        return paramsShot;
    }, [shotIdProp, parentGeneration?.params]);
    
    // Fetch shot's aspect ratio if we have a shot_id (takes priority over project)
    const { data: shotData } = useQuery({
        queryKey: ['shot-aspect-ratio', parentShotId],
        queryFn: async () => {
            if (!parentShotId) return null;
            const { data, error } = await supabase
                .from('shots')
                .select('id, aspect_ratio')
                .eq('id', parentShotId)
                .single();
            if (error) {
                console.error('[ChildGenerationsView] Error fetching shot aspect ratio:', error);
                return null;
            }
            return data;
        },
        enabled: !!parentShotId,
    });
    
    // Resolution priority: shot's aspect_ratio > project's aspect_ratio > undefined (fallback to task creation logic)
    // DEBUG: Always log to understand the resolution chain
    console.log('[ChildGenerationsView] [ResolutionDebug] ALWAYS LOG - Resolution inputs:', {
        shotIdProp: shotIdProp?.substring(0, 8),
        parentShotId: parentShotId?.substring(0, 8),
        shotDataLoaded: !!shotData,
        shotAspectRatio: shotData?.aspect_ratio,
        projectAspectRatio,
        projectResolution,
    });

    const effectiveResolution = useMemo(() => {
        console.log('[ChildGenerationsView] [ResolutionDebug] Computing effectiveResolution:', {
            parentShotId: parentShotId?.substring(0, 8),
            shotDataAspectRatio: shotData?.aspect_ratio,
            projectResolution,
        });

        // Priority 1: Shot's aspect ratio
        if (shotData?.aspect_ratio) {
            const resolution = ASPECT_RATIO_TO_RESOLUTION[shotData.aspect_ratio];
            console.log('[ChildGenerationsView] [ResolutionDebug] ✅ Using SHOT resolution:', {
                shotId: parentShotId?.substring(0, 8),
                aspectRatio: shotData.aspect_ratio,
                resolution
            });
            return resolution;
        }
        // Priority 2: Project's aspect ratio
        if (projectResolution) {
            console.log('[ChildGenerationsView] [ResolutionDebug] ⚠️ Using PROJECT resolution (shot not available):', {
                aspectRatio: projectAspectRatio,
                resolution: projectResolution
            });
            return projectResolution;
        }
        // Priority 3: Let the task creation logic handle it (fetches from project)
        console.log('[ChildGenerationsView] [ResolutionDebug] ❌ No resolution available');
        return undefined;
    }, [shotData?.aspect_ratio, projectResolution, projectAspectRatio, parentShotId]);
    
    // Aspect ratio priority for video players: shot's aspect_ratio > project's aspect_ratio > default "16:9"
    const effectiveAspectRatio = useMemo(() => {
        if (shotData?.aspect_ratio) {
            return shotData.aspect_ratio;
        }
        if (projectAspectRatio) {
            return projectAspectRatio;
        }
        return '16:9';
    }, [shotData?.aspect_ratio, projectAspectRatio]);

    // Extract expected segment count and data from parent's orchestrator_details
    const expectedSegmentData = React.useMemo(() => {
        if (!parentGeneration?.params) {
            console.log('[ExpectedSegmentData] No parent params');
            return null;
        }
        
        const params = parentGeneration.params as any;
        const orchestratorDetails = params.orchestrator_details;
        
        if (!orchestratorDetails) {
            console.log('[ExpectedSegmentData] No orchestrator_details in params');
            return null;
        }
        
        const segmentCount = orchestratorDetails.num_new_segments_to_generate 
            || orchestratorDetails.segment_frames_expanded?.length 
            || 0;
        
        console.log('[ExpectedSegmentData] Extracted data', {
            num_new_segments_to_generate: orchestratorDetails.num_new_segments_to_generate,
            segment_frames_expanded_length: orchestratorDetails.segment_frames_expanded?.length,
            computedCount: segmentCount,
            timestamp: Date.now()
        });
        
        return {
            count: segmentCount,
            frames: orchestratorDetails.segment_frames_expanded || [],
            prompts: orchestratorDetails.enhanced_prompts_expanded || orchestratorDetails.base_prompts_expanded || [],
            inputImages: orchestratorDetails.input_image_paths_resolved || [],
        };
    }, [parentGeneration?.params]);

    // Type for segment slots - either a real child or a placeholder
    type SegmentSlot = 
        | { type: 'child'; child: GenerationRow; index: number }
        | { type: 'placeholder'; index: number; expectedFrames?: number; expectedPrompt?: string; startImage?: string; endImage?: string };

    // Create merged array with placeholders for missing segments
    const segmentSlots = React.useMemo((): SegmentSlot[] => {
        console.log('[SegmentSlots] Computing segment slots', {
            hasExpectedData: !!expectedSegmentData,
            expectedCount: expectedSegmentData?.count,
            actualChildrenCount: sortedSegments.length,
            childOrders: sortedSegments.map(c => (c as any).child_order),
            timestamp: Date.now()
        });

        if (!expectedSegmentData || expectedSegmentData.count === 0) {
            // No expected data, just show what we have (segments only)
            console.log('[SegmentSlots] No expected data, showing all segments as-is');
            return sortedSegments.map((child, index) => ({
                type: 'child' as const,
                child,
                index: (child as any).child_order ?? index,
            }));
        }

        // Create slots for all expected segments
        const slots: SegmentSlot[] = [];
        const childrenByOrder = new Map<number, GenerationRow>();

        // Map children by their child_order if valid, otherwise track for fallback
        const childrenWithoutValidOrder: GenerationRow[] = [];
        const usedOrders = new Set<number>();

        sortedSegments.forEach(child => {
            const order = (child as any).child_order;
            
            // Check if this child has a valid, unique order
            const isValidOrder = typeof order === 'number' && 
                order >= 0 && 
                order < expectedSegmentData.count &&
                !usedOrders.has(order);
            
            if (isValidOrder) {
                console.log('[SegmentSlots] Mapping child by child_order', {
                    childId: child.id?.substring(0, 8),
                    child_order: order
                });
                childrenByOrder.set(order, child);
                usedOrders.add(order);
            } else {
                console.log('[SegmentSlots] Child has invalid/missing order, will assign to first available slot', {
                    childId: child.id?.substring(0, 8),
                    child_order: order,
                    reason: typeof order !== 'number' ? 'not a number' : 
                            order < 0 ? 'negative' : 
                            order >= expectedSegmentData.count ? 'out of range' : 
                            'duplicate'
                });
                childrenWithoutValidOrder.push(child);
            }
        });
        
        // Assign children without valid orders to the first available slots
        let nextAvailableSlot = 0;
        childrenWithoutValidOrder.forEach(child => {
            while (nextAvailableSlot < expectedSegmentData.count && childrenByOrder.has(nextAvailableSlot)) {
                nextAvailableSlot++;
            }
            if (nextAvailableSlot < expectedSegmentData.count) {
                console.log('[SegmentSlots] Assigning orphan child to slot', {
                    childId: child.id?.substring(0, 8),
                    assignedSlot: nextAvailableSlot
                });
                childrenByOrder.set(nextAvailableSlot, child);
                nextAvailableSlot++;
            }
        });
        
        console.log('[SegmentSlots] Mapping complete', {
            childrenMapped: childrenByOrder.size,
            ordersUsed: Array.from(usedOrders),
            orphansAssigned: childrenWithoutValidOrder.length
        });

        // Fill in slots
        for (let i = 0; i < expectedSegmentData.count; i++) {
            const child = childrenByOrder.get(i);
            if (child) {
                console.log('[SegmentSlots] Slot', i, '= child', child.id?.substring(0, 8));
                slots.push({ type: 'child', child, index: i });
            } else {
                console.log('[SegmentSlots] Slot', i, '= placeholder');
                slots.push({
                    type: 'placeholder',
                    index: i,
                    expectedFrames: expectedSegmentData.frames[i],
                    expectedPrompt: expectedSegmentData.prompts[i],
                    startImage: expectedSegmentData.inputImages[i],
                    endImage: expectedSegmentData.inputImages[i + 1],
                });
            }
        }

        console.log('[SegmentSlots] Final slots', {
            totalSlots: slots.length,
            childSlots: slots.filter(s => s.type === 'child').length,
            placeholderSlots: slots.filter(s => s.type === 'placeholder').length
        });

        return slots;
    }, [sortedSegments, expectedSegmentData]);

    // Count completed vs total segments
    const segmentProgress = React.useMemo(() => {
        const completed = segmentSlots.filter(s => s.type === 'child').length;
        const total = segmentSlots.length;
        return { completed, total };
    }, [segmentSlots]);

    // Lightbox handlers (must be after segmentSlots is defined)
    const handleLightboxClose = () => {
        setLightboxIndex(null);
        setOpenInTrimMode(false);
    };
    
    // Get only the child slots for navigation (skip placeholders)
    const childSlotIndices = React.useMemo(() => 
        segmentSlots
            .map((slot, idx) => slot.type === 'child' ? idx : null)
            .filter((idx): idx is number => idx !== null),
        [segmentSlots]
    );
    
    const handleLightboxNext = () => setLightboxIndex((prev) => {
        if (prev === null || childSlotIndices.length === 0) return null;
        const currentPosInChildSlots = childSlotIndices.indexOf(prev);
        const nextPos = (currentPosInChildSlots + 1) % childSlotIndices.length;
        return childSlotIndices[nextPos];
    });
    
    const handleLightboxPrev = () => setLightboxIndex((prev) => {
        if (prev === null || childSlotIndices.length === 0) return null;
        const currentPosInChildSlots = childSlotIndices.indexOf(prev);
        const prevPos = (currentPosInChildSlots - 1 + childSlotIndices.length) % childSlotIndices.length;
        return childSlotIndices[prevPos];
    });

    // Handle segment deletion with child_order reordering
    const handleDeleteSegment = useCallback(async (childId: string) => {
        // Find the child being deleted to get its child_order
        const childToDelete = sortedSegments.find(c => c.id === childId);
        if (!childToDelete) {
            console.error('[ChildGenerationsView] Cannot find child to delete:', childId);
            return;
        }

        const deletedChildOrder = (childToDelete as any).child_order;
        console.log('[ChildGenerationsView] Deleting segment:', {
            childId: childId.substring(0, 8),
            childOrder: deletedChildOrder,
            parentGenerationId: parentGenerationId.substring(0, 8),
        });

        setDeletingChildId(childId);

        try {
            // 1. Delete the generation
            await deleteGeneration.mutateAsync(childId);

            // 2. Update child_order for siblings with higher order (shift down)
            // Get siblings with higher child_order
            const siblingsToUpdate = sortedSegments.filter(c => {
                const order = (c as any).child_order;
                return order !== undefined && order > deletedChildOrder;
            });

            if (siblingsToUpdate.length > 0) {
                console.log('[ChildGenerationsView] Updating child_order for', siblingsToUpdate.length, 'siblings');

                // Update each sibling's child_order
                for (const sibling of siblingsToUpdate) {
                    const currentOrder = (sibling as any).child_order;
                    const { error } = await supabase
                        .from('generations')
                        .update({ child_order: currentOrder - 1 })
                        .eq('id', sibling.id);

                    if (error) {
                        console.error('[ChildGenerationsView] Error updating child_order:', error);
                    }
                }
            }

            // 3. Refetch to update the list
            refetch();

            toast({
                title: 'Segment deleted',
                description: 'The segment has been removed.',
            });
        } catch (error) {
            console.error('[ChildGenerationsView] Error deleting segment:', error);
            toast({
                title: 'Error',
                description: 'Failed to delete segment. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setDeletingChildId(null);
        }
    }, [sortedSegments, parentGenerationId, deleteGeneration, refetch, toast]);

    // Get current slot for lightbox (must be after segmentSlots is defined)
    const currentSlot = lightboxIndex !== null ? segmentSlots[lightboxIndex] : null;
    const segmentLightboxVideoId = currentSlot?.type === 'child' ? currentSlot.child.id : null;

    // ===============================================================================
    // TASK DATA HOOKS - For lightbox task details
    // ===============================================================================
    
    // Get task data for segment lightbox
    const { data: segmentTaskMapping } = useTaskFromUnifiedCache(segmentLightboxVideoId || '');
    const segmentTaskId = typeof segmentTaskMapping?.taskId === 'string' ? segmentTaskMapping.taskId : '';
    const { data: segmentTask, isLoading: isLoadingSegmentTask, error: segmentTaskError } = useGetTask(segmentTaskId);
    const segmentInputImages: string[] = useMemo(() => deriveInputImages(segmentTask), [segmentTask]);
    
    // Get task data for parent lightbox
    const { data: parentTaskMapping } = useTaskFromUnifiedCache(isParentLightboxOpen ? parentGenerationId : '');
    const parentTaskId = typeof parentTaskMapping?.taskId === 'string' ? parentTaskMapping.taskId : '';
    const { data: parentTask, isLoading: isLoadingParentTask, error: parentTaskError } = useGetTask(parentTaskId);

    // Derive input images - prefer task params, but fall back to generation params
    // This is critical because after "Join Segments", the latest task is the join task
    // which doesn't have the original input images. The generation's params still have
    // the orchestrator_details from the original orchestrator task.
    const parentInputImages: string[] = useMemo(() => {
        // First try task params
        const fromTask = deriveInputImages(parentTask);
        if (fromTask.length > 0) {
            console.log('[ChildGenerationsView] parentInputImages from task:', fromTask.length);
            return fromTask;
        }

        // Fall back to generation params (orchestrator_details stores original input images)
        const genParams = parentGeneration?.params as any;
        if (genParams) {
            const orchestratorDetails = genParams.orchestrator_details || {};
            const inputPaths = genParams.input_image_paths_resolved ||
                              orchestratorDetails.input_image_paths_resolved ||
                              [];
            if (inputPaths.length > 0) {
                console.log('[ChildGenerationsView] parentInputImages from generation params:', inputPaths.length);
                return inputPaths;
            }
        }

        console.log('[ChildGenerationsView] parentInputImages: none found');
        return [];
    }, [parentTask, parentGeneration?.params]);

    // Get task data for segment input image lightbox
    const segmentImageGenerationId = segmentImageLightbox 
        ? (segmentImageLightbox.imageIndex === 0 
            ? segmentImageLightbox.startImage?.generationId 
            : segmentImageLightbox.endImage?.generationId)
        : null;
    const hasRealSegmentImageGenId = !!(segmentImageGenerationId && !segmentImageGenerationId.startsWith('segment-'));
    const { data: segmentImageTaskMapping } = useTaskFromUnifiedCache(hasRealSegmentImageGenId ? segmentImageGenerationId! : '');
    const segmentImageTaskId = typeof segmentImageTaskMapping?.taskId === 'string' ? segmentImageTaskMapping.taskId : '';
    const { data: segmentImageTask, isLoading: isLoadingSegmentImageTask, error: segmentImageTaskError } = useGetTask(segmentImageTaskId);
    const segmentImageInputImages: string[] = useMemo(() => deriveInputImages(segmentImageTask), [segmentImageTask]);
    
    console.log('[SegmentImageFlow] Task data for segment image:', {
        segmentImageGenerationId,
        hasRealSegmentImageGenId,
        segmentImageTaskId,
        hasTask: !!segmentImageTask,
        isLoading: isLoadingSegmentImageTask,
        inputImagesCount: segmentImageInputImages.length,
    });

    // Transform parent generation for VideoItem
    // Use updated_at for timestamp since that reflects when the final video was generated
    const parentVideoRow = React.useMemo(() => {
        if (!parentGeneration) return null;
        // Use updated_at if available (when final video was generated), otherwise fall back to created_at
        const timestampToShow = parentGeneration.updated_at || parentGeneration.created_at;
        return {
            ...parentGeneration,
            location: parentGeneration.location,
            imageUrl: parentGeneration.location, // Fallback for poster
            thumbUrl: parentGeneration.thumbnail_url || parentGeneration.location,
            params: parentGeneration.params,
            created_at: timestampToShow, // Show when final video was generated, not when parent was created
            createdAt: timestampToShow,
            type: 'video', // Force type
        } as GenerationRow;
    }, [parentGeneration]);

    // Initialize LoRA manager - we disable its auto-load since we sync from joinSettings
    const loraManager = useLoraManager(availableLoras, {
        projectId: projectId || undefined,
        persistenceScope: 'none', // We handle persistence via joinSettings
        disableAutoLoad: true,
    });
    
    // Two-way sync between loraManager (UI state) and joinSettings.loras (persistence)
    const lorasSyncStateRef = React.useRef<{ initialized: boolean; lastSyncedKey: string }>({
        initialized: false,
        lastSyncedKey: '',
    });
    
    // Load saved LoRAs into loraManager on mount (once BOTH availableLoras AND joinSettings are ready)
    useEffect(() => {
        // Wait for BOTH: availableLoras loaded AND joinSettings loaded from DB
        if (lorasSyncStateRef.current.initialized || availableLoras.length === 0 || joinSettings.status !== 'ready') {
            return;
        }
        lorasSyncStateRef.current.initialized = true;
        
        if (joinLoras.length > 0) {
            const activeLoras = joinLoras.map(saved => {
                const fullLora = availableLoras.find(l => l['Model ID'] === saved.id);
                return {
                    id: saved.id,
                    name: fullLora?.Name || saved.id,
                    path: fullLora?.['Model Files']?.[0]?.url || saved.id,
                    strength: saved.strength,
                    previewImageUrl: fullLora?.Images?.[0]?.url,
                };
            }).filter(l => l.path);
            
            if (activeLoras.length > 0) {
                loraManager.setSelectedLoras(activeLoras);
                lorasSyncStateRef.current.lastSyncedKey = activeLoras.map(l => `${l.id}:${l.strength}`).sort().join(',');
            }
        }
    }, [joinLoras, availableLoras, loraManager, joinSettings.status]);
    
    // Sync loraManager changes back to joinSettings for persistence
    useEffect(() => {
        if (!lorasSyncStateRef.current.initialized) return;
        
        const lorasKey = loraManager.selectedLoras.map(l => `${l.id}:${l.strength}`).sort().join(',');
        if (lorasKey === lorasSyncStateRef.current.lastSyncedKey) return;
        
        lorasSyncStateRef.current.lastSyncedKey = lorasKey;
        joinSettings.updateField('loras', loraManager.selectedLoras.map(l => ({
            id: l.id,
            strength: l.strength,
        })));
    }, [loraManager.selectedLoras, joinSettings]);

    // Handler to clear only the output URL from the parent generation (not delete the generation itself)
    const handleClearParentOutput = useCallback(async () => {
        if (!parentGenerationId) return;
        
        try {
            const { error } = await supabase
                .from('generations')
                .update({ 
                    location: null,
                    thumbnail_url: null 
                })
                .eq('id', parentGenerationId);
            
            if (error) throw error;
            
            toast({
                title: "Output cleared",
                description: "Final video output has been removed. You can regenerate it.",
            });
            
            // Invalidate queries using centralized helper
            invalidateGenerationUpdate(queryClient, {
                generationId: parentGenerationId,
                projectId: projectId || undefined,
                reason: 'clear-parent-output',
            });
        } catch (error) {
            console.error('[ChildGenerationsView] Error clearing parent output:', error);
            toast({
                title: "Error",
                description: "Failed to clear the output",
                variant: "destructive",
            });
        }
    }, [parentGenerationId, queryClient, toast, projectId]);

    // Handler for opening external generation (for "Based On" navigation in lightboxes)
    const handleOpenExternalGeneration = useCallback(async (
        generationId: string,
        derivedContext?: string[]
    ) => {
        console.log('[SegmentImageFlow] handleOpenExternalGeneration called:', { generationId, derivedContext });
        
        try {
            // Fetch the generation from the database
            const { data, error } = await supabase
                .from('generations')
                .select('*')
                .eq('id', generationId)
                .single();
            
            if (error) throw error;
            
            if (data) {
                const basedOnValue = (data as any).based_on || (data as any).metadata?.based_on || null;
                const imageUrl = (data as any).location || (data as any).thumbnail_url;
                const thumbUrl = (data as any).thumbnail_url || (data as any).location;
                
                console.log('[SegmentImageFlow] Fetched external generation:', {
                    id: data.id,
                    hasLocation: !!(data as any).location,
                    hasThumb: !!(data as any).thumbnail_url,
                    basedOn: basedOnValue,
                });
                
                // Update the segment image lightbox to show this new generation
                console.log('[SegmentImageFlow] Setting lightbox with based_on:', basedOnValue);
                setSegmentImageLightbox({
                    segmentIndex: -1, // Mark as external navigation
                    imageIndex: 0,
                    startImage: {
                        url: imageUrl,
                        generationId: data.id,
                        based_on: basedOnValue,
                    },
                    endImage: null,
                });
            }
        } catch (error) {
            console.error('[SegmentImageFlow] Failed to fetch external generation:', error);
            toast({
                title: "Error",
                description: "Failed to load generation",
                variant: "destructive",
            });
        }
    }, [toast]);

    const handleRestoreDefaults = () => {
        // Reset to defaults using the settings hook (including loras)
        joinSettings.updateFields({
            contextFrameCount: 15,
            gapFrameCount: 23,
            replaceMode: true,
            keepBridgingImages: false,
            prompt: '',
            negativePrompt: '',
            loras: [],
        });
        loraManager.setSelectedLoras([]);
        toast({
            title: "Settings restored",
            description: "Join clips settings have been reset to defaults.",
        });
    };

    const handleConfirmJoin = async () => {
        if (!projectId || sortedSegments.length < 2) return;

        setIsJoiningClips(true);

        try {
            // Use sortedSegments which already filters out join outputs
            // sortedSegments only includes items with segment_index in params
            const segmentsOnly = sortedSegments;

            // CRITICAL: Fetch fresh URLs from database to ensure we get current main variants
            // The cached sortedSegments may have stale URLs if user recently changed a variant
            const segmentIds = segmentsOnly.map(c => c.id).filter(Boolean);
            const { data: freshSegments, error: fetchError } = await supabase
                .from('generations')
                .select('id, location')
                .in('id', segmentIds);
            
            if (fetchError) {
                console.error('[JoinClips] Error fetching fresh segment URLs:', fetchError);
                throw new Error('Failed to fetch segment URLs');
            }

            // Build a map of id -> fresh location
            const freshUrlMap = new Map(freshSegments?.map(s => [s.id, s.location]) || []);
            
            console.log('[JoinClips] Fresh URL fetch:', {
                requestedIds: segmentIds.length,
                receivedIds: freshSegments?.length || 0,
                urlsChanged: segmentsOnly.filter(c => c.location !== freshUrlMap.get(c.id)).length,
            });

            const clips = segmentsOnly.map((child, index) => ({
                // Use fresh URL from database, fallback to cached URL
                url: freshUrlMap.get(child.id) || child.location || '',
                name: `Segment ${index + 1}`,
            })).filter(c => c.url);

            // Convert selected LoRAs
            const lorasForTask = loraManager.selectedLoras.map(lora => ({
                path: lora.path,
                strength: lora.strength,
            }));

            // Parse resolution from string format (e.g., "840x552") to tuple format [width, height]
            let resolutionTuple: [number, number] | undefined;
            if (effectiveResolution) {
                const [width, height] = effectiveResolution.split('x').map(Number);
                if (width && height) {
                    resolutionTuple = [width, height];
                }
            }

            console.log('[JoinClips] Creating join task with fresh URLs:', {
                totalSegments: sortedSegments.length,
                segmentsUsed: segmentsOnly.length,
                clipCount: clips.length,
                clipUrls: clips.map(c => c.url.substring(c.url.lastIndexOf('/') + 1)),
                usedFreshUrls: clips.map(c => {
                    const segment = segmentsOnly.find(s => c.url === (freshUrlMap.get(s.id) || s.location));
                    return segment ? freshUrlMap.has(segment.id) : false;
                }),
                prompt: joinPrompt,
                contextFrames: joinContextFrames,
                gapFrames: joinGapFrames,
                replaceMode: joinReplaceMode,
                keepBridgingImages: keepBridgingImages,
                loras: lorasForTask.length,
                resolution: resolutionTuple,
                effectiveResolution,
            });

            await createJoinClipsTask({
                project_id: projectId,
                clips,
                prompt: joinPrompt,
                negative_prompt: joinNegativePrompt,
                context_frame_count: joinContextFrames,
                gap_frame_count: joinGapFrames,
                replace_mode: joinReplaceMode,
                keep_bridging_images: keepBridgingImages,
                model: 'wan_2_2_vace_lightning_baseline_2_2_2',
                num_inference_steps: 6,
                guidance_scale: 3.0,
                seed: -1,
                parent_generation_id: parentGenerationId,
                // IMPORTANT: This join is initiated from within Travel Between Images,
                // so the resulting output should be attributed to this tool for filtering/counting.
                tool_type: 'travel-between-images',
                use_input_video_resolution: false,
                use_input_video_fps: false,
                ...(lorasForTask.length > 0 && { loras: lorasForTask }),
                ...(resolutionTuple && { resolution: resolutionTuple }),
            });

            toast({
                title: 'Join task created',
                description: `Joining ${clips.length} segments into one video`,
            });

            setJoinClipsSuccess(true);
            setTimeout(() => setJoinClipsSuccess(false), 3000);
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
        } catch (error: any) {
            console.error('[JoinClips] Error creating join task:', error);
            toast({
                title: 'Failed to create join task',
                description: error.message || 'An error occurred',
                variant: 'destructive',
            });
        } finally {
            setIsJoiningClips(false);
        }
    };

    return (
        <div className="w-full min-h-screen">
            {/* Header - sticky with full-width background that respects panes */}
            {/* On mobile, GlobalHeader is NOT sticky (scrolls away), so we use top-0 */}
            {/* On desktop (md+), GlobalHeader is sticky at h-24 (96px), so we use top-24 */}
            <div 
                className="sticky top-0 md:top-24 z-30 bg-background/95 backdrop-blur-sm border-b border-border/50"
                style={{
                    // Extend background to edges using negative margins, accounting for panes
                    marginLeft: `calc(-50vw + 50% + ${isShotsPaneLocked ? shotsPaneWidth / 2 : 0}px)`,
                    marginRight: `calc(-50vw + 50% + ${isTasksPaneLocked ? tasksPaneWidth / 2 : 0}px)`,
                    // Pad content back to original position
                    paddingLeft: `calc(50vw - 50% - ${isShotsPaneLocked ? shotsPaneWidth / 2 : 0}px)`,
                    paddingRight: `calc(50vw - 50% - ${isTasksPaneLocked ? tasksPaneWidth / 2 : 0}px)`,
                }}
            >
                <div className="max-w-7xl mx-auto px-4 pt-4 pb-3">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onBack}
                            className="gap-2"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Back
                        </Button>
                        <div className="flex-1">
                            <h1 className="text-xl font-semibold">Segment Details</h1>
                            <p className="text-sm text-muted-foreground">
                                Edit and refine individual segments
                            </p>
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                            {segmentProgress.completed === segmentProgress.total ? (
                                <span className="flex items-center gap-1.5">
                                    <Check className="w-4 h-4 text-green-500" />
                                    {segmentProgress.total} {segmentProgress.total === 1 ? 'segment' : 'segments'}
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5">
                                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                    {segmentProgress.completed}/{segmentProgress.total} segments
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            {/* Parent Generation Video (Final Output) */}
            {parentVideoRow && parentVideoRow.location && (
                <div className="max-w-7xl mx-auto px-4 pt-5 pb-0">
                    <div className="w-full bg-card border rounded-xl p-4 sm:p-6 shadow-sm">
                        <div className="flex flex-col space-y-2 sm:space-y-3">
                            <h2 className="text-base sm:text-lg font-light flex items-center gap-2">
                                Final Video
                            </h2>
                            <Separator className="my-2" />
                        </div>
                        
                        <div className="flex justify-center mt-4">
                            {/* Limit video size: max 50% width for square/landscape, max height for portrait */}
                            <div 
                                className="w-full"
                                style={{
                                    maxWidth: (() => {
                                        if (!effectiveAspectRatio) return '50%';
                                        const [w, h] = effectiveAspectRatio.split(':').map(Number);
                                        if (w && h) {
                                            // For portrait videos, limit by height instead
                                            if (h > w) {
                                                // Calculate width from max height of 60vh
                                                return `min(50%, calc(60vh * ${w / h}))`;
                                            }
                                        }
                                        return '50%';
                                    })()
                                }}
                            >
                                <VideoItem
                                    video={parentVideoRow}
                                    index={-1}
                                    originalIndex={-1}
                                    shouldPreload="metadata"
                                    isMobile={isMobile}
                                    projectAspectRatio={effectiveAspectRatio}
                                    projectId={projectId}
                                    onLightboxOpen={() => setIsParentLightboxOpen(true)}
                                    onMobileTap={handleMobileTap}
                                    onDelete={handleClearParentOutput}
                                    deletingVideoId={null}
                                    onHoverStart={noop}
                                    onHoverEnd={noop}
                                    onMobileModalOpen={noop}
                                    selectedVideoForDetails={null}
                                    showTaskDetailsModal={false}
                                    onApplySettingsFromTask={noop}
                                    hideActions={false}
                                    deleteTooltip="Clear output (keeps segments, allows re-joining)"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-7xl mx-auto px-4 pt-5 pb-6">
                <div className="w-full bg-card border rounded-xl p-4 sm:p-6 shadow-sm">
                    <h2 className="text-lg sm:text-xl font-light tracking-tight text-foreground mb-6">Segments</h2>
                    
                    {isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[1, 2, 3].map((i) => (
                                <Card key={i}>
                                    <CardContent className="p-4 space-y-3">
                                        <Skeleton className="w-full aspect-video rounded-lg" />
                                        <Skeleton className="h-4 w-3/4" />
                                        <Skeleton className="h-20 w-full" />
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : segmentSlots.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 border rounded-lg bg-muted/10">
                            <p className="text-muted-foreground">No segments found for this generation.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {segmentSlots.map((slot) => {
                                if (slot.type === 'child') {
                                    // Check if child has a location (video output) - if not, show as processing
                                    const hasOutput = !!slot.child.location;
                                    
                                    if (hasOutput) {
                                        return (
                                            <SegmentCard
                                                key={slot.child.id}
                                                child={slot.child}
                                                index={slot.index}
                                                projectId={projectId}
                                                parentGenerationId={parentGenerationId}
                                                onLightboxOpen={() => setLightboxIndex(slot.index)}
                                                onLightboxOpenWithTrim={() => {
                                                    setOpenInTrimMode(true);
                                                    setLightboxIndex(slot.index);
                                                }}
                                                onMobileTap={handleMobileTap}
                                                onUpdate={refetch}
                                                onDelete={handleDeleteSegment}
                                                isDeleting={deletingChildId === slot.child.id}
                                                availableLoras={availableLoras}
                                                projectResolution={effectiveResolution}
                                                aspectRatio={effectiveAspectRatio}
                                                onImageLightboxOpen={(imageIndex, images) => {
                                                    console.log('[SegmentImageFlow] onImageLightboxOpen called in parent');
                                                    console.log('[SegmentImageFlow] imageIndex:', imageIndex);
                                                    console.log('[SegmentImageFlow] images.start:', images.start);
                                                    console.log('[SegmentImageFlow] images.end:', images.end);
                                                    console.log('[SegmentImageFlow] slot.index:', slot.index);
                                                    setSegmentImageLightbox({
                                                        segmentIndex: slot.index,
                                                        imageIndex,
                                                        startImage: images.start,
                                                        endImage: images.end,
                                                    });
                                                }}
                                            />
                                        );
                                    } else {
                                        // Child exists but still processing - extract info from params
                                        const childParams = slot.child.params as any;
                                        return (
                                            <SegmentPlaceholder
                                                key={slot.child.id}
                                                index={slot.index}
                                                expectedFrames={childParams?.num_frames}
                                                expectedPrompt={childParams?.base_prompt || childParams?.prompt}
                                                isProcessing={true}
                                                aspectRatio={effectiveAspectRatio}
                                            />
                                        );
                                    }
                                } else {
                                    return (
                                        <SegmentPlaceholder
                                            key={`placeholder-${slot.index}`}
                                            index={slot.index}
                                            expectedFrames={slot.expectedFrames}
                                            expectedPrompt={slot.expectedPrompt}
                                            startImage={slot.startImage}
                                            endImage={slot.endImage}
                                            aspectRatio={effectiveAspectRatio}
                                        />
                                    );
                                }
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Join Clips Section */}
            {sortedSegments.length >= 2 && sortedSegments.some(c => c.location) && (
                <div className="max-w-7xl mx-auto px-4 pb-4">
                    <div className="w-full bg-card border rounded-xl p-4 sm:p-6 shadow-sm">
                        <JoinClipsSettingsForm 
                            headerContent={
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-lg sm:text-xl font-light tracking-tight text-foreground">Join Segments</h2>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleRestoreDefaults}
                                        className="h-8 gap-2 text-muted-foreground hover:text-foreground"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        Restore defaults
                                    </Button>
                                </div>
                            }
                            gapFrames={joinGapFrames}
                            setGapFrames={(val) => joinSettings.updateField('gapFrameCount', val)}
                            contextFrames={joinContextFrames}
                            setContextFrames={(val) => joinSettings.updateField('contextFrameCount', val)}
                            replaceMode={joinReplaceMode}
                            setReplaceMode={(val) => joinSettings.updateField('replaceMode', val)}
                            keepBridgingImages={keepBridgingImages}
                            setKeepBridgingImages={(val) => joinSettings.updateField('keepBridgingImages', val)}
                            prompt={joinPrompt}
                            setPrompt={(val) => joinSettings.updateField('prompt', val)}
                            negativePrompt={joinNegativePrompt}
                            setNegativePrompt={(val) => joinSettings.updateField('negativePrompt', val)}
                            availableLoras={availableLoras}
                            projectId={projectId}
                            loraPersistenceKey="join-clips"
                            loraManager={loraManager}
                            onGenerate={handleConfirmJoin}
                            isGenerating={isJoiningClips}
                            generateSuccess={joinClipsSuccess}
                            generateButtonText="Create Joined Video"
                            shortestClipFrames={joinValidationResult?.shortestClipFrames}
                            // Motion preset settings
                            motionMode={joinMotionMode}
                            onMotionModeChange={(mode) => joinSettings.updateField('motionMode', mode)}
                            phaseConfig={joinPhaseConfig ?? DEFAULT_JOIN_CLIPS_PHASE_CONFIG}
                            onPhaseConfigChange={(config) => joinSettings.updateField('phaseConfig', config)}
                            randomSeed={joinRandomSeed}
                            onRandomSeedChange={(val) => joinSettings.updateField('randomSeed', val)}
                            selectedPhasePresetId={joinSelectedPhasePresetId ?? BUILTIN_JOIN_CLIPS_DEFAULT_ID}
                            onPhasePresetSelect={(presetId, config) => {
                                joinSettings.updateFields({
                                    selectedPhasePresetId: presetId,
                                    phaseConfig: config,
                                });
                            }}
                            onPhasePresetRemove={() => {
                                joinSettings.updateField('selectedPhasePresetId', null);
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Lightbox for Segments */}
            {(() => {
                const lightboxSlot = lightboxIndex !== null ? segmentSlots[lightboxIndex] : null;
                const shouldRenderSegmentLightbox = lightboxSlot?.type === 'child';
                console.log('[MobileTapFlow:ChildView] Segment Lightbox render check', { 
                    lightboxIndex,
                    shouldRenderSegmentLightbox,
                    segmentSlotsLength: segmentSlots.length,
                    slotType: lightboxSlot?.type,
                    timestamp: Date.now()
                });
                if (!shouldRenderSegmentLightbox || !lightboxSlot) return null;
                
                const childMedia = lightboxSlot.child;
                console.log('[MobileTapFlow:ChildView] ✅ RENDERING MediaLightbox for segment', { 
                    index: lightboxIndex, 
                    childId: childMedia?.id,
                    timestamp: Date.now()
                });
                return (
                    <MediaLightbox
                        media={childMedia}
                        onClose={handleLightboxClose}
                        onNext={handleLightboxNext}
                        onPrevious={handleLightboxPrev}
                        showNavigation={true}
                        showImageEditTools={false}
                        showDownload={true}
                        hasNext={childSlotIndices.length > 1}
                        hasPrevious={childSlotIndices.length > 1}
                        starred={(childMedia as { starred?: boolean }).starred ?? false}
                        shotId={parentShotId}
                        showTaskDetails={true}
                        showVideoTrimEditor={true}
                        initialVideoTrimMode={openInTrimMode}
                        taskDetailsData={{
                            task: segmentTask,
                            isLoading: isLoadingSegmentTask,
                            error: segmentTaskError,
                            inputImages: segmentInputImages,
                            taskId: segmentTaskId || null,
                            onApplySettingsFromTask: noop, // Not applicable in this context
                            onClose: handleLightboxClose
                        }}
                    />
                );
            })()}

            {/* Lightbox for Parent Video */}
            {(() => {
                const shouldRenderParentLightbox = isParentLightboxOpen && parentVideoRow;
                console.log('[MobileTapFlow:ChildView] Parent Lightbox render check', { 
                    isParentLightboxOpen,
                    hasParentVideoRow: !!parentVideoRow,
                    shouldRenderParentLightbox,
                    timestamp: Date.now()
                });
                if (!shouldRenderParentLightbox) return null;
                
                console.log('[MobileTapFlow:ChildView] ✅ RENDERING MediaLightbox for parent', {
                    parentId: parentVideoRow?.id,
                    timestamp: Date.now()
                });
                return (
                    <MediaLightbox
                        media={parentVideoRow}
                        onClose={() => setIsParentLightboxOpen(false)}
                        showNavigation={false}
                        showImageEditTools={false}
                        showDownload={true}
                        hasNext={false}
                        hasPrevious={false}
                        starred={(parentVideoRow as { starred?: boolean }).starred ?? false}
                        shotId={parentShotId}
                        showTaskDetails={true}
                        showVideoTrimEditor={true}
                        taskDetailsData={{
                            task: parentTask,
                            isLoading: isLoadingParentTask,
                            error: parentTaskError,
                            inputImages: parentInputImages,
                            taskId: parentTaskId || null,
                            onApplySettingsFromTask: noop, // Not applicable in this context
                            onClose: () => setIsParentLightboxOpen(false)
                        }}
                    />
                );
            })()}

            {/* Lightbox for Segment Input Images */}
            {segmentImageLightbox && (() => {
                const currentImage = segmentImageLightbox.imageIndex === 0 
                    ? segmentImageLightbox.startImage 
                    : segmentImageLightbox.endImage;
                const hasRealGenerationId = !!(currentImage?.generationId && 
                    !currentImage.generationId.startsWith('segment-'));
                
                console.log('[SegmentImageFlow] === LIGHTBOX RENDER ===');
                console.log('[SegmentImageFlow] segmentImageLightbox state:', segmentImageLightbox);
                console.log('[SegmentImageFlow] imageIndex (0=start, 1=end):', segmentImageLightbox.imageIndex);
                console.log('[SegmentImageFlow] segmentIndex:', segmentImageLightbox.segmentIndex);
                console.log('[SegmentImageFlow] startImage in state:', segmentImageLightbox.startImage);
                console.log('[SegmentImageFlow] endImage in state:', segmentImageLightbox.endImage);
                console.log('[SegmentImageFlow] currentImage selected:', currentImage);
                console.log('[SegmentImageFlow] currentImage.url:', currentImage?.url);
                console.log('[SegmentImageFlow] currentImage.generationId:', currentImage?.generationId);
                console.log('[SegmentImageFlow] hasRealGenerationId:', hasRealGenerationId);
                console.log('[SegmentImageFlow] Media object being passed to lightbox:', {
                    id: currentImage?.generationId || `segment-${segmentImageLightbox.segmentIndex}-image-${segmentImageLightbox.imageIndex}`,
                    location: currentImage?.url,
                    imageUrl: currentImage?.url,
                    thumbUrl: currentImage?.url,
                    type: 'image',
                    based_on: currentImage?.based_on,
                });
                
                console.log('[SegmentImageFlow] Rendering MediaLightbox with taskDetailsData:', {
                    hasTaskDetailsData: !!segmentImageTask,
                    taskId: segmentImageTaskId,
                    inputImagesCount: segmentImageInputImages.length,
                });
                
                return (
                    <MediaLightbox
                        media={{
                            id: currentImage?.generationId || `segment-${segmentImageLightbox.segmentIndex}-image-${segmentImageLightbox.imageIndex}`,
                            location: currentImage?.url,
                            imageUrl: currentImage?.url,
                            thumbUrl: currentImage?.url,
                            type: 'image',
                            based_on: currentImage?.based_on || null,
                        } as any}
                        onClose={() => setSegmentImageLightbox(null)}
                        onNext={() => setSegmentImageLightbox(prev => 
                            prev && prev.imageIndex === 0 && prev.endImage 
                                ? { ...prev, imageIndex: 1 } 
                                : prev
                        )}
                        onPrevious={() => setSegmentImageLightbox(prev => 
                            prev && prev.imageIndex === 1 && prev.startImage 
                                ? { ...prev, imageIndex: 0 } 
                                : prev
                        )}
                        showNavigation={!!(segmentImageLightbox.startImage && segmentImageLightbox.endImage)}
                        showImageEditTools={hasRealGenerationId}
                        showDownload={true}
                        hasNext={segmentImageLightbox.imageIndex === 0 && !!segmentImageLightbox.endImage}
                        hasPrevious={segmentImageLightbox.imageIndex === 1 && !!segmentImageLightbox.startImage}
                        starred={false}
                        shotId={parentShotId}
                        showTaskDetails={hasRealGenerationId}
                        taskDetailsData={hasRealGenerationId ? {
                            task: segmentImageTask,
                            isLoading: isLoadingSegmentImageTask,
                            error: segmentImageTaskError,
                            inputImages: segmentImageInputImages,
                            taskId: segmentImageTaskId || null,
                            onApplySettingsFromTask: undefined,
                            onClose: () => setSegmentImageLightbox(null),
                        } : undefined}
                        onOpenExternalGeneration={handleOpenExternalGeneration}
                    />
                );
            })()}
        </div>
    );
};

interface SegmentCardProps {
    child: GenerationRow;
    index: number;
    projectId: string | null;
    parentGenerationId: string;
    onLightboxOpen: () => void;
    onLightboxOpenWithTrim: () => void;
    onMobileTap: (index: number) => void;
    onUpdate: () => void;
    onDelete: (childId: string) => void;
    isDeleting: boolean;
    availableLoras: LoraModel[];
    onImageLightboxOpen: (imageIndex: 0 | 1, images: { start: { url: string; generationId?: string } | null; end: { url: string; generationId?: string } | null }) => void;
    projectResolution?: string; // Resolution derived from project's aspect ratio
    aspectRatio?: string; // Aspect ratio string like "16:9" for video player containers
}

// Memoized to prevent re-renders when parent state changes (e.g., lightbox index)
const SegmentCard: React.FC<SegmentCardProps> = React.memo(({ child, index, projectId, parentGenerationId, onLightboxOpen, onLightboxOpenWithTrim, onMobileTap, onUpdate, onDelete, isDeleting, availableLoras, onImageLightboxOpen, projectResolution, aspectRatio }) => {
    const isMobile = useIsMobile();

    // child.params is synced from the primary variant via database trigger
    // (see sync_generation_from_primary_variant in variant sync triggers)
    // This ensures params always match the currently displayed video
    const childParams = child.params || {};

    // Calculate aspect ratio style for video container based on project/shot dimensions
    const aspectRatioStyle = useMemo(() => {
        if (!aspectRatio) {
            return { aspectRatio: '16/9' }; // Default to 16:9
        }
        const [width, height] = aspectRatio.split(':').map(Number);
        if (width && height) {
            return { aspectRatio: `${width}/${height}` };
        }
        return { aspectRatio: '16/9' }; // Fallback to 16:9
    }, [aspectRatio]);

    // Extract input images using shared utility (handles both explicit URLs and array formats)
    const segmentImageInfo = useMemo(() =>
        extractSegmentImages(childParams, index),
        [childParams, index]
    );

    // Fetch fresh URLs from database for segment input images (always use main variant)
    const { data: freshGenerationUrls } = useQuery({
        queryKey: ['segment-input-generations', segmentImageInfo.startGenId, segmentImageInfo.endGenId],
        queryFn: async () => {
            const idsToFetch = [segmentImageInfo.startGenId, segmentImageInfo.endGenId].filter(Boolean) as string[];
            if (idsToFetch.length === 0) return {};
            
            const { data, error } = await supabase
                .from('generations')
                .select('id, location, thumbnail_url')
                .in('id', idsToFetch);
            
            if (error) {
                console.error('[SegmentImageFlow] Error fetching fresh generation URLs:', error);
                return {};
            }
            
            const urlMap: Record<string, { location: string | null; thumbnail_url: string | null }> = {};
            data?.forEach(gen => {
                urlMap[gen.id] = { location: gen.location, thumbnail_url: gen.thumbnail_url };
            });
            
            console.log('[SegmentImageFlow] Fetched fresh generation URLs:', {
                idsRequested: idsToFetch,
                urlsFound: Object.keys(urlMap).length,
                startUrl: segmentImageInfo.startGenId ? urlMap[segmentImageInfo.startGenId]?.location?.substring(0, 50) : 'no-id',
                endUrl: segmentImageInfo.endGenId ? urlMap[segmentImageInfo.endGenId]?.location?.substring(0, 50) : 'no-id',
            });
            
            return urlMap;
        },
        enabled: !!(segmentImageInfo.startGenId || segmentImageInfo.endGenId),
        staleTime: 10000, // Refresh every 10 seconds to pick up variant changes
    });

    // Build segmentImages using fresh URLs (from main variant) with fallback to utility-extracted URLs
    const segmentImages = useMemo(() => {
        const { startGenId, endGenId, startUrl: fallbackStartUrl, endUrl: fallbackEndUrl } = segmentImageInfo;

        // Use fresh URL from database if available (ensures we get current main variant),
        // otherwise fall back to URL from params
        const startUrl = (startGenId && freshGenerationUrls?.[startGenId]?.location) || fallbackStartUrl;
        const endUrl = (endGenId && freshGenerationUrls?.[endGenId]?.location) || fallbackEndUrl;

        console.log('[SegmentImageFlow] Building segmentImages for segment', index);
        console.log('[SegmentImageFlow] Using fresh URLs:', {
            startUsedFresh: !!(startGenId && freshGenerationUrls?.[startGenId]?.location),
            endUsedFresh: !!(endGenId && freshGenerationUrls?.[endGenId]?.location),
            startUrl: startUrl?.substring(0, 50),
            endUrl: endUrl?.substring(0, 50),
        });

        return {
            start: startUrl ? { url: startUrl, generationId: startGenId } : null,
            end: endUrl ? { url: endUrl, generationId: endGenId } : null,
            hasImages: !!(startUrl || endUrl),
        };
    }, [segmentImageInfo, freshGenerationUrls, index]);

    return (
        <Card className="overflow-hidden flex flex-col">
            {/* Video Preview */}
            <div
                className="relative bg-black group"
                style={aspectRatioStyle}
            >
                    {/* Top right overlay - Variant count and NEW badge */}
                    <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
                        {/* NEW badge - shown if created within last 2 minutes */}
                        {child.created_at && (Date.now() - new Date(child.created_at).getTime()) < 2 * 60 * 1000 && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-green-500 text-white rounded font-semibold">
                                NEW
                            </span>
                        )}
                        {/* Variant count badge */}
                        {(child as any).derivedCount && (child as any).derivedCount > 0 && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="h-6 w-6 rounded-full bg-black/50 text-white text-[10px] font-medium flex items-center justify-center backdrop-blur-sm cursor-help">
                                            {(child as any).derivedCount}
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="left">
                                        <p>{(child as any).derivedCount} variant{(child as any).derivedCount !== 1 ? 's' : ''}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                    </div>

                    {/* Action buttons - bottom right overlay, appears on hover */}
                    <div className="absolute bottom-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 px-2 gap-1 bg-black/60 hover:bg-black/80 text-white border-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                onLightboxOpenWithTrim();
                            }}
                        >
                            <Scissors className="h-3.5 w-3.5" />
                            <span className="text-xs">Trim</span>
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 px-2 gap-1 bg-black/60 hover:bg-red-600 text-white border-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(child.id);
                            }}
                            disabled={isDeleting}
                        >
                            {isDeleting ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                            )}
                        </Button>
                    </div>
                    <VideoItem
                        video={child}
                        index={index}
                        originalIndex={index}
                        shouldPreload="metadata"
                        isMobile={isMobile}
                        projectAspectRatio={aspectRatio}
                        projectId={projectId}
                        onLightboxOpen={() => onLightboxOpen()}
                        onMobileTap={onMobileTap}
                        onDelete={noop}
                        deletingVideoId={null}
                        onHoverStart={noop}
                        onHoverEnd={noop}
                        onMobileModalOpen={noop}
                        selectedVideoForDetails={null}
                        showTaskDetailsModal={false}
                        onApplySettingsFromTask={noop}
                        hideActions={true}
                    />
            </div>

            {/* Settings Form - Using shared SegmentRegenerateControls */}
            <CardContent className="p-4 flex-1 flex flex-col">
                <SegmentRegenerateControls
                    initialParams={childParams}
                    projectId={projectId}
                    generationId={parentGenerationId}
                    childGenerationId={child.id}
                    segmentIndex={index}
                    startImageUrl={segmentImages.start?.url}
                    endImageUrl={segmentImages.end?.url}
                    startImageGenerationId={segmentImages.start?.generationId}
                    endImageGenerationId={segmentImages.end?.generationId}
                    projectResolution={projectResolution}
                    queryKeyPrefix={`segment-${index}-presets`}
                    onStartImageClick={segmentImages.start ? () => {
                        console.log('[SegmentImageFlow] START image clicked for segment', index);
                        onImageLightboxOpen(0, segmentImages);
                    } : undefined}
                    onEndImageClick={segmentImages.end ? () => {
                        console.log('[SegmentImageFlow] END image clicked for segment', index);
                        onImageLightboxOpen(1, segmentImages);
                    } : undefined}
                    buttonLabel="Regenerate Segment"
                />
            </CardContent>
        </Card>
    );
});

// Placeholder component for pending/missing segments
interface SegmentPlaceholderProps {
    index: number;
    expectedFrames?: number;
    expectedPrompt?: string;
    startImage?: string;
    endImage?: string;
    isProcessing?: boolean; // True if child exists but output not ready yet
    aspectRatio?: string; // Aspect ratio string like "16:9" for video container
}

// Memoized to prevent re-renders when parent state changes
const SegmentPlaceholder: React.FC<SegmentPlaceholderProps> = React.memo(({
    index,
    expectedFrames,
    expectedPrompt,
    startImage,
    endImage,
    isProcessing = false,
    aspectRatio,
}) => {
    // Calculate aspect ratio style for video container - same logic as SegmentCard
    const aspectRatioStyle = useMemo(() => {
        if (!aspectRatio) {
            return { aspectRatio: '16/9' }; // Default to 16:9
        }
        const [width, height] = aspectRatio.split(':').map(Number);
        if (width && height) {
            return { aspectRatio: `${width}/${height}` };
        }
        return { aspectRatio: '16/9' }; // Fallback to 16:9
    }, [aspectRatio]);

    return (
        <Card className={`overflow-hidden flex flex-col border-dashed ${isProcessing ? 'opacity-90 border-primary/50' : 'opacity-70'}`}>
            {/* Placeholder Video Area */}
            <div className="relative bg-muted/30 flex items-center justify-center" style={aspectRatioStyle}>
                {/* Show start/end images if available */}
                {(startImage || endImage) ? (
                    <div className="absolute inset-0 flex">
                        {startImage && (
                            <div className="flex-1 relative overflow-hidden">
                                <img 
                                    src={startImage} 
                                    alt={`Start frame for segment ${index + 1}`}
                                    className="absolute inset-0 w-full h-full object-cover opacity-40 blur-[1px]"
                                />
                            </div>
                        )}
                        {endImage && (
                            <div className="flex-1 relative overflow-hidden border-l border-dashed border-border/50">
                                <img 
                                    src={endImage} 
                                    alt={`End frame for segment ${index + 1}`}
                                    className="absolute inset-0 w-full h-full object-cover opacity-40 blur-[1px]"
                                />
                            </div>
                        )}
                    </div>
                ) : null}
                
                {/* Loading indicator overlay */}
                <div className="relative z-10 flex flex-col items-center gap-2 text-muted-foreground">
                    <div className="relative">
                        {isProcessing ? (
                            <Film className="w-8 h-8 opacity-50 text-primary" />
                        ) : (
                            <Clock className="w-8 h-8 opacity-50" />
                        )}
                        <Loader2 className={`w-4 h-4 animate-spin absolute -top-1 -right-1 ${isProcessing ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <span className="text-xs font-medium">Segment {index + 1}</span>
                    <span className={`text-xs ${isProcessing ? 'text-primary font-medium' : 'opacity-70'}`}>
                        {isProcessing ? 'Processing...' : 'Pending...'}
                    </span>
                </div>
            </div>

            {/* Placeholder Content */}
            <CardContent className="p-4 space-y-3 flex-1 flex flex-col">
                <div className="space-y-2 flex-1">
                    <Label className="text-xs font-medium text-muted-foreground">
                        {isProcessing ? 'Prompt' : 'Expected Prompt'}
                    </Label>
                    <div className="text-xs text-muted-foreground/70 line-clamp-3 italic">
                        {expectedPrompt ? (
                            expectedPrompt.length > 150 ? expectedPrompt.substring(0, 150) + '...' : expectedPrompt
                        ) : (
                            isProcessing ? 'Generating video...' : 'Waiting for generation...'
                        )}
                    </div>
                </div>

                {expectedFrames && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{isProcessing ? 'Frames' : 'Expected Frames'}</span>
                        <span className="font-medium">{expectedFrames}</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
});
