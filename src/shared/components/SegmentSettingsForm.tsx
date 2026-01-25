/**
 * SegmentSettingsForm - Controlled Form Component
 *
 * A presentational form for editing segment settings.
 * Parent owns the data and handles persistence/task creation.
 *
 * Usage:
 * ```tsx
 * const { settings, updateSettings, saveSettings } = useSegmentSettings({...});
 *
 * <SegmentSettingsForm
 *   settings={settings}
 *   onChange={updateSettings}
 *   onSubmit={async () => {
 *     await saveSettings();
 *     await createTask();
 *   }}
 * />
 * ```
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';
import { Label } from '@/shared/components/ui/label';
import { Slider } from '@/shared/components/ui/slider';
import { Switch } from '@/shared/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { ChevronLeft, Loader2, RotateCcw, Save, Video } from 'lucide-react';
import { MotionPresetSelector } from '@/shared/components/MotionPresetSelector';
import { detectGenerationMode, BUILTIN_I2V_PRESET, BUILTIN_VACE_PRESET } from './segmentSettingsUtils';
import { ActiveLoRAsDisplay } from '@/shared/components/ActiveLoRAsDisplay';
import { LoraSelectorModal } from '@/shared/components/LoraSelectorModal';
import { usePublicLoras, type LoraModel } from '@/shared/hooks/useResources';
import { quantizeFrameCount, framesToSeconds } from '@/tools/travel-between-images/components/Timeline/utils/time-utils';
import type { PhaseConfig } from '@/tools/travel-between-images/settings';
import type { ActiveLora } from '@/shared/hooks/useLoraManager';
import type { SegmentSettings } from './segmentSettingsUtils';
import { stripModeFromPhaseConfig } from './segmentSettingsUtils';

// =============================================================================
// PROPS
// =============================================================================

export interface SegmentSettingsFormProps {
  /** Current settings (controlled) */
  settings: SegmentSettings;
  /** Callback when settings change */
  onChange: (updates: Partial<SegmentSettings>) => void;
  /** Callback when form is submitted */
  onSubmit: () => Promise<void>;

  // Display context (read-only)
  /** Segment index for display */
  segmentIndex?: number;
  /** Start image URL for preview */
  startImageUrl?: string;
  /** End image URL for preview */
  endImageUrl?: string;
  /** Model name for display */
  modelName?: string;
  /** Resolution for display */
  resolution?: string;

  // UI configuration
  /** Whether this is regenerating an existing segment */
  isRegeneration?: boolean;
  /** Whether submit is in progress */
  isSubmitting?: boolean;
  /** Custom button label */
  buttonLabel?: string;
  /** Show header */
  showHeader?: boolean;
  /** Header title */
  headerTitle?: string;
  /** Maximum frames allowed */
  maxFrames?: number;
  /** Query key prefix for presets */
  queryKeyPrefix?: string;
  /** Callback when frame count changes (for timeline sync) */
  onFrameCountChange?: (frames: number) => void;
  /** Callback to restore default settings */
  onRestoreDefaults?: () => void;
  /** Callback to save current settings as shot defaults */
  onSaveAsShotDefaults?: () => Promise<boolean>;
  /** Which fields have pair-level overrides (vs using shot defaults) */
  hasOverride?: {
    prompt: boolean;
    negativePrompt: boolean;
    motionMode: boolean;
    amountOfMotion: boolean;
    phaseConfig: boolean;
    loras: boolean;
    selectedPhasePresetId: boolean;
    structureMotionStrength: boolean;
    structureTreatment: boolean;
    structureUni3cEndPercent: boolean;
  };
  /** Shot-level defaults (shown as placeholder when no override) */
  shotDefaults?: {
    prompt: string;
    negativePrompt: string;
    motionMode: 'basic' | 'advanced';
    amountOfMotion: number;
    phaseConfig?: import('@/tools/travel-between-images/settings').PhaseConfig;
    loras: import('@/shared/types/segmentSettings').LoraConfig[];
    selectedPhasePresetId: string | null;
  };

  // Structure video context (for per-segment overrides)
  /** Structure video type for this segment (null = no structure video) */
  structureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth' | null;
  /** Shot-level structure video defaults (for display when no segment override) */
  structureVideoDefaults?: {
    motionStrength: number;
    treatment: 'adjust' | 'clip';
    uni3cEndPercent: number;
  };
  /** Structure video URL for preview */
  structureVideoUrl?: string;
  /** Frame range info for this segment's structure video usage */
  structureVideoFrameRange?: {
    segmentStart: number;
    segmentEnd: number;
    videoTotalFrames: number;
    videoFps: number;
  };
}

// =============================================================================
// STRUCTURE VIDEO PREVIEW (3 frames: start, middle, end)
// =============================================================================

interface StructureVideoPreviewProps {
  videoUrl: string;
  frameRange: {
    segmentStart: number;
    segmentEnd: number;
    videoTotalFrames: number;
    videoFps: number;
  };
}

const StructureVideoPreview: React.FC<StructureVideoPreviewProps> = ({ videoUrl, frameRange }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRefs = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)];
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentCapture, setCurrentCapture] = useState(0);

  // Calculate the 3 frame positions (start, middle, end of segment's portion)
  const framePositions = useMemo(() => {
    const { segmentStart, segmentEnd, videoTotalFrames, videoFps } = frameRange;
    const segmentFrames = segmentEnd - segmentStart;

    // Map segment frames to video frames (simple linear mapping)
    const videoFrameStart = Math.floor((segmentStart / (segmentEnd || 1)) * videoTotalFrames);
    const videoFrameEnd = Math.min(videoTotalFrames - 1, Math.floor((segmentEnd / (segmentEnd || 1)) * videoTotalFrames));
    const videoFrameMid = Math.floor((videoFrameStart + videoFrameEnd) / 2);

    return [
      { frame: videoFrameStart, time: videoFrameStart / videoFps, label: 'Start' },
      { frame: videoFrameMid, time: videoFrameMid / videoFps, label: 'Mid' },
      { frame: videoFrameEnd, time: videoFrameEnd / videoFps, label: 'End' },
    ];
  }, [frameRange]);

  // Capture frames sequentially after video loads
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isLoaded || currentCapture >= 3) return;

    const captureFrame = () => {
      const canvas = canvasRefs[currentCapture].current;
      if (!canvas || !video.videoWidth) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
      }

      // Move to next frame
      if (currentCapture < 2) {
        setCurrentCapture(prev => prev + 1);
        video.currentTime = framePositions[currentCapture + 1].time;
      }
    };

    video.onseeked = captureFrame;
    video.currentTime = framePositions[currentCapture].time;

    return () => {
      video.onseeked = null;
    };
  }, [isLoaded, currentCapture, framePositions]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-muted-foreground">
          Frames {framePositions[0].frame} - {framePositions[2].frame} of structure video
        </span>
        <span className="text-primary/70 italic">Make changes on the timeline</span>
      </div>
      <div className="flex gap-1">
        {/* Hidden video for seeking */}
        <video
          ref={videoRef}
          src={videoUrl}
          className="hidden"
          muted
          playsInline
          crossOrigin="anonymous"
          onLoadedMetadata={() => setIsLoaded(true)}
        />
        {/* 3 frame previews */}
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex-1 relative">
            <canvas
              ref={canvasRefs[i]}
              className="w-full aspect-video bg-muted/50 rounded object-cover"
            />
            <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center bg-black/60 text-white py-0.5 rounded-b">
              {framePositions[i].label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// =============================================================================
// COMPONENT
// =============================================================================

export const SegmentSettingsForm: React.FC<SegmentSettingsFormProps> = ({
  settings,
  onChange,
  onSubmit,
  segmentIndex = 0,
  startImageUrl,
  endImageUrl,
  modelName,
  resolution,
  isRegeneration = false,
  isSubmitting = false,
  buttonLabel,
  showHeader = true,
  headerTitle = 'Regenerate Segment',
  maxFrames = 81,
  queryKeyPrefix = 'segment-settings',
  onFrameCountChange,
  onRestoreDefaults,
  onSaveAsShotDefaults,
  hasOverride,
  shotDefaults,
  structureVideoType,
  structureVideoDefaults,
  structureVideoUrl,
  structureVideoFrameRange,
}) => {
  // UI state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);
  const [saveDefaultsSuccess, setSaveDefaultsSuccess] = useState(false);

  // Fetch available LoRAs
  const { data: availableLoras = [] } = usePublicLoras();

  // Detect generation mode from model name
  const generationMode = useMemo(() => {
    return detectGenerationMode(modelName);
  }, [modelName]);

  // Get built-in preset
  const builtinPreset = useMemo(() => {
    return generationMode === 'vace' ? BUILTIN_VACE_PRESET : BUILTIN_I2V_PRESET;
  }, [generationMode]);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleSubmit = useCallback(async () => {
    setSubmitSuccess(false);
    try {
      await onSubmit();
      setSubmitSuccess(true);
      // Reset after 2 seconds
      setTimeout(() => setSubmitSuccess(false), 2000);
    } catch (error) {
      console.error('[SegmentSettingsForm] Submit error:', error);
    }
  }, [onSubmit]);

  // Motion mode change
  const handleMotionModeChange = useCallback((mode: 'basic' | 'advanced') => {
    onChange({
      motionMode: mode,
      // Clear phase config when switching to basic (invariant)
      phaseConfig: mode === 'basic' ? undefined : (settings.phaseConfig ?? shotDefaults?.phaseConfig),
    });
  }, [onChange, settings.phaseConfig, shotDefaults?.phaseConfig]);

  // Phase config change
  const handlePhaseConfigChange = useCallback((config: PhaseConfig) => {
    onChange({
      phaseConfig: stripModeFromPhaseConfig(config),
    });
  }, [onChange]);

  // Phase preset select
  const handlePhasePresetSelect = useCallback((presetId: string, config: PhaseConfig) => {
    onChange({
      selectedPhasePresetId: presetId,
      phaseConfig: stripModeFromPhaseConfig(config),
    });
  }, [onChange]);

  // Phase preset remove
  const handlePhasePresetRemove = useCallback(() => {
    onChange({ selectedPhasePresetId: null });
  }, [onChange]);

  // Random seed toggle
  const handleRandomSeedChange = useCallback((value: boolean) => {
    onChange({ randomSeed: value });
  }, [onChange]);

  // LoRA handlers
  const handleAddLoraClick = useCallback(() => {
    setIsLoraModalOpen(true);
  }, []);

  const handleLoraSelect = useCallback((lora: LoraModel) => {
    const loraId = lora['Model ID'] || (lora as any).id;
    // Model Files is an array - get the URL from the first file
    const loraPath = lora['Model Files']?.[0]?.url || (lora as any)['Model File'];
    const loraName = lora.Name || (lora as any).name;

    if (!loraPath) return;
    const currentLoras = settings.loras ?? shotDefaults?.loras ?? [];
    if (currentLoras.some(l => l.id === loraId || l.path === loraPath)) return;

    onChange({
      loras: [...currentLoras, {
        id: loraId,
        name: loraName,
        path: loraPath,
        strength: 1.0,
      }],
    });
  }, [settings.loras, shotDefaults?.loras, onChange]);

  const handleRemoveLora = useCallback((loraId: string) => {
    const currentLoras = settings.loras ?? shotDefaults?.loras ?? [];
    onChange({
      loras: currentLoras.filter(l => l.id !== loraId && l.path !== loraId),
    });
  }, [settings.loras, shotDefaults?.loras, onChange]);

  const handleLoraStrengthChange = useCallback((loraId: string, strength: number) => {
    const currentLoras = settings.loras ?? shotDefaults?.loras ?? [];
    onChange({
      loras: currentLoras.map(l =>
        (l.id === loraId || l.path === loraId) ? { ...l, strength } : l
      ),
    });
  }, [settings.loras, shotDefaults?.loras, onChange]);

  // Frame count change
  const handleFrameCountChange = useCallback((value: number) => {
    const quantized = quantizeFrameCount(value, 9);
    onChange({ numFrames: quantized });
    onFrameCountChange?.(quantized);
  }, [onChange, onFrameCountChange]);

  // Save as shot defaults
  const handleSaveAsShotDefaults = useCallback(async () => {
    if (!onSaveAsShotDefaults) return;
    setIsSavingDefaults(true);
    setSaveDefaultsSuccess(false);
    try {
      const success = await onSaveAsShotDefaults();
      if (success) {
        setSaveDefaultsSuccess(true);
        setTimeout(() => setSaveDefaultsSuccess(false), 2000);
      }
    } finally {
      setIsSavingDefaults(false);
    }
  }, [onSaveAsShotDefaults]);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="space-y-4">
      {/* Header */}
      {showHeader && (
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-primary" />
            {headerTitle}
          </h3>
        </div>
      )}

      {/* Input Images with Frames Slider */}
      {(startImageUrl || endImageUrl) && (
        <div className="@container">
          <div className="grid grid-cols-2 gap-2 @[280px]:grid-cols-3">
            {/* Start Image */}
            <div className="relative aspect-video">
              {startImageUrl && (
                <div className="w-full h-full relative bg-muted/30 rounded-lg overflow-hidden border border-border/50">
                  <img
                    src={startImageUrl}
                    alt="Start frame"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0.5 left-0.5 text-[10px] bg-black/60 text-white px-1 rounded">Start</span>
                </div>
              )}
            </div>

            {/* Frames Slider */}
            <div className="order-last col-span-2 @[280px]:order-none @[280px]:col-span-1 flex items-center gap-2">
              <div className="flex-1 flex flex-col justify-center space-y-1">
                <div className="flex flex-col items-center text-center">
                  <Label className="text-xs font-medium">Frames</Label>
                  <span className="text-xs text-muted-foreground">
                    {settings.numFrames} ({framesToSeconds(settings.numFrames)})
                  </span>
                </div>
                <Slider
                  value={[quantizeFrameCount(settings.numFrames, 9)]}
                  onValueChange={([value]) => handleFrameCountChange(value)}
                  min={9}
                  max={maxFrames}
                  step={4}
                  className="w-full"
                />
              </div>
            </div>

            {/* End Image */}
            <div className="relative aspect-video">
              {endImageUrl && (
                <div className="w-full h-full relative bg-muted/30 rounded-lg overflow-hidden border border-border/50">
                  <img
                    src={endImageUrl}
                    alt="End frame"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0.5 right-0.5 text-[10px] bg-black/60 text-white px-1 rounded">End</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Prompt */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Prompt:</Label>
        <Textarea
          value={settings.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
          className="h-20 text-sm resize-none"
          placeholder={
            // Show default placeholder when prompt is empty
            !settings.prompt && shotDefaults?.prompt
              ? `[default] ${shotDefaults.prompt}`
              : 'Describe this segment...'
          }
          clearable
          onClear={() => onChange({ prompt: '' })}
          voiceInput
          voiceContext="This is a prompt for a video segment. Describe the motion, action, or visual content you want in this part of the video."
          onVoiceResult={(result) => {
            onChange({ prompt: result.prompt || result.transcription });
          }}
        />
      </div>

      {/* Advanced Settings */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`w-full justify-between h-9 text-xs font-medium ${
              showAdvanced
                ? 'bg-muted text-foreground hover:bg-muted rounded-b-none'
                : 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary'
            }`}
          >
            <span>Advanced Settings</span>
            <ChevronLeft className={`w-3 h-3 transition-transform ${showAdvanced ? '-rotate-90' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="-mx-4">
          <div className="space-y-3 p-3 bg-muted/30 border-y border-border/50">
            {/* Make Primary Variant Toggle */}
            {isRegeneration && (
              <div className="flex items-center justify-between">
                <Label htmlFor="make-primary" className="text-sm cursor-pointer">
                  Make primary variant
                </Label>
                <Switch
                  id="make-primary"
                  checked={settings.makePrimaryVariant}
                  onCheckedChange={(value) => onChange({ makePrimaryVariant: value })}
                />
              </div>
            )}

            {/* Negative Prompt */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Negative Prompt:</Label>
              <Textarea
                value={settings.negativePrompt}
                onChange={(e) => onChange({ negativePrompt: e.target.value })}
                className="h-16 text-xs resize-none"
                placeholder={
                  // Show default placeholder when negative prompt is empty
                  !settings.negativePrompt && shotDefaults?.negativePrompt
                    ? `[default] ${shotDefaults.negativePrompt}`
                    : 'Things to avoid...'
                }
                clearable
                onClear={() => onChange({ negativePrompt: '' })}
                voiceInput
                voiceContext="This is a negative prompt - things to AVOID in video generation. List unwanted qualities as a comma-separated list."
                onVoiceResult={(result) => {
                  onChange({ negativePrompt: result.prompt || result.transcription });
                }}
              />
            </div>

            {/* Model & Resolution Info */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex flex-col">
                <span className="text-muted-foreground">Model</span>
                <span className="font-medium truncate" title={modelName || 'Default'}>
                  {(modelName || 'wan_2_2_i2v').replace('wan_2_2_', '').replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground">Resolution</span>
                <span className="font-medium">
                  {resolution || 'Auto'}
                </span>
              </div>
            </div>

            {/* Seed Info */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Seed</span>
              <span className="font-mono font-medium">
                {settings.randomSeed ? 'Random' : (settings.seed || 'Random')}
              </span>
            </div>

            {/* Motion Controls */}
            <MotionPresetSelector
              builtinPreset={builtinPreset}
              featuredPresetIds={[]}
              generationTypeMode={generationMode}
              selectedPhasePresetId={settings.selectedPhasePresetId ?? shotDefaults?.selectedPhasePresetId ?? null}
              phaseConfig={settings.phaseConfig ?? shotDefaults?.phaseConfig ?? builtinPreset.metadata.phaseConfig}
              motionMode={settings.motionMode ?? shotDefaults?.motionMode ?? 'basic'}
              onPresetSelect={handlePhasePresetSelect}
              onPresetRemove={handlePhasePresetRemove}
              onModeChange={handleMotionModeChange}
              onPhaseConfigChange={handlePhaseConfigChange}
              availableLoras={availableLoras}
              randomSeed={settings.randomSeed}
              onRandomSeedChange={handleRandomSeedChange}
              queryKeyPrefix={queryKeyPrefix}
              renderBasicModeContent={() => (
                <div className="space-y-3">
                  <ActiveLoRAsDisplay
                    selectedLoras={settings.loras ?? shotDefaults?.loras ?? []}
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

            {/* Structure Video Overrides - only shown when segment has structure video */}
            {structureVideoType && (
              <div className="space-y-3 pt-3 border-t border-border/50">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Video className="w-3.5 h-3.5" />
                  <span>Structure Video Overrides</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground/80">
                    {structureVideoType === 'uni3c' ? 'Uni3C' : structureVideoType === 'flow' ? 'Optical Flow' : structureVideoType === 'canny' ? 'Canny' : structureVideoType === 'depth' ? 'Depth' : structureVideoType}
                  </span>
                </div>

                {/* 3-Frame Preview */}
                {structureVideoUrl && structureVideoFrameRange && (
                  <StructureVideoPreview
                    videoUrl={structureVideoUrl}
                    frameRange={structureVideoFrameRange}
                  />
                )}

                {/* Motion Strength */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Strength:</Label>
                    <span className="text-xs font-medium">
                      {(settings.structureMotionStrength ?? structureVideoDefaults?.motionStrength ?? 1.2).toFixed(1)}x
                      {settings.structureMotionStrength === undefined && (
                        <span className="text-muted-foreground/60 ml-1">(default)</span>
                      )}
                    </span>
                  </div>
                  <Slider
                    value={[settings.structureMotionStrength ?? structureVideoDefaults?.motionStrength ?? 1.2]}
                    onValueChange={([value]) => onChange({ structureMotionStrength: value })}
                    min={0}
                    max={2}
                    step={0.1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>0x</span>
                    <span>1x</span>
                    <span>2x</span>
                  </div>
                </div>

                {/* Uni3C End Percent - only shown when structure type is uni3c */}
                {structureVideoType === 'uni3c' && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">End Percent:</Label>
                      <span className="text-xs font-medium">
                        {((settings.structureUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent ?? 0.1) * 100).toFixed(0)}%
                        {settings.structureUni3cEndPercent === undefined && (
                          <span className="text-muted-foreground/60 ml-1">(default)</span>
                        )}
                      </span>
                    </div>
                    <Slider
                      value={[settings.structureUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent ?? 0.1]}
                      onValueChange={([value]) => onChange({ structureUni3cEndPercent: value })}
                      min={0}
                      max={1}
                      step={0.05}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>0%</span>
                      <span>50%</span>
                      <span>100%</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* LoRA Selector Modal */}
          <LoraSelectorModal
            isOpen={isLoraModalOpen}
            onClose={() => setIsLoraModalOpen(false)}
            loras={availableLoras}
            onAddLora={handleLoraSelect}
            onRemoveLora={handleRemoveLora}
            onUpdateLoraStrength={handleLoraStrengthChange}
            selectedLoras={(settings.loras ?? shotDefaults?.loras ?? []).map(lora => {
              const fullLora = availableLoras.find(l => l.id === lora.id || l.path === lora.path);
              return {
                ...fullLora,
                "Model ID": lora.id,
                Name: lora.name,
                strength: lora.strength,
              } as LoraModel & { strength: number };
            })}
            lora_type="Wan I2V"
          />
        </CollapsibleContent>
      </Collapsible>

      {/* Submit Button */}
      <Button
        size="sm"
        onClick={handleSubmit}
        disabled={isSubmitting || !startImageUrl || !endImageUrl}
        className="w-full gap-2"
        variant={submitSuccess ? "outline" : "default"}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Generating...</span>
          </>
        ) : submitSuccess ? (
          <>
            <span className="text-green-600">✓</span>
            <span>Task Created</span>
          </>
        ) : (
          <span>{buttonLabel || (isRegeneration ? 'Regenerate Segment' : 'Generate Segment')}</span>
        )}
      </Button>

      {/* Restore Defaults / Save as Defaults Buttons */}
      {(onRestoreDefaults || onSaveAsShotDefaults) && (
        <div className="flex gap-2">
          {onRestoreDefaults && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRestoreDefaults}
              disabled={isSubmitting || isSavingDefaults}
              className="flex-1 h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Restore Defaults
            </Button>
          )}
          {onSaveAsShotDefaults && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSaveAsShotDefaults}
              disabled={isSubmitting || isSavingDefaults}
              className="flex-1 h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
            >
              {isSavingDefaults ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : saveDefaultsSuccess ? (
                <span className="text-green-600">✓</span>
              ) : (
                <Save className="w-3 h-3" />
              )}
              {saveDefaultsSuccess ? 'Saved!' : 'Set as Shot Defaults'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default SegmentSettingsForm;
