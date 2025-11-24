import React, { useState, useEffect, useCallback } from 'react';
import { useGenerations } from '@/shared/hooks/useGenerations';
import { GenerationRow } from '@/types/shots';
import { Skeleton } from '@/shared/components/ui/skeleton';
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
import { useLoraManager, type LoraModel } from '@/shared/hooks/useLoraManager';
import { useListPublicResources } from '@/shared/hooks/useResources';
import { getDisplayUrl } from '@/shared/lib/utils';

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
        return items.map((item: any) => ({
            ...item,
            // Map GeneratedImageWithMetadata format to GenerationRow format
            location: item.url || item.location,
            imageUrl: item.url || item.imageUrl,
            params: item.metadata || item.params, // params are stored in metadata by transformer
            created_at: item.createdAt || item.created_at,
        }));
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

    // Fetch available LoRAs
    const publicLorasResult = useListPublicResources('lora');
    const availableLoras = ((publicLorasResult.data || []) as any[]).map((resource: any) => resource.metadata || {}) as LoraModel[];

    // Initialize LoRA manager
    const loraManager = useLoraManager(availableLoras, {
        projectId: projectId || undefined,
        persistenceScope: 'project',
        enableProjectPersistence: true,
        persistenceKey: 'join-clips-segments',
    });

    const handleRestoreDefaults = () => {
        setJoinContextFrames(joinClipsSettings.defaults.contextFrameCount);
        setJoinGapFrames(joinClipsSettings.defaults.gapFrameCount);
        setJoinReplaceMode(joinClipsSettings.defaults.replaceMode);
        setKeepBridgingImages(joinClipsSettings.defaults.keepBridgingImages);
        setJoinPrompt('');
        setJoinNegativePrompt('');
        loraManager.clearLoras();
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
            <div className="sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 pt-4 pb-0">
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
            {parentGeneration?.location && (
                <div className="max-w-7xl mx-auto px-4 pt-5 pb-0">
                    <Card className="overflow-hidden border-primary/20 shadow-sm">
                        <div className="p-4 border-b bg-muted/30">
                            <h2 className="text-lg font-medium flex items-center gap-2">
                                <Film className="w-5 h-5 text-primary" />
                                Final Video
                            </h2>
                        </div>
                        <div className="bg-black w-full flex items-center justify-center min-h-[300px] max-h-[60vh] relative group">
                            <video
                                src={getDisplayUrl(parentGeneration.location)}
                                controls
                                loop
                                playsInline
                                className="w-full h-full object-contain max-h-[60vh]"
                                poster={parentGeneration.thumbnail_url ? getDisplayUrl(parentGeneration.thumbnail_url) : undefined}
                            />
                        </div>
                    </Card>
                </div>
            )}

            <div className="max-w-7xl mx-auto px-4 pt-5 pb-6">
                <Card className="p-6 sm:p-8 shadow-sm border">
                    <h2 className="text-2xl font-light tracking-tight mb-6">Segments</h2>
                    
                    {isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {[1, 2, 3, 4].map((i) => (
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
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {sortedChildren.map((child, index) => (
                                <SegmentCard
                                    key={child.id}
                                    child={child}
                                    index={index}
                                    projectId={projectId}
                                    onLightboxOpen={() => setLightboxIndex(index)}
                                    onUpdate={refetch}
                                />
                            ))}
                        </div>
                    )}
                </Card>
            </div>

            {/* Join Clips Section */}
            {sortedChildren.length >= 2 && sortedChildren.some(c => c.location) && (
                <div className="max-w-7xl mx-auto px-4 pb-4">
                    <Card className="p-6 sm:p-8 shadow-sm border">
                        <JoinClipsSettingsForm 
                            headerContent={
                                <div className="flex items-center justify-between">
                                    <h2 className="text-2xl font-light tracking-tight">Join Segments</h2>
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
                    </Card>
                </div>
            )}

            {/* Lightbox */}
            {lightboxIndex !== null && sortedChildren[lightboxIndex] && (
                <MediaLightbox
                    media={sortedChildren[lightboxIndex]}
                    onClose={handleLightboxClose}
                    onNext={handleLightboxNext}
                    onPrevious={handleLightboxPrev}
                    showNavigation={true}
                    hasNext={sortedChildren.length > 1}
                    hasPrevious={sortedChildren.length > 1}
                    shotId={undefined} // Context is specific to this view
                />
            )}
        </div>
    );
};

interface SegmentCardProps {
    child: GenerationRow;
    index: number;
    projectId: string | null;
    onLightboxOpen: () => void;
    onUpdate: () => void;
}

const SegmentCard: React.FC<SegmentCardProps> = ({ child, index, projectId, onLightboxOpen, onUpdate }) => {
    const { toast } = useToast();
    const [params, setParams] = useState<any>(child.params || {});
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

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
            <div className="relative aspect-video bg-black group">
                <VideoItem
                    video={child}
                    index={index}
                    originalIndex={index}
                    isFirstVideo={false}
                    shouldPreload="metadata"
                    isMobile={false}
                    projectId={projectId}
                    onLightboxOpen={onLightboxOpen}
                    onMobileTap={() => { }}
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
                    <CollapsibleContent className="space-y-3 pt-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Negative Prompt</Label>
                            <Textarea
                                value={params.negative_prompt || ''}
                                onChange={(e) => handleChange('negative_prompt', e.target.value)}
                                className="h-16 text-xs resize-none"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium">Enhance Prompt</Label>
                            <Switch
                                checked={params.enhancePrompt || false}
                                onCheckedChange={(checked) => handleChange('enhancePrompt', checked)}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Motion Amount (0-100)</Label>
                            <Input
                                type="number"
                                min="0"
                                max="100"
                                value={params.amountOfMotion || ''}
                                onChange={(e) => handleChange('amountOfMotion', parseInt(e.target.value) || 0)}
                                className="h-9 text-xs"
                            />
                        </div>
                    </CollapsibleContent>
                </Collapsible>

                {/* Regenerate Video Button */}
                <Button
                    size="sm"
                    onClick={() => {
                        // TODO: Implement regenerate video functionality
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
            </CardContent>
        </Card>
    );
};
