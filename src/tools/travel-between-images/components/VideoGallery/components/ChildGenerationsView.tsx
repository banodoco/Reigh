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
import { ChevronLeft, ChevronDown, ChevronUp, Save, Film, Loader2, Check, Layers, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/shared/hooks/use-toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { Card, CardContent } from '@/shared/components/ui/card';
import { createJoinClipsTask } from '@/shared/lib/tasks/joinClips';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { JoinClipsSettingsForm } from '@/tools/join-clips/components/JoinClipsSettingsForm';
import { joinClipsSettings } from '@/tools/join-clips/settings';
import MediaLightbox from '@/shared/components/MediaLightbox';
import { useLoraManager, type LoraModel, type ActiveLora } from '@/shared/hooks/useLoraManager';
import { useListPublicResources } from '@/shared/hooks/useResources';
import { getDisplayUrl } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { MotionControl } from '@/tools/travel-between-images/components/MotionControl';
import { PhaseConfig, DEFAULT_PHASE_CONFIG } from '@/tools/travel-between-images/settings';
import { createMobileTapHandler, deriveInputImages } from '../utils/gallery-utils';
import { useTaskFromUnifiedCache } from '@/shared/hooks/useUnifiedGenerations';
import { useGetTask } from '@/shared/hooks/useTasks';

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
}

export const ChildGenerationsView: React.FC<ChildGenerationsViewProps> = ({
    parentGenerationId,
    projectId,
    onBack,
}) => {
    const { toast } = useToast();
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [isParentLightboxOpen, setIsParentLightboxOpen] = useState(false);
    const isMobile = useIsMobile();
    
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
            const transformed = {
                ...item,
                // Map GeneratedImageWithMetadata format to GenerationRow format
                location: item.url || item.location,
                imageUrl: item.url || item.imageUrl,
                thumbUrl: item.thumbUrl || item.thumbnail_url || item.url || item.location, // Explicitly map thumbUrl
                params: item.metadata || item.params, // params are stored in metadata by transformer
                created_at: item.createdAt || item.created_at,
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
                    allKeys: Object.keys(firstChild)
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

    const handleLightboxClose = () => setLightboxIndex(null);
    const handleLightboxNext = () => setLightboxIndex((prev) => (prev !== null ? (prev + 1) % sortedChildren.length : null));
    const handleLightboxPrev = () => setLightboxIndex((prev) => (prev !== null ? (prev - 1 + sortedChildren.length) % sortedChildren.length : null));

    // ===============================================================================
    // TASK DATA HOOKS - For lightbox task details
    // ===============================================================================
    
    // Get task data for segment lightbox
    const segmentLightboxVideoId = lightboxIndex !== null && sortedChildren[lightboxIndex] ? sortedChildren[lightboxIndex].id : null;
    const { data: segmentTaskMapping, isLoading: isLoadingSegmentMapping } = useTaskFromUnifiedCache(segmentLightboxVideoId || '');
    const segmentTaskId = typeof segmentTaskMapping?.taskId === 'string' ? segmentTaskMapping.taskId : '';
    const { data: segmentTask, isLoading: isLoadingSegmentTask, error: segmentTaskError } = useGetTask(segmentTaskId);
    const segmentInputImages: string[] = useMemo(() => deriveInputImages(segmentTask), [segmentTask]);
    
    // Debug: Log task data fetching for segments
    React.useEffect(() => {
        if (lightboxIndex !== null && segmentTask) {
            console.log('[ChildViewTaskDebug] ===== SEGMENT TASK DETAILS =====');
            console.log('[ChildViewTaskDebug] segmentTaskId:', segmentTaskId);
            console.log('[ChildViewTaskDebug] segmentTask.task_type:', segmentTask.task_type);
            console.log('[ChildViewTaskDebug] segmentTask.params?.prompt:', segmentTask.params?.prompt?.substring?.(0, 100));
            console.log('[ChildViewTaskDebug] segmentTask.params?.base_prompt:', segmentTask.params?.base_prompt?.substring?.(0, 100));
            console.log('[ChildViewTaskDebug] segmentTask.params?.segment_index:', segmentTask.params?.segment_index);
            console.log('[ChildViewTaskDebug] segmentTask.params?.orchestrator_task_id:', segmentTask.params?.orchestrator_task_id);
            console.log('[ChildViewTaskDebug] Full segmentTask.params keys:', Object.keys(segmentTask.params || {}));
        }
    }, [lightboxIndex, segmentTaskId, segmentTask]);
    
    // Get task data for parent lightbox
    const { data: parentTaskMapping, isLoading: isLoadingParentMapping } = useTaskFromUnifiedCache(isParentLightboxOpen ? parentGenerationId : '');
    const parentTaskId = typeof parentTaskMapping?.taskId === 'string' ? parentTaskMapping.taskId : '';
    const { data: parentTask, isLoading: isLoadingParentTask, error: parentTaskError } = useGetTask(parentTaskId);
    const parentInputImages: string[] = useMemo(() => deriveInputImages(parentTask), [parentTask]);
    
    // Debug: Log task data fetching for parent
    React.useEffect(() => {
        if (isParentLightboxOpen && parentTask) {
            console.log('[ChildViewTaskDebug] ===== PARENT TASK DETAILS =====');
            console.log('[ChildViewTaskDebug] parentTaskId:', parentTaskId);
            console.log('[ChildViewTaskDebug] parentTask.task_type:', parentTask.task_type);
            console.log('[ChildViewTaskDebug] parentTask.params?.prompt:', parentTask.params?.prompt?.substring?.(0, 100));
            console.log('[ChildViewTaskDebug] parentTask.params?.base_prompt:', parentTask.params?.base_prompt?.substring?.(0, 100));
            console.log('[ChildViewTaskDebug] Full parentTask.params keys:', Object.keys(parentTask.params || {}));
        }
    }, [isParentLightboxOpen, parentTaskId, parentTask]);

    // Join Clips State
    const [isJoiningClips, setIsJoiningClips] = useState(false);
    const [joinClipsSuccess, setJoinClipsSuccess] = useState(false);
    // const [showJoinModal, setShowJoinModal] = useState(false); // Removed modal state
    const [joinPrompt, setJoinPrompt] = useState('');
    const [joinNegativePrompt, setJoinNegativePrompt] = useState('');
    const [joinContextFrames, setJoinContextFrames] = useState(joinClipsSettings.defaults.contextFrameCount);
    const [joinGapFrames, setJoinGapFrames] = useState(joinClipsSettings.defaults.gapFrameCount);
    const [joinReplaceMode, setJoinReplaceMode] = useState(joinClipsSettings.defaults.replaceMode);
    const [keepBridgingImages, setKeepBridgingImages] = useState(joinClipsSettings.defaults.keepBridgingImages);
    const [useIndividualPrompts, setUseIndividualPrompts] = useState(false);
    const queryClient = useQueryClient();

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

    // Initialize LoRA manager (uses availableLoras from publicLorasQuery above)
    const loraManager = useLoraManager(availableLoras, {
        projectId: projectId || undefined,
        persistenceScope: 'project',
        enableProjectPersistence: true,
        persistenceKey: 'join-clips-segments',
    });

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
            
            // Invalidate queries to refresh the UI
            queryClient.invalidateQueries({ queryKey: ['generation', parentGenerationId] });
            queryClient.invalidateQueries({ queryKey: ['unified-generations'] });
        } catch (error) {
            console.error('[ChildGenerationsView] Error clearing parent output:', error);
            toast({
                title: "Error",
                description: "Failed to clear the output",
                variant: "destructive",
            });
        }
    }, [parentGenerationId, queryClient, toast]);

    const handleRestoreDefaults = () => {
        setJoinContextFrames(joinClipsSettings.defaults.contextFrameCount);
        setJoinGapFrames(joinClipsSettings.defaults.gapFrameCount);
        setJoinReplaceMode(joinClipsSettings.defaults.replaceMode);
        setKeepBridgingImages(joinClipsSettings.defaults.keepBridgingImages);
        setJoinPrompt('');
        setJoinNegativePrompt('');
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
            const clips = sortedChildren.map((child, index) => ({
                url: child.location || '',
                name: `Segment ${index + 1}`,
            })).filter(c => c.url);

            // Convert selected LoRAs
            const lorasForTask = loraManager.selectedLoras.map(lora => ({
                path: lora.path,
                strength: lora.strength,
            }));

            console.log('[JoinClips] Creating join task for segments:', {
                clipCount: clips.length,
                prompt: joinPrompt,
                contextFrames: joinContextFrames,
                gapFrames: joinGapFrames,
                replaceMode: joinReplaceMode,
                keepBridgingImages: keepBridgingImages,
                loras: lorasForTask.length
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
                ...(lorasForTask.length > 0 && { loras: lorasForTask }),
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
            {/* Header */}
            <div className="sticky top-0 md:top-24 z-40 bg-background/95 backdrop-blur-sm border-b border-border/50 w-[100vw] ml-[calc(50%-50vw)]">
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
                        <div className="text-sm text-muted-foreground">
                            {sortedChildren.length} {sortedChildren.length === 1 ? 'segment' : 'segments'}
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
                            <div className="w-full max-w-2xl">
                                <VideoItem
                                    video={parentVideoRow}
                                    index={-1}
                                    originalIndex={-1}
                                    shouldPreload="metadata"
                                    isMobile={isMobile}
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
                    ) : sortedChildren.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 border rounded-lg bg-muted/10">
                            <p className="text-muted-foreground">No segments found for this generation.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {sortedChildren.map((child, index) => (
                                <SegmentCard
                                    key={child.id}
                                    child={child}
                                    index={index}
                                    projectId={projectId}
                                    onLightboxOpen={() => setLightboxIndex(index)}
                                    onMobileTap={handleMobileTap}
                                    onUpdate={refetch}
                                    availableLoras={availableLoras}
                                />
                            ))}
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
                            setGapFrames={setJoinGapFrames}
                            contextFrames={joinContextFrames}
                            setContextFrames={setJoinContextFrames}
                            replaceMode={joinReplaceMode}
                            setReplaceMode={setJoinReplaceMode}
                            keepBridgingImages={keepBridgingImages}
                            setKeepBridgingImages={setKeepBridgingImages}
                            prompt={joinPrompt}
                            setPrompt={setJoinPrompt}
                            negativePrompt={joinNegativePrompt}
                            setNegativePrompt={setJoinNegativePrompt}
                            availableLoras={availableLoras}
                            projectId={projectId}
                            loraPersistenceKey="join-clips-segments"
                            onGenerate={handleConfirmJoin}
                            isGenerating={isJoiningClips}
                            generateSuccess={joinClipsSuccess}
                            generateButtonText={`Generate Joined Video (${sortedChildren.length} Segments)`}
                        />
                    </div>
                </div>
            )}

            {/* Lightbox for Segments */}
            {(() => {
                const shouldRenderSegmentLightbox = lightboxIndex !== null && sortedChildren[lightboxIndex];
                console.log('[MobileTapFlow:ChildView] Segment Lightbox render check', { 
                    lightboxIndex,
                    shouldRenderSegmentLightbox,
                    sortedChildrenLength: sortedChildren.length,
                    hasChildAtIndex: lightboxIndex !== null ? !!sortedChildren[lightboxIndex] : 'N/A',
                    timestamp: Date.now()
                });
                if (!shouldRenderSegmentLightbox) return null;
                
                console.log('[MobileTapFlow:ChildView] ✅ RENDERING MediaLightbox for segment', { 
                    index: lightboxIndex, 
                    childId: sortedChildren[lightboxIndex]?.id,
                    timestamp: Date.now()
                });
                return (
                    <MediaLightbox
                        media={sortedChildren[lightboxIndex]}
                        onClose={handleLightboxClose}
                        onNext={handleLightboxNext}
                        onPrevious={handleLightboxPrev}
                        showNavigation={true}
                        showImageEditTools={false}
                        showDownload={true}
                        hasNext={sortedChildren.length > 1}
                        hasPrevious={sortedChildren.length > 1}
                        starred={(sortedChildren[lightboxIndex] as { starred?: boolean }).starred ?? false}
                        shotId={undefined}
                        showTaskDetails={true}
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
        </div>
    );
};

interface SegmentCardProps {
    child: GenerationRow;
    index: number;
    projectId: string | null;
    onLightboxOpen: () => void;
    onMobileTap: (index: number) => void;
    onUpdate: () => void;
    availableLoras: LoraModel[];
}

const SegmentCard: React.FC<SegmentCardProps> = ({ child, index, projectId, onLightboxOpen, onMobileTap, onUpdate, availableLoras }) => {
    const { toast } = useToast();
    const isMobile = useIsMobile();
    const [params, setParams] = useState<any>(child.params || {});
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
    
    // Motion control state - derived from params
    const [motionMode, setMotionMode] = useState<'basic' | 'presets' | 'advanced'>(() => {
        const orchestrator = params.orchestrator_details || {};
        if (orchestrator.advanced_mode || params.advanced_mode) return 'advanced';
        return 'basic';
    });
    const [advancedMode, setAdvancedMode] = useState(() => {
        const orchestrator = params.orchestrator_details || {};
        return orchestrator.advanced_mode || params.advanced_mode || false;
    });
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
    const [selectedPhasePresetId, setSelectedPhasePresetId] = useState<string | null>(null);
    const [randomSeed, setRandomSeed] = useState(true);
    
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
    
    // Handlers for motion control
    const handleMotionModeChange = useCallback((mode: 'basic' | 'presets' | 'advanced') => {
        setMotionMode(mode);
        setIsDirty(true);
        if (mode === 'advanced' || mode === 'presets') {
            setAdvancedMode(true);
            if (!phaseConfig) {
                setPhaseConfig(DEFAULT_PHASE_CONFIG);
            }
        } else {
            setAdvancedMode(false);
        }
    }, [phaseConfig]);
    
    const handleAmountOfMotionChange = useCallback((value: number) => {
        setAmountOfMotion(value);
        setIsDirty(true);
    }, []);
    
    const handleAdvancedModeChange = useCallback((value: boolean) => {
        setAdvancedMode(value);
        setIsDirty(true);
    }, []);
    
    const handlePhaseConfigChange = useCallback((config: PhaseConfig) => {
        setPhaseConfig(config);
        setIsDirty(true);
    }, []);
    
    const handlePhasePresetSelect = useCallback((presetId: string, config: PhaseConfig) => {
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
    
    // Current settings for MotionControl
    const currentMotionSettings = useMemo(() => ({
        basePrompt: params.base_prompt || params.prompt || '',
        negativePrompt: params.negative_prompt || '',
        enhancePrompt: params.enhancePrompt || params.orchestrator_details?.enhance_prompt || false,
        durationFrames: params.num_frames || 61,
        selectedLoras: selectedLoras.map(l => ({ id: l.id, name: l.name, strength: l.strength })),
    }), [params, selectedLoras]);

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
                className="relative aspect-video bg-black group"
            >
                    <VideoItem
                        video={child}
                        index={index}
                        originalIndex={index}
                        shouldPreload="metadata"
                        isMobile={isMobile}
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
                <div className="space-y-2 flex-1">
                    <Label className="text-xs font-medium">Prompt</Label>
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
                    />
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">Frames</Label>
                        <span className="text-xs text-muted-foreground">{params.num_frames || 0}</span>
                    </div>
                    <Slider
                        value={[params.num_frames || 0]}
                        onValueChange={([value]) => handleChange('num_frames', value)}
                        min={1}
                        max={81}
                        step={1}
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
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Generation Settings</Label>
                            
                            {/* Negative Prompt */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Negative Prompt</Label>
                                <Textarea
                                    value={params.negative_prompt || ''}
                                    onChange={(e) => handleChange('negative_prompt', e.target.value)}
                                    className="h-16 text-xs resize-none"
                                    placeholder="Things to avoid..."
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

                        {/* Motion Control - Same component as main page */}
                        <MotionControl
                            motionMode={motionMode}
                            onMotionModeChange={handleMotionModeChange}
                            amountOfMotion={amountOfMotion}
                            onAmountOfMotionChange={handleAmountOfMotionChange}
                            selectedLoras={selectedLoras}
                            availableLoras={availableLoras}
                            onAddLoraClick={handleAddLoraClick}
                            onRemoveLora={handleRemoveLora}
                            onLoraStrengthChange={handleLoraStrengthChange}
                            selectedPhasePresetId={selectedPhasePresetId}
                            onPhasePresetSelect={handlePhasePresetSelect}
                            onPhasePresetRemove={handlePhasePresetRemove}
                            currentSettings={currentMotionSettings}
                            advancedMode={advancedMode}
                            onAdvancedModeChange={handleAdvancedModeChange}
                            phaseConfig={phaseConfig}
                            onPhaseConfigChange={handlePhaseConfigChange}
                            randomSeed={randomSeed}
                            onRandomSeedChange={handleRandomSeedChange}
                        />
                    </CollapsibleContent>
                </Collapsible>

                {/* Regenerate Video Button - TODO: Implement regenerate functionality
                <Button
                    size="sm"
                    onClick={() => {
                        toast({
                            title: "Regenerate Video",
                            description: "This feature is coming soon!",
                        });
                    }}
                    className="w-full gap-2"
                >
                    <Film className="w-3 h-3" />
                    Regenerate Video
                </Button>
                */}
            </CardContent>
        </Card>
    );
};
