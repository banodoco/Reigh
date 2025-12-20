import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useGenerations } from '@/shared/hooks/useGenerations';
import { GenerationRow } from '@/types/shots';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Separator } from '@/shared/components/ui/separator';
import { VideoItem } from './VideoItem';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import { Label } from '@/shared/components/ui/label';
import { Switch } from '@/shared/components/ui/switch';
import { Slider } from '@/shared/components/ui/slider';
import { ChevronLeft, ChevronDown, ChevronUp, Save, Film, Loader2, Check, Layers, RotateCcw, Clock, Scissors } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/shared/hooks/use-toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { Card, CardContent } from '@/shared/components/ui/card';
import { createJoinClipsTask } from '@/shared/lib/tasks/joinClips';
import { createIndividualTravelSegmentTask } from '@/shared/lib/tasks/individualTravelSegment';
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
import { MotionPresetSelector, type BuiltinPreset } from '@/shared/components/MotionPresetSelector';
import { ActiveLoRAsDisplay } from '@/shared/components/ActiveLoRAsDisplay';
import { LoraSelectorModal } from '@/shared/components/LoraSelectorModal';
import { PhaseConfig, DEFAULT_PHASE_CONFIG, DEFAULT_VACE_PHASE_CONFIG } from '@/tools/travel-between-images/settings';
import { quantizeFrameCount, framesToSeconds } from '@/tools/travel-between-images/components/Timeline/utils/time-utils';
import { createMobileTapHandler, deriveInputImages } from '../utils/gallery-utils';
import { useTaskFromUnifiedCache } from '@/shared/hooks/useUnifiedGenerations';
import { useGetTask } from '@/shared/hooks/useTasks';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';

// TypeScript declaration for global mobile video preload map
declare global {
  interface Window {
    mobileVideoPreloadMap?: Map<number, () => void>;
  }
}

// =============================================================================
// BUILT-IN PRESETS FOR SEGMENT REGENERATION
// Uses the same defaults as Video Travel Tool (I2V and VACE modes)
// =============================================================================

const BUILTIN_I2V_PRESET_ID = '__builtin_segment_i2v_default__';
const BUILTIN_VACE_PRESET_ID = '__builtin_segment_vace_default__';

const BUILTIN_I2V_PRESET: BuiltinPreset = {
  id: BUILTIN_I2V_PRESET_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard I2V generation',
    phaseConfig: DEFAULT_PHASE_CONFIG,
    generationTypeMode: 'i2v',
  }
};

const BUILTIN_VACE_PRESET: BuiltinPreset = {
  id: BUILTIN_VACE_PRESET_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard VACE generation with structure video',
    phaseConfig: DEFAULT_VACE_PHASE_CONFIG,
    generationTypeMode: 'vace',
  }
};

// Helper to detect generation mode from model name
const detectGenerationMode = (modelName?: string): 'i2v' | 'vace' => {
  if (!modelName) return 'i2v';
  return modelName.toLowerCase().includes('vace') ? 'vace' : 'i2v';
};

interface ChildGenerationsViewProps {
    parentGenerationId: string;
    projectId: string | null;
    onBack: () => void;
}

export const ChildGenerationsView: React.FC<ChildGenerationsViewProps> = ({
    parentGenerationId,
    projectId,
    onBack,
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
    }, [lightboxIndex, isParentLightboxOpen]);
    
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
    
    // Calculate validation result for join clips based on segment frame counts
    const joinValidationResult = useMemo((): ValidationResult | null => {
        // Filter to only segments (exclude join outputs)
        const segmentsOnly = sortedChildren.filter(child => {
            const url = child.location || '';
            return !url.includes('/joined_');
        });
        
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
    }, [sortedChildren, joinContextFrames, joinGapFrames, joinReplaceMode]);

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

    // Extract shot_id from parent generation params (if available)
    // This is set when the original travel-between-images task was created
    const parentShotId = useMemo(() => {
        const parentParams = parentGeneration?.params as any;
        return parentParams?.shot_id || parentParams?.orchestrator_details?.shot_id;
    }, [parentGeneration?.params]);
    
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
    const effectiveResolution = useMemo(() => {
        // Priority 1: Shot's aspect ratio
        if (shotData?.aspect_ratio) {
            const resolution = ASPECT_RATIO_TO_RESOLUTION[shotData.aspect_ratio];
            console.log('[ChildGenerationsView] Using shot aspect ratio:', {
                shotId: parentShotId?.substring(0, 8),
                aspectRatio: shotData.aspect_ratio,
                resolution
            });
            return resolution;
        }
        // Priority 2: Project's aspect ratio
        if (projectResolution) {
            console.log('[ChildGenerationsView] Using project aspect ratio:', {
                aspectRatio: projectAspectRatio,
                resolution: projectResolution
            });
            return projectResolution;
        }
        // Priority 3: Let the task creation logic handle it (fetches from project)
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
            actualChildrenCount: sortedChildren.length,
            childOrders: sortedChildren.map(c => (c as any).child_order),
            timestamp: Date.now()
        });
        
        if (!expectedSegmentData || expectedSegmentData.count === 0) {
            // No expected data, just show what we have
            console.log('[SegmentSlots] No expected data, showing all children as-is');
            return sortedChildren.map((child, index) => ({
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
        
        sortedChildren.forEach(child => {
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
    }, [sortedChildren, expectedSegmentData]);

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
    const parentInputImages: string[] = useMemo(() => deriveInputImages(parentTask), [parentTask]);

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
        if (!projectId || sortedChildren.length < 2) return;

        setIsJoiningClips(true);

        try {
            // Filter out previous join outputs - only include actual travel segments
            // Join outputs have URLs containing "joined_" in their filename
            const segmentsOnly = sortedChildren.filter(child => {
                const url = child.location || '';
                const isJoinOutput = url.includes('/joined_');
                if (isJoinOutput) {
                    console.log('[JoinClips] Filtering out join output:', {
                        childId: child.id?.substring(0, 8),
                        url: url.substring(url.lastIndexOf('/') + 1),
                    });
                }
                return !isJoinOutput;
            });

            // CRITICAL: Fetch fresh URLs from database to ensure we get current main variants
            // The cached sortedChildren may have stale URLs if user recently changed a variant
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
                totalChildrenBeforeFilter: sortedChildren.length,
                segmentsAfterFilter: segmentsOnly.length,
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
                                    onHoverStart={() => { }}
                                    onHoverEnd={() => { }}
                                    onMobileModalOpen={() => { }}
                                    selectedVideoForDetails={null}
                                    showTaskDetailsModal={false}
                                    onApplySettingsFromTask={() => { }}
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
            {sortedChildren.length >= 2 && sortedChildren.some(c => c.location) && (
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
                        shotId={undefined}
                        showTaskDetails={true}
                        showVideoTrimEditor={true}
                        initialVideoTrimMode={openInTrimMode}
                        taskDetailsData={{
                            task: segmentTask,
                            isLoading: isLoadingSegmentTask,
                            error: segmentTaskError,
                            inputImages: segmentInputImages,
                            taskId: segmentTaskId || null,
                            onApplySettingsFromTask: () => {}, // Not applicable in this context
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
                        shotId={undefined}
                        showTaskDetails={true}
                        showVideoTrimEditor={true}
                        taskDetailsData={{
                            task: parentTask,
                            isLoading: isLoadingParentTask,
                            error: parentTaskError,
                            inputImages: parentInputImages,
                            taskId: parentTaskId || null,
                            onApplySettingsFromTask: () => {}, // Not applicable in this context
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
                        shotId={undefined}
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
    availableLoras: LoraModel[];
    onImageLightboxOpen: (imageIndex: 0 | 1, images: { start: { url: string; generationId?: string } | null; end: { url: string; generationId?: string } | null }) => void;
    projectResolution?: string; // Resolution derived from project's aspect ratio
    aspectRatio?: string; // Aspect ratio string like "16:9" for video player containers
}

const SegmentCard: React.FC<SegmentCardProps> = ({ child, index, projectId, parentGenerationId, onLightboxOpen, onLightboxOpenWithTrim, onMobileTap, onUpdate, availableLoras, onImageLightboxOpen, projectResolution, aspectRatio }) => {
    const { toast } = useToast();
    const isMobile = useIsMobile();
    const [params, setParams] = useState<any>(child.params || {});
    
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
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [regenerateSuccess, setRegenerateSuccess] = useState(false);

    // Extract generation IDs for this segment's input images
    const segmentGenerationIds = useMemo(() => {
        const orchestratorDetails = params.orchestrator_details || {};
        const allGenerationIds = orchestratorDetails.input_image_generation_ids || params.input_image_generation_ids || [];
        const allFallbackUrls = orchestratorDetails.input_image_paths_resolved || params.input_image_paths_resolved || [];
        
        // For segment at index N, we need images[N] and images[N+1]
        return {
            startGenId: allGenerationIds[index] as string | undefined,
            endGenId: allGenerationIds[index + 1] as string | undefined,
            startFallbackUrl: allFallbackUrls[index] as string | undefined,
            endFallbackUrl: allFallbackUrls[index + 1] as string | undefined,
        };
    }, [params, index]);

    // Fetch fresh URLs from database for segment input images (always use main variant)
    const { data: freshGenerationUrls } = useQuery({
        queryKey: ['segment-input-generations', segmentGenerationIds.startGenId, segmentGenerationIds.endGenId],
        queryFn: async () => {
            const idsToFetch = [segmentGenerationIds.startGenId, segmentGenerationIds.endGenId].filter(Boolean) as string[];
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
                startUrl: segmentGenerationIds.startGenId ? urlMap[segmentGenerationIds.startGenId]?.location?.substring(0, 50) : 'no-id',
                endUrl: segmentGenerationIds.endGenId ? urlMap[segmentGenerationIds.endGenId]?.location?.substring(0, 50) : 'no-id',
            });
            
            return urlMap;
        },
        enabled: !!(segmentGenerationIds.startGenId || segmentGenerationIds.endGenId),
        staleTime: 10000, // Refresh every 10 seconds to pick up variant changes
    });

    // Build segmentImages using fresh URLs (from main variant) with fallback to cached URLs
    const segmentImages = useMemo(() => {
        const { startGenId, endGenId, startFallbackUrl, endFallbackUrl } = segmentGenerationIds;
        
        // Use fresh URL if available, otherwise fall back to cached URL
        const startUrl = (startGenId && freshGenerationUrls?.[startGenId]?.location) 
            || startFallbackUrl;
        const endUrl = (endGenId && freshGenerationUrls?.[endGenId]?.location) 
            || endFallbackUrl;
        
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
    }, [segmentGenerationIds, freshGenerationUrls, index]);
    
    // Detect generation mode from model name (I2V vs VACE)
    const generationMode = useMemo(() => {
        const modelName = params.model_name || params.orchestrator_details?.model_name;
        return detectGenerationMode(modelName);
    }, [params.model_name, params.orchestrator_details?.model_name]);
    
    // Get the appropriate built-in preset based on generation mode
    const builtinPreset = useMemo(() => {
        return generationMode === 'vace' ? BUILTIN_VACE_PRESET : BUILTIN_I2V_PRESET;
    }, [generationMode]);
    
    const builtinPresetId = useMemo(() => {
        return generationMode === 'vace' ? BUILTIN_VACE_PRESET_ID : BUILTIN_I2V_PRESET_ID;
    }, [generationMode]);
    
    // Motion control state - derived from params
    const [motionMode, setMotionMode] = useState<'basic' | 'advanced'>(() => {
        const orchestrator = params.orchestrator_details || {};
        if (orchestrator.advanced_mode || params.advanced_mode) return 'advanced';
        // Check motion_mode from params (may have been saved from previous regeneration)
        const savedMotionMode = orchestrator.motion_mode || params.motion_mode;
        if (savedMotionMode === 'advanced') return 'advanced';
        return 'basic';
    });
    // Derive advancedMode from motionMode - single source of truth
    const advancedMode = motionMode === 'advanced';
    const [amountOfMotion, setAmountOfMotion] = useState(() => {
        const orchestrator = params.orchestrator_details || {};
        const rawValue = params.amount_of_motion ?? orchestrator.amount_of_motion ?? 0.5;
        return Math.round(rawValue * 100);
    });
    const [phaseConfig, setPhaseConfig] = useState<PhaseConfig | undefined>(() => {
        // Try to extract phase config from params
        const orchestrator = params.orchestrator_details || {};
        if (orchestrator.phase_config) return orchestrator.phase_config;
        if (params.phase_config) return params.phase_config;
        return undefined;
    });
    const [selectedPhasePresetId, setSelectedPhasePresetId] = useState<string | null>(() => {
        // Try to restore preset ID from params (if previously saved)
        const orchestrator = params.orchestrator_details || {};
        return orchestrator.selected_phase_preset_id || params.selected_phase_preset_id || null;
    });
    const [randomSeed, setRandomSeed] = useState(() => {
        // Try to restore random seed setting from params
        const orchestrator = params.orchestrator_details || {};
        const savedRandomSeed = orchestrator.random_seed ?? params.random_seed;
        return savedRandomSeed !== undefined ? savedRandomSeed : true;
    });
    
    // LoRA state - derived from params.additional_loras
    const [selectedLoras, setSelectedLoras] = useState<ActiveLora[]>(() => {
        const lorasObj = params.additional_loras || params.orchestrator_details?.additional_loras || {};
        return Object.entries(lorasObj).map(([url, strength]) => {
            const filename = url.split('/').pop()?.replace('.safetensors', '') || url;
            return {
                id: url,
                name: filename,
                path: url,
                strength: typeof strength === 'number' ? strength : 1.0,
            };
        });
    });
    
    // Handlers for motion control (aligned with MotionPresetSelector API)
    const handleMotionModeChange = useCallback((mode: 'basic' | 'advanced') => {
        setMotionMode(mode);
        setIsDirty(true);
        // Initialize phaseConfig when switching to advanced using appropriate default
        if (mode === 'advanced' && !phaseConfig) {
            setPhaseConfig(builtinPreset.metadata.phaseConfig);
        }
    }, [phaseConfig, builtinPreset]);
    
    const handleAmountOfMotionChange = useCallback((value: number) => {
        setAmountOfMotion(value);
        setIsDirty(true);
    }, []);
    
    const handlePhaseConfigChange = useCallback((config: PhaseConfig) => {
        setPhaseConfig(config);
        setIsDirty(true);
    }, []);
    
    const handlePhasePresetSelect = useCallback((presetId: string, config: PhaseConfig, _metadata?: any) => {
        setSelectedPhasePresetId(presetId);
        setPhaseConfig(config);
        setIsDirty(true);
    }, []);
    
    const handlePhasePresetRemove = useCallback(() => {
        setSelectedPhasePresetId(null);
        setIsDirty(true);
    }, []);
    
    const handleRandomSeedChange = useCallback((value: boolean) => {
        setRandomSeed(value);
        setIsDirty(true);
    }, []);
    
    // LoRA handlers
    const handleAddLoraClick = useCallback(() => {
        setIsLoraModalOpen(true);
    }, []);
    
    const handleRemoveLora = useCallback((loraId: string) => {
        setSelectedLoras(prev => prev.filter(l => l.id !== loraId));
        setIsDirty(true);
    }, []);
    
    const handleLoraStrengthChange = useCallback((loraId: string, strength: number) => {
        setSelectedLoras(prev => prev.map(l => l.id === loraId ? { ...l, strength } : l));
        setIsDirty(true);
    }, []);
    
    // Handle LoRA selection from modal
    const handleLoraSelect = useCallback((lora: LoraModel) => {
        setSelectedLoras(prev => {
            // Check if already selected
            if (prev.some(l => l.id === lora.id || l.path === lora.path)) {
                return prev;
            }
            return [...prev, {
                id: lora.id || lora.path,
                name: lora.name,
                path: lora.path,
                strength: lora.default_strength || 1.0,
            }];
        });
        setIsDirty(true);
    }, []);

    // Handle segment regeneration
    const handleRegenerateSegment = useCallback(async () => {
        if (!projectId) {
            toast({
                title: "Error",
                description: "No project selected",
                variant: "destructive",
            });
            return;
        }

        setIsRegenerating(true);
        setRegenerateSuccess(false);

        try {
            // IMPORTANT: We must use fresh URLs from generations.location (main variant)
            // Do NOT fall back to cached URLs from params - those may be stale
            const { startGenId, endGenId } = segmentGenerationIds;
            
            // Require generation IDs to ensure we can fetch the current main variant
            if (!startGenId || !endGenId) {
                throw new Error("Missing generation IDs for input images. Cannot determine current main variant.");
            }
            
            // Check that fresh URLs have been fetched from the database
            const startFreshUrl = freshGenerationUrls?.[startGenId]?.location;
            const endFreshUrl = freshGenerationUrls?.[endGenId]?.location;
            
            if (!startFreshUrl || !endFreshUrl) {
                throw new Error("Fresh image URLs not loaded yet. Please wait a moment and try again.");
            }
            
            const startImageUrl = startFreshUrl;
            const endImageUrl = endFreshUrl;

            console.log('[RegenerateSegment] Using fresh image URLs from generations.location (main variant):', {
                startImageUrl: startImageUrl?.substring(0, 50),
                endImageUrl: endImageUrl?.substring(0, 50),
                startGenId: startGenId?.substring(0, 8),
                endGenId: endGenId?.substring(0, 8),
            });

            // Convert selectedLoras to the format expected by the task
            const lorasForTask = selectedLoras.map(lora => ({
                path: lora.path || lora.id,
                strength: lora.strength,
            }));

            // Build originalParams with current project resolution if available
            // This ensures regenerated segments use the project's aspect ratio settings
            const paramsWithResolution = projectResolution 
                ? {
                    ...params,
                    parsed_resolution_wh: projectResolution,
                    orchestrator_details: {
                        ...(params.orchestrator_details || {}),
                        parsed_resolution_wh: projectResolution,
                    },
                }
                : params;

            // CRITICAL: Log the exact prompt values being sent from UI state
            // This ensures the user-input prompts are the ones actually sent
            const uiBasePrompt = params.base_prompt || params.prompt || '';
            const uiNegativePrompt = params.negative_prompt || '';
            
            console.log('[RegenerateSegment] [SegmentPromptDebug] Creating individual_travel_segment task:', {
                projectId,
                parentGenerationId,
                childGenerationId: child.id,
                segmentIndex: index,
                startImageUrl: startImageUrl?.substring(0, 50),
                endImageUrl: endImageUrl?.substring(0, 50),
                startGenId: startGenId?.substring(0, 8),
                endGenId: endGenId?.substring(0, 8),
                numFrames: params.num_frames,
                hasOriginalParams: !!params,
                loraCount: lorasForTask.length,
                projectResolution,
                usingProjectResolution: !!projectResolution,
                // Log prompt values explicitly for debugging
                uiBasePrompt: uiBasePrompt?.substring(0, 100) + (uiBasePrompt?.length > 100 ? '...' : ''),
                uiNegativePrompt: uiNegativePrompt?.substring(0, 50) + (uiNegativePrompt?.length > 50 ? '...' : ''),
                promptSource: 'UI params state (user-editable)',
            });

            // Pass the full original params so the task structure matches travel_segment exactly
            // All UI-editable values are passed as EXPLICIT OVERRIDES - these take precedence
            await createIndividualTravelSegmentTask({
                project_id: projectId,
                parent_generation_id: parentGenerationId,
                child_generation_id: child.id,
                segment_index: index,
                start_image_url: startImageUrl,
                end_image_url: endImageUrl,
                // Include generation IDs for clickable images (if available)
                start_image_generation_id: startGenId,
                end_image_generation_id: endGenId,
                // Pass the full original params with updated resolution - the function will extract what it needs
                originalParams: paramsWithResolution,
                // ALL overrides from UI state (everything editable in SegmentCard)
                // CRITICAL: These are the user-input values that MUST take precedence
                base_prompt: uiBasePrompt,
                negative_prompt: uiNegativePrompt,
                num_frames: params.num_frames,
                seed: randomSeed ? undefined : (params.seed_to_use || params.seed), // Use original seed if not random
                random_seed: randomSeed,
                amount_of_motion: amountOfMotion / 100, // Convert from 0-100 to 0-1
                advanced_mode: advancedMode,
                phase_config: phaseConfig,
                motion_mode: motionMode,
                selected_phase_preset_id: selectedPhasePresetId,
                loras: lorasForTask,
            });

            setRegenerateSuccess(true);
            toast({
                title: "Regeneration started",
                description: `Segment ${index + 1} is being regenerated. Check the Tasks pane for progress.`,
            });

            // Clear success state after 3 seconds
            setTimeout(() => setRegenerateSuccess(false), 3000);

        } catch (error: any) {
            console.error('[RegenerateSegment] Error:', error);
            toast({
                title: "Error",
                description: error.message || "Failed to start regeneration",
                variant: "destructive",
            });
        } finally {
            setIsRegenerating(false);
        }
    }, [
        projectId, 
        parentGenerationId, 
        child.id, 
        index, 
        params, 
        selectedLoras, 
        segmentGenerationIds,
        freshGenerationUrls,
        amountOfMotion,
        advancedMode, 
        phaseConfig, 
        motionMode,
        selectedPhasePresetId,
        randomSeed,
        projectResolution,
        toast
    ]);
    
    // Update local state when child prop changes
    useEffect(() => {
        setParams(child.params || {});
        setIsDirty(false);
    }, [child.params]);

    // Check for extended params (expanded arrays from orchestrator) if standard params are missing
    useEffect(() => {
        console.log('[SegmentCardPopulation] Starting population check', {
            childId: child.id?.substring(0, 8),
            hasParams: !!child.params,
            paramsKeys: child.params ? Object.keys(child.params) : [],
            timestamp: Date.now()
        });
        
        if (!child.params) {
            console.log('[SegmentCardPopulation] No params found, skipping');
            return;
        }
        
        const currentParams = child.params as any;
        const orchestratorDetails = currentParams.orchestrator_details || {};
        const segmentIndex = currentParams.segment_index;
        
        console.log('[SegmentCardPopulation] Params inspection', {
            childId: child.id?.substring(0, 8),
            hasOrchestratorDetails: !!orchestratorDetails,
            orchestratorDetailsKeys: Object.keys(orchestratorDetails),
            segmentIndex,
            currentNumFrames: currentParams.num_frames,
            currentPrompt: currentParams.prompt?.substring(0, 50),
            currentBasePrompt: currentParams.base_prompt?.substring(0, 50),
            segmentFramesExpanded: orchestratorDetails.segment_frames_expanded,
            basePromptsExpanded: orchestratorDetails.base_prompts_expanded,
            enhancedPromptsExpanded: orchestratorDetails.enhanced_prompts_expanded?.map((p: string) => p?.substring(0, 30)),
            timestamp: Date.now()
        });
        
        let updates: any = {};
        let hasUpdates = false;
        
        // Check if we need to populate missing fields from orchestrator arrays
        if (segmentIndex !== undefined) {
            console.log('[SegmentCardPopulation] Segment index found:', segmentIndex);
            
            // Populate frames if missing
            if (!currentParams.num_frames && orchestratorDetails.segment_frames_expanded && orchestratorDetails.segment_frames_expanded[segmentIndex]) {
                console.log('[SegmentCardPopulation] Populating num_frames from segment_frames_expanded[' + segmentIndex + ']:', orchestratorDetails.segment_frames_expanded[segmentIndex]);
                updates.num_frames = orchestratorDetails.segment_frames_expanded[segmentIndex];
                hasUpdates = true;
            } else if (!currentParams.num_frames && orchestratorDetails.segment_frames_target) {
                console.log('[SegmentCardPopulation] Populating num_frames from segment_frames_target:', orchestratorDetails.segment_frames_target);
                updates.num_frames = orchestratorDetails.segment_frames_target;
                hasUpdates = true;
            } else {
                console.log('[SegmentCardPopulation] NOT populating num_frames', {
                    hasCurrentNumFrames: !!currentParams.num_frames,
                    hasSegmentFramesExpanded: !!orchestratorDetails.segment_frames_expanded,
                    hasSegmentFramesTarget: !!orchestratorDetails.segment_frames_target,
                    segmentFramesExpandedValue: orchestratorDetails.segment_frames_expanded?.[segmentIndex]
                });
            }
            
             // Populate base_prompt if missing or empty
            // Try enhanced_prompts_expanded first, then base_prompts_expanded
            if (!currentParams.base_prompt || currentParams.base_prompt === "") {
                if (orchestratorDetails.enhanced_prompts_expanded && orchestratorDetails.enhanced_prompts_expanded[segmentIndex]) {
                    console.log('[SegmentCardPopulation] Populating base_prompt from enhanced_prompts_expanded[' + segmentIndex + ']:', orchestratorDetails.enhanced_prompts_expanded[segmentIndex]?.substring(0, 50));
                    updates.base_prompt = orchestratorDetails.enhanced_prompts_expanded[segmentIndex];
                    hasUpdates = true;
                } else if (orchestratorDetails.base_prompts_expanded && orchestratorDetails.base_prompts_expanded[segmentIndex]) {
                    console.log('[SegmentCardPopulation] Populating base_prompt from base_prompts_expanded[' + segmentIndex + ']:', orchestratorDetails.base_prompts_expanded[segmentIndex]?.substring(0, 50));
                    updates.base_prompt = orchestratorDetails.base_prompts_expanded[segmentIndex];
                    hasUpdates = true;
                } else if (orchestratorDetails.base_prompt) {
                    console.log('[SegmentCardPopulation] Populating base_prompt from orchestrator_details.base_prompt:', orchestratorDetails.base_prompt?.substring(0, 50));
                    updates.base_prompt = orchestratorDetails.base_prompt;
                    hasUpdates = true;
                } else {
                    console.log('[SegmentCardPopulation] NOT populating base_prompt', {
                        hasCurrentBasePrompt: !!currentParams.base_prompt,
                        currentBasePromptEmpty: currentParams.base_prompt === "",
                        hasEnhancedPromptsExpanded: !!orchestratorDetails.enhanced_prompts_expanded,
                        hasBasePromptsExpanded: !!orchestratorDetails.base_prompts_expanded,
                        hasOrchestratorBasePrompt: !!orchestratorDetails.base_prompt
                    });
                }
            } else {
                console.log('[SegmentCardPopulation] base_prompt already exists, not populating');
            }
        } else {
            console.log('[SegmentCardPopulation] No segment index found, cannot populate from expanded arrays');
        }
        
        if (hasUpdates) {
            console.log('[SegmentCardPopulation] Applying updates:', updates);
            setParams(prev => ({ ...prev, ...updates }));
            // We don't set dirty here as this is just initializing display values
        } else {
            console.log('[SegmentCardPopulation] No updates needed');
        }
    }, [child.params, child.id]);

    const handleChange = (key: string, value: any) => {
        setParams(prev => ({ ...prev, [key]: value }));
        setIsDirty(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('generations')
                .update({ params })
                .eq('id', child.id);

            if (error) throw error;

            toast({
                title: "Saved",
                description: `Segment ${index + 1} settings updated`,
            });
            setIsDirty(false);
            onUpdate();
        } catch (error) {
            console.error('Error updating segment:', error);
            toast({
                title: "Error",
                description: "Failed to save settings",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Card className="overflow-hidden flex flex-col">
            {/* Video Preview */}
            <div 
                className="relative bg-black group"
                style={aspectRatioStyle}
            >
                    {/* Trim button - bottom right overlay, appears on hover */}
                    <Button
                        variant="secondary"
                        size="sm"
                        className="absolute bottom-2 right-2 z-10 h-7 px-2 gap-1 bg-black/60 hover:bg-black/80 text-white border-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                            e.stopPropagation();
                            onLightboxOpenWithTrim();
                        }}
                    >
                        <Scissors className="h-3.5 w-3.5" />
                        <span className="text-xs">Trim</span>
                    </Button>
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
                        onDelete={() => { }}
                        deletingVideoId={null}
                        onHoverStart={() => { }}
                        onHoverEnd={() => { }}
                        onMobileModalOpen={() => { }}
                        selectedVideoForDetails={null}
                        showTaskDetailsModal={false}
                        onApplySettingsFromTask={() => { }}
                        hideActions={true}
                    />
            </div>

            {/* Settings Form */}
            <CardContent className="p-4 space-y-3 flex-1 flex flex-col">
                {/* Input Images - Clickable thumbnails */}
                {segmentImages.hasImages && (
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Input Images:</Label>
                        <div className="flex gap-2">
                            {segmentImages.start && (
                                <button
                                    onClick={() => {
                                        console.log('[SegmentImageFlow] START image clicked for segment', index);
                                        console.log('[SegmentImageFlow] START image URL:', segmentImages.start?.url);
                                        console.log('[SegmentImageFlow] START image generationId:', segmentImages.start?.generationId);
                                        console.log('[SegmentImageFlow] Full segmentImages object:', segmentImages);
                                        onImageLightboxOpen(0, segmentImages);
                                    }}
                                    className="relative w-16 h-16 rounded-md overflow-hidden border border-border/50 hover:border-primary/50 transition-colors group"
                                    title="View start image"
                                >
                                    <img 
                                        src={segmentImages.start.url} 
                                        alt="Start frame"
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                                    <span className="absolute bottom-0.5 left-0.5 text-[10px] bg-black/60 text-white px-1 rounded">Start</span>
                                </button>
                            )}
                            {segmentImages.end && (
                                <button
                                    onClick={() => {
                                        console.log('[SegmentImageFlow] END image clicked for segment', index);
                                        console.log('[SegmentImageFlow] END image URL:', segmentImages.end?.url);
                                        console.log('[SegmentImageFlow] END image generationId:', segmentImages.end?.generationId);
                                        console.log('[SegmentImageFlow] Full segmentImages object:', segmentImages);
                                        onImageLightboxOpen(1, segmentImages);
                                    }}
                                    className="relative w-16 h-16 rounded-md overflow-hidden border border-border/50 hover:border-primary/50 transition-colors group"
                                    title="View end image"
                                >
                                    <img 
                                        src={segmentImages.end.url} 
                                        alt="End frame"
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                                    <span className="absolute bottom-0.5 left-0.5 text-[10px] bg-black/60 text-white px-1 rounded">End</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}

                <div className="space-y-2 flex-1">
                    <Label className="text-xs font-medium">Prompt:</Label>
                    <Textarea
                        value={params.base_prompt || params.prompt || ''}
                        onChange={(e) => {
                            // Update both base_prompt and prompt to keep them in sync
                            setParams(prev => ({
                                ...prev,
                                base_prompt: e.target.value,
                                prompt: e.target.value
                            }));
                            setIsDirty(true);
                        }}
                        className="h-20 text-sm resize-none"
                        placeholder="Describe this segment..."
                        clearable
                        onClear={() => {
                            setParams(prev => ({ ...prev, base_prompt: '', prompt: '' }));
                            setIsDirty(true);
                        }}
                        voiceInput
                        voiceContext="This is a prompt for a video segment. Describe the motion, action, or visual content you want in this part of the video."
                        onVoiceResult={(result) => {
                            setParams(prev => ({
                                ...prev,
                                base_prompt: result.prompt || result.transcription,
                                prompt: result.prompt || result.transcription
                            }));
                            setIsDirty(true);
                        }}
                    />
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">Frames:</Label>
                        <span className="text-xs text-muted-foreground">
                            {params.num_frames || 0} ({framesToSeconds(params.num_frames || 0)})
                        </span>
                    </div>
                    {/* Frame counts are quantized to 4N+1 format for Wan model compatibility */}
                    <Slider
                        value={[quantizeFrameCount(params.num_frames || 9, 9)]}
                        onValueChange={([value]) => handleChange('num_frames', quantizeFrameCount(value, 9))}
                        min={9}
                        max={81}
                        step={4}
                        className="w-full"
                    />
                </div>

                <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                    <CollapsibleTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-between h-9 text-xs font-medium"
                        >
                            <span>Advanced Settings</span>
                            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 pt-3">
                        {/* Generation Settings Section */}
                        <div className="space-y-3 p-3 bg-muted/30 rounded-lg border border-border/50">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Generation Settings:</Label>
                            
                            {/* Negative Prompt */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Negative Prompt:</Label>
                                <Textarea
                                    value={params.negative_prompt || ''}
                                    onChange={(e) => handleChange('negative_prompt', e.target.value)}
                                    className="h-16 text-xs resize-none"
                                    placeholder="Things to avoid..."
                                    clearable
                                    onClear={() => handleChange('negative_prompt', '')}
                                    voiceInput
                                    voiceContext="This is a negative prompt - things to AVOID in video generation. List unwanted qualities as a comma-separated list."
                                    onVoiceResult={(result) => {
                                        handleChange('negative_prompt', result.prompt || result.transcription);
                                    }}
                                />
                            </div>

                            {/* Model & Resolution Info (read-only) */}
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="flex flex-col">
                                    <span className="text-muted-foreground">Model</span>
                                    <span className="font-medium truncate" title={params.model_name || 'Default'}>
                                        {(params.model_name || 'wan_2_2_i2v').replace('wan_2_2_', '').replace(/_/g, ' ')}
                                    </span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-muted-foreground">Resolution</span>
                                    <span className="font-medium">
                                        {params.parsed_resolution_wh || params.orchestrator_details?.parsed_resolution_wh || 'Auto'}
                                    </span>
                                </div>
                            </div>

                            {/* Seed Info */}
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Seed</span>
                                <span className="font-mono font-medium">
                                    {params.seed_to_use || params.orchestrator_details?.seed_base || 'Random'}
                                </span>
                            </div>
                        </div>

                        {/* Motion Settings - Using shared MotionPresetSelector */}
                        <MotionPresetSelector
                            builtinPreset={builtinPreset}
                            featuredPresetIds={[]}
                            generationTypeMode={generationMode}
                            selectedPhasePresetId={selectedPhasePresetId}
                            phaseConfig={phaseConfig ?? builtinPreset.metadata.phaseConfig}
                            motionMode={motionMode}
                            onPresetSelect={handlePhasePresetSelect}
                            onPresetRemove={handlePhasePresetRemove}
                            onModeChange={handleMotionModeChange}
                            onPhaseConfigChange={handlePhaseConfigChange}
                            availableLoras={availableLoras}
                            randomSeed={randomSeed}
                            onRandomSeedChange={handleRandomSeedChange}
                            queryKeyPrefix={`segment-${index}-presets`}
                            renderBasicModeContent={() => (
                                <div className="space-y-3">
                                    <ActiveLoRAsDisplay
                                        selectedLoras={selectedLoras}
                                        onRemoveLora={handleRemoveLora}
                                        onLoraStrengthChange={handleLoraStrengthChange}
                                        availableLoras={availableLoras}
                                    />
                                    <button
                                        onClick={handleAddLoraClick}
                                        className="w-full text-sm text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/30 hover:border-muted-foreground/50 rounded-lg py-2 transition-colors"
                                    >
                                        Add or manage LoRAs
                                    </button>
                                </div>
                            )}
                        />
                        
                        {/* LoRA Selector Modal */}
                        <LoraSelectorModal
                            isOpen={isLoraModalOpen}
                            onClose={() => setIsLoraModalOpen(false)}
                            onSelect={handleLoraSelect}
                            availableLoras={availableLoras}
                            selectedLoras={selectedLoras.map(l => l.id)}
                        />
                    </CollapsibleContent>
                </Collapsible>

                {/* Regenerate Segment Button */}
                <Button
                    size="sm"
                    onClick={handleRegenerateSegment}
                    disabled={isRegenerating}
                    className="w-full gap-2"
                    variant={regenerateSuccess ? "outline" : "default"}
                >
                    {isRegenerating ? (
                        <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Starting...
                        </>
                    ) : regenerateSuccess ? (
                        <>
                            <Check className="w-3 h-3 text-green-500" />
                            Task Created
                        </>
                    ) : (
                        <>
                            <RotateCcw className="w-3 h-3" />
                            Regenerate Segment
                        </>
                    )}
                </Button>
            </CardContent>
        </Card>
    );
};

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

const SegmentPlaceholder: React.FC<SegmentPlaceholderProps> = ({
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
};
