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
import { ChevronLeft, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/shared/hooks/use-toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { Card, CardContent } from '@/shared/components/ui/card';

import MediaLightbox from '@/shared/components/MediaLightbox';

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

    const children = (data as any)?.items || [];

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

    return (
        <div className="w-full min-h-screen bg-background">
            {/* Header */}
            <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-4">
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
            <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-6">
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
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-20">
                            <p className="text-muted-foreground">No segments found for this generation.</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {sortedChildren.map((child, index) => (
                            <SegmentCard
                                key={child.id}
                                child={child}
                                index={index}
                                onLightboxOpen={() => setLightboxIndex(index)}
                                onUpdate={refetch}
                            />
                        ))}
                    </div>
                )}
            </div>

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
    onLightboxOpen: () => void;
    onUpdate: () => void;
}

const SegmentCard: React.FC<SegmentCardProps> = ({ child, index, onLightboxOpen, onUpdate }) => {
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
                <div className="absolute top-2 left-2 z-10 bg-background/90 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium border">
                    Segment {index + 1}
                </div>
                <VideoItem
                    video={child}
                    index={index}
                    originalIndex={index}
                    isFirstVideo={false}
                    shouldPreload="none"
                    isMobile={false}
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
                />
            </div>

            {/* Settings Form */}
            <CardContent className="p-4 space-y-3 flex-1 flex flex-col">
                <div className="space-y-2 flex-1">
                    <Label className="text-xs font-medium">Prompt</Label>
                    <Textarea
                        value={params.prompt || ''}
                        onChange={(e) => handleChange('prompt', e.target.value)}
                        className="h-20 text-sm resize-none"
                        placeholder="Describe this segment..."
                    />
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Frames</Label>
                        <Input
                            type="number"
                            value={params.num_frames || ''}
                            onChange={(e) => handleChange('num_frames', parseInt(e.target.value) || 0)}
                            className="h-9 text-sm"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Overlap</Label>
                        <Input
                            type="number"
                            value={params.frame_overlap || ''}
                            onChange={(e) => handleChange('frame_overlap', parseInt(e.target.value) || 0)}
                            className="h-9 text-sm"
                        />
                    </div>
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

                {/* Save Button */}
                {isDirty && (
                    <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-full gap-2"
                    >
                        {isSaving ? (
                            <>Saving...</>
                        ) : (
                            <>
                                <Save className="w-3 h-3" />
                                Save Changes
                            </>
                        )}
                    </Button>
                )}
            </CardContent>
        </Card>
    );
};
