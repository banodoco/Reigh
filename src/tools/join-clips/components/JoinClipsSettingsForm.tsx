import React from 'react';
import { Label } from '@/shared/components/ui/label';
import { Slider } from '@/shared/components/ui/slider';
import { Input } from '@/shared/components/ui/input';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
import { Button } from '@/shared/components/ui/button';
import { Loader2, Check, Film } from 'lucide-react';
import { LoraManager } from '@/shared/components/LoraManager';
import type { LoraModel } from '@/shared/hooks/useLoraManager';
import { cn } from '@/shared/lib/utils';

export interface JoinClipsSettingsFormProps {
    // Settings state
    gapFrames: number;
    setGapFrames: (val: number) => void;
    contextFrames: number;
    setContextFrames: (val: number) => void;
    replaceMode: boolean;
    setReplaceMode: (val: boolean) => void;
    
    prompt: string;
    setPrompt: (val: string) => void;
    negativePrompt: string;
    setNegativePrompt: (val: string) => void;
    
    useIndividualPrompts?: boolean;
    setUseIndividualPrompts?: (val: boolean) => void;
    
    // LoRA props
    availableLoras: LoraModel[];
    projectId: string | null;
    loraPersistenceKey: string;
    
    // Actions
    onGenerate: () => void;
    isGenerating: boolean;
    generateSuccess: boolean;
    generateButtonText: string;
    isGenerateDisabled?: boolean;
    
    // Optional overrides
    className?: string;
}

export const JoinClipsSettingsForm: React.FC<JoinClipsSettingsFormProps> = ({
    gapFrames,
    setGapFrames,
    contextFrames,
    setContextFrames,
    replaceMode,
    setReplaceMode,
    prompt,
    setPrompt,
    negativePrompt,
    setNegativePrompt,
    useIndividualPrompts,
    setUseIndividualPrompts,
    availableLoras,
    projectId,
    loraPersistenceKey,
    onGenerate,
    isGenerating,
    generateSuccess,
    generateButtonText,
    isGenerateDisabled = false,
    className
}) => {
    
    // Handle context frames change with auto-adjustment of gap frames
    const handleContextFramesChange = (val: number) => {
        const newContextFrames = Math.max(1, val);
        setContextFrames(newContextFrames);
        
        // Adjust gap frames if they exceed the max allowed by context
        const maxGap = Math.max(1, 81 - (newContextFrames * 2));
        if (gapFrames > maxGap) {
            setGapFrames(maxGap);
        }
    };

    return (
        <div className={cn("space-y-8 max-w-5xl mx-auto", className)}>
            {/* Global Settings */}
            <div className="space-y-6">
                <h3 className="text-lg font-medium">Global Settings</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Gap Frames */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="join-gap-frames" className="text-sm">Gap Frames</Label>
                            <span className="text-sm font-medium">{gapFrames}</span>
                        </div>
                        <Slider
                            id="join-gap-frames"
                            min={1}
                            max={Math.max(1, 81 - (contextFrames * 2))}
                            step={1}
                            value={[Math.max(1, gapFrames)]}
                            onValueChange={(values) => setGapFrames(values[0])}
                        />
                        <p className="text-xs text-muted-foreground">Frames to generate in each transition</p>
                    </div>

                    {/* Context Frames */}
                    <div className="space-y-2">
                        <Label htmlFor="join-context-frames" className="text-sm">Context Frames</Label>
                        <Input
                            id="join-context-frames"
                            type="number"
                            min={1}
                            max={30}
                            value={contextFrames}
                            onChange={(e) => handleContextFramesChange(parseInt(e.target.value) || 1)}
                            className="text-center"
                        />
                        <p className="text-xs text-muted-foreground">Context frames from each clip</p>
                    </div>

                    {/* Replace Mode */}
                    <div className="flex flex-col justify-center space-y-2">
                        <div className="flex items-center justify-between gap-3 px-3 py-3 border rounded-lg bg-background/50">
                            <Label htmlFor="join-replace-mode" className="text-sm text-center flex-1 cursor-pointer">
                                Replace Frames
                            </Label>
                            <Switch
                                id="join-replace-mode"
                                checked={!replaceMode}
                                onCheckedChange={(checked) => setReplaceMode(!checked)}
                            />
                            <Label htmlFor="join-replace-mode" className="text-sm text-center flex-1 cursor-pointer">
                                Generate New
                            </Label>
                        </div>
                    </div>
                </div>
            </div>

            {/* Prompts & LoRA */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                    {/* Global Prompt */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="join-prompt">Global Prompt</Label>
                            {setUseIndividualPrompts && (
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="useIndividualPrompts" className="text-xs text-muted-foreground cursor-pointer">
                                        Set individually
                                    </Label>
                                    <Switch
                                        id="useIndividualPrompts"
                                        checked={useIndividualPrompts}
                                        onCheckedChange={setUseIndividualPrompts}
                                    />
                                </div>
                            )}
                        </div>
                        <Textarea
                            id="join-prompt"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={useIndividualPrompts 
                                ? "Appended to each individual transition prompt" 
                                : "Describe what you want for all transitions"
                            }
                            rows={3}
                            className="resize-none bg-background/50"
                        />
                        {useIndividualPrompts && (
                            <p className="text-xs text-muted-foreground">
                                💡 This will be inserted after each individual prompt
                            </p>
                        )}
                    </div>

                    {/* Negative Prompt */}
                    <div className="space-y-2">
                        <Label htmlFor="join-negative-prompt">Negative Prompt</Label>
                        <Textarea
                            id="join-negative-prompt"
                            value={negativePrompt}
                            onChange={(e) => setNegativePrompt(e.target.value)}
                            placeholder="What to avoid in all transitions (optional)"
                            rows={3}
                            className="resize-none bg-background/50"
                        />
                    </div>
                </div>

                {/* LoRA Manager */}
                <div className="space-y-2">
                    <LoraManager
                        availableLoras={availableLoras}
                        projectId={projectId || undefined}
                        persistenceScope="project"
                        enableProjectPersistence={true}
                        persistenceKey={loraPersistenceKey}
                        title="LoRA Models (Optional)"
                        addButtonText="Add or Manage LoRAs"
                    />
                </div>
            </div>

            {/* Generate Button */}
            <div className="flex justify-center pt-4">
                <Button
                    onClick={onGenerate}
                    disabled={isGenerateDisabled || isGenerating || generateSuccess}
                    className={`w-full max-w-md shadow-lg gap-2 ${
                        generateSuccess ? 'bg-green-500 hover:bg-green-600' : ''
                    }`}
                    size="lg"
                >
                    {isGenerating ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : generateSuccess ? (
                        <Check className="w-5 h-5" />
                    ) : (
                        <Film className="w-5 h-5" />
                    )}
                    <span className="font-medium text-base">
                        {generateSuccess ? 'Task Created' : generateButtonText}
                    </span>
                </Button>
            </div>
        </div>
    );
};

