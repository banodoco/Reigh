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
import { ChevronLeft, Loader2, RotateCcw, Save, Video, X, Images } from 'lucide-react';
import { MotionPresetSelector } from '@/shared/components/MotionPresetSelector';
import { detectGenerationMode, BUILTIN_I2V_PRESET, BUILTIN_VACE_PRESET } from './segmentSettingsUtils';
import { ActiveLoRAsDisplay } from '@/shared/components/ActiveLoRAsDisplay';
import { LoraSelectorModal } from '@/shared/components/LoraSelectorModal';
import { DefaultableTextarea } from '@/shared/components/DefaultableTextarea';
import { DatasetBrowserModal } from '@/shared/components/DatasetBrowserModal';
import { SegmentedControl, SegmentedControlItem } from '@/shared/components/ui/segmented-control';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { usePublicLoras, useCreateResource, type LoraModel, type Resource, type StructureVideoMetadata } from '@/shared/hooks/useResources';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { uploadVideoToStorage, extractVideoMetadata } from '@/shared/lib/videoUploader';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { quantizeFrameCount, framesToSeconds } from '@/tools/travel-between-images/components/Timeline/utils/time-utils';
import type { PhaseConfig } from '@/tools/travel-between-images/settings';
import type { ActiveLora } from '@/shared/hooks/useLoraManager';
import type { SegmentSettings } from './segmentSettingsUtils';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';
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
  /** Callback to save a single field's current value as shot default */
  onSaveFieldAsDefault?: (field: keyof SegmentSettings, value: any) => Promise<boolean>;
  /** Which fields have pair-level overrides (vs using shot defaults) */
  hasOverride?: {
    prompt: boolean;
    negativePrompt: boolean;
    textBeforePrompts: boolean;
    textAfterPrompts: boolean;
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
    textBeforePrompts: string;
    textAfterPrompts: string;
    motionMode: 'basic' | 'advanced';
    amountOfMotion: number;
    phaseConfig?: import('@/tools/travel-between-images/settings').PhaseConfig;
    loras: import('@/shared/types/segmentSettings').LoraConfig[];
    selectedPhasePresetId: string | null;
  };
  /** Whether user has made local edits (used for immediate UI updates before DB save) */
  isDirty?: boolean;

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

  // Enhanced prompt (AI-generated)
  /** AI-generated enhanced prompt (stored separately from user settings) */
  enhancedPrompt?: string;
  /** Callback to clear the enhanced prompt */
  onClearEnhancedPrompt?: () => Promise<boolean>;
  /** Whether to enhance prompt during generation (controlled by parent) */
  enhancePromptEnabled?: boolean;
  /** Callback when enhance prompt toggle changes */
  onEnhancePromptChange?: (enabled: boolean) => void;

  // Layout customization
  /**
   * Amount (in Tailwind spacing units) to extend Advanced Settings to container edges.
   * Use 4 for p-4 containers (default), 6 for p-6 containers.
   */
  edgeExtendAmount?: 4 | 6;

  // Per-segment structure video management (Timeline Mode only)
  /** Whether in timeline mode (shows structure video upload) vs batch mode (preview only) */
  isTimelineMode?: boolean;
  /** Callback to add a structure video for this segment */
  onAddSegmentStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  /** Callback to update this segment's structure video */
  onUpdateSegmentStructureVideo?: (updates: Partial<StructureVideoConfigWithMetadata>) => void;
  /** Callback to remove this segment's structure video */
  onRemoveSegmentStructureVideo?: () => void;
}

// =============================================================================
// DEFAULT BADGE / FIELD ACTION BUTTONS
// =============================================================================

/**
 * Shows either a "Default" badge (when using shot defaults) or two action buttons
 * (when overridden): "Reset" to clear override, "Set as Default" to save as new default.
 */
const FieldDefaultControls: React.FC<{
  isUsingDefault: boolean;
  onUseDefault: () => void;
  onSetAsDefault?: () => void;
  isSaving?: boolean;
  className?: string;
}> = ({ isUsingDefault, onUseDefault, onSetAsDefault, isSaving, className = '' }) => {
  if (isUsingDefault) {
    return (
      <span className={`text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded ${className}`}>
        Default
      </span>
    );
  }
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={onUseDefault}
        disabled={isSaving}
        className="text-[10px] bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded flex items-center gap-0.5 transition-colors disabled:opacity-50"
        title="Use the shot default value"
      >
        <RotateCcw className="w-2.5 h-2.5" />
        Use Default
      </button>
      {onSetAsDefault && (
        <button
          type="button"
          onClick={onSetAsDefault}
          disabled={isSaving}
          className="text-[10px] bg-muted hover:bg-primary/15 text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded flex items-center gap-0.5 transition-colors disabled:opacity-50"
          title="Set this value as the shot default"
        >
          {isSaving ? (
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
          ) : (
            <Save className="w-2.5 h-2.5" />
          )}
          Set as Default
        </button>
      )}
    </div>
  );
};

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
  /** Called when all frames have been captured and displayed */
  onLoadComplete?: () => void;
}

/**
 * Extracts and displays 3 frames (start, mid, end) from a structure video.
 *
 * Uses a single async effect with proper cancellation to:
 * 1. Load video metadata
 * 2. Seek to each frame position
 * 3. Capture frame to canvas
 * 4. Notify parent when complete
 */
const StructureVideoPreview: React.FC<StructureVideoPreviewProps> = ({
  videoUrl,
  frameRange,
  onLoadComplete,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Stable refs array - doesn't change between renders
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([null, null, null]);
  const [capturedCount, setCapturedCount] = useState(0);
  // Track which URL the captures are for - prevents showing stale frames when URL changes
  const [capturedForUrl, setCapturedForUrl] = useState<string | null>(null);

  // Calculate the 3 frame positions (start, middle, end of segment's portion)
  const framePositions = useMemo(() => {
    const { segmentStart, segmentEnd, videoTotalFrames, videoFps } = frameRange;

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

  // Single effect to handle entire capture flow with proper cancellation
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    setCapturedCount(0);
    setCapturedForUrl(null); // Clear immediately so stale frames don't show

    const captureAllFrames = async () => {
      // Wait for video metadata to load
      if (video.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          const onLoad = () => { video.removeEventListener('error', onError); resolve(); };
          const onError = () => { video.removeEventListener('loadedmetadata', onLoad); reject(new Error('Video failed to load')); };
          video.addEventListener('loadedmetadata', onLoad, { once: true });
          video.addEventListener('error', onError, { once: true });
        });
      }

      if (cancelled) return;

      // Capture each frame sequentially
      for (let i = 0; i < 3; i++) {
        if (cancelled) return;

        // Seek to frame position
        video.currentTime = framePositions[i].time;
        await new Promise<void>(resolve => {
          video.addEventListener('seeked', () => resolve(), { once: true });
        });

        if (cancelled) return;

        // Capture to canvas
        const canvas = canvasRefs.current[i];
        if (canvas && video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0);
          }
        }

        // Mark which URL these captures are for (on first frame)
        if (i === 0) {
          setCapturedForUrl(videoUrl);
        }
        // Update count to reveal this frame
        setCapturedCount(i + 1);
      }

      // All frames captured - notify parent
      if (!cancelled) {
        onLoadComplete?.();
      }
    };

    captureAllFrames().catch(err => {
      if (!cancelled) {
        console.error('[StructureVideoPreview] Failed to capture frames:', err);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [videoUrl, framePositions, onLoadComplete]);

  // Only show as loaded if captures are for current URL
  const isFullyLoaded = capturedCount >= 3 && capturedForUrl === videoUrl;
  // Helper to check if a specific frame should be visible
  const isFrameCaptured = (i: number) => capturedForUrl === videoUrl && capturedCount > i;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[10px]">
        {isFullyLoaded ? (
          <>
            <span className="text-muted-foreground">
              Frames {framePositions[0].frame} - {framePositions[2].frame} of structure video
            </span>
            <span className="text-primary/70 italic">Make changes on the timeline</span>
          </>
        ) : (
          <>
            <Loader2 className="w-3 h-3 animate-spin text-primary" />
            <span className="text-muted-foreground">Loading video frames...</span>
          </>
        )}
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
        />
        {/* 3 frame previews */}
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex-1 relative">
            {/* Canvas always rendered (stable ref for drawing) - invisible until captured for current URL */}
            <canvas
              ref={el => { canvasRefs.current[i] = el; }}
              className={`w-full aspect-video rounded object-cover ${!isFrameCaptured(i) ? 'invisible' : ''}`}
            />
            {/* Skeleton shown until frame is captured for current URL */}
            {!isFrameCaptured(i) && (
              <div className="absolute inset-0 bg-muted rounded animate-pulse" />
            )}
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
  onSaveFieldAsDefault,
  hasOverride,
  shotDefaults,
  isDirty,
  structureVideoType,
  structureVideoDefaults,
  structureVideoUrl,
  structureVideoFrameRange,
  enhancedPrompt,
  onClearEnhancedPrompt,
  enhancePromptEnabled,
  onEnhancePromptChange,
  edgeExtendAmount = 4,
  // Per-segment structure video management
  isTimelineMode,
  onAddSegmentStructureVideo,
  onUpdateSegmentStructureVideo,
  onRemoveSegmentStructureVideo,
}) => {
  // UI state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);
  const [saveDefaultsSuccess, setSaveDefaultsSuccess] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null); // Track which field is being saved
  const [showVideoBrowser, setShowVideoBrowser] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pendingVideoUrl, setPendingVideoUrl] = useState<string | null>(null); // Track pending video until frames are captured
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  // Callback when StructureVideoPreview finishes capturing all frames
  const handleVideoPreviewLoaded = useCallback(() => {
    setPendingVideoUrl(null);
  }, []);

  // Show loading state when uploading OR waiting for frames to be captured
  const isVideoLoading = isUploadingVideo || !!pendingVideoUrl;

  // Fetch available LoRAs
  const { data: availableLoras = [] } = usePublicLoras();

  // Resource creation hook for video upload
  const createResource = useCreateResource();

  // Privacy defaults for new resources
  const { value: privacyDefaults } = useUserUIState('privacyDefaults', { resourcesPublic: true, generationsPublic: false });

  // Detect generation mode from model name
  const generationMode = useMemo(() => {
    return detectGenerationMode(modelName);
  }, [modelName]);

  // Get built-in preset
  const builtinPreset = useMemo(() => {
    return generationMode === 'vace' ? BUILTIN_VACE_PRESET : BUILTIN_I2V_PRESET;
  }, [generationMode]);

  // Compute effective loras: use segment override if explicitly set, otherwise shot defaults
  // settings.loras values:
  // - undefined: no override set (use shot defaults)
  // - []: user explicitly cleared all loras (show empty)
  // - [...]: user has specific loras (show them)
  // This handles both local edits and DB overrides correctly
  const effectiveLoras = useMemo(() => {
    // If loras have been explicitly set (locally or from DB), use that value
    // This catches both "user added loras" and "user removed all loras"
    if (settings.loras !== undefined) {
      return settings.loras;
    }
    // No explicit loras set - fall back to shot defaults
    return shotDefaults?.loras ?? [];
  }, [settings.loras, shotDefaults?.loras]);

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
    const currentLoras = effectiveLoras;
    if (currentLoras.some(l => l.id === loraId || l.path === loraPath)) return;

    onChange({
      loras: [...currentLoras, {
        id: loraId,
        name: loraName,
        path: loraPath,
        strength: 1.0,
      }],
    });
  }, [effectiveLoras, onChange]);

  const handleRemoveLora = useCallback((loraId: string) => {
    const currentLoras = effectiveLoras;
    onChange({
      loras: currentLoras.filter(l => l.id !== loraId && l.path !== loraId),
    });
  }, [effectiveLoras, onChange]);

  const handleLoraStrengthChange = useCallback((loraId: string, strength: number) => {
    const currentLoras = effectiveLoras;
    onChange({
      loras: currentLoras.map(l =>
        (l.id === loraId || l.path === loraId) ? { ...l, strength } : l
      ),
    });
  }, [effectiveLoras, onChange]);

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

  // Save a single field as shot default, then clear the segment override so UI shows "Default"
  const handleSaveFieldAsDefault = useCallback(async (field: keyof SegmentSettings, value: any) => {
    if (!onSaveFieldAsDefault) return;
    setSavingField(field);
    try {
      const success = await onSaveFieldAsDefault(field, value);
      if (success) {
        // Clear the segment override so this field now uses the (updated) shot default
        // This makes the UI immediately show "Default" badge
        onChange({ [field]: undefined } as Partial<SegmentSettings>);
      }
    } finally {
      setSavingField(null);
    }
  }, [onSaveFieldAsDefault, onChange]);

  // ==========================================================================
  // STRUCTURE VIDEO UPLOAD HANDLERS (Timeline Mode Only)
  // ==========================================================================

  // Handle selecting a video from the browser
  const handleVideoResourceSelect = useCallback((resource: Resource) => {
    if (!onAddSegmentStructureVideo || !structureVideoFrameRange) return;

    const metadata = resource.metadata as StructureVideoMetadata;
    console.log('[SegmentSettingsForm] Video selected from browser:', {
      resourceId: resource.id,
      videoUrl: metadata.videoUrl,
    });

    const newVideo: StructureVideoConfigWithMetadata = {
      path: metadata.videoUrl,
      start_frame: structureVideoFrameRange.segmentStart,
      end_frame: structureVideoFrameRange.segmentEnd,
      treatment: settings.structureTreatment ?? structureVideoDefaults?.treatment ?? 'adjust',
      motion_strength: settings.structureMotionStrength ?? structureVideoDefaults?.motionStrength ?? 1.2,
      structure_type: 'uni3c', // Default to uni3c for new uploads
      uni3c_end_percent: settings.structureUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent ?? 0.1,
      metadata: metadata.videoMetadata ?? null,
      resource_id: resource.id,
    };

    // Set pending state to show loading until props update
    setPendingVideoUrl(metadata.videoUrl);
    onAddSegmentStructureVideo(newVideo);
    setShowVideoBrowser(false);
  }, [onAddSegmentStructureVideo, structureVideoFrameRange, settings, structureVideoDefaults]);

  // Process uploaded video file
  const processVideoFile = useCallback(async (file: File) => {
    if (!onAddSegmentStructureVideo || !structureVideoFrameRange) return;

    // Validate file type
    const validTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (!validTypes.includes(file.type)) {
      toast.error('Invalid file type. Please upload an MP4, WebM, or MOV file.');
      return;
    }

    // Validate file size (max 200MB)
    const maxSizeMB = 200;
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      toast.error(`File too large. Maximum size is ${maxSizeMB}MB`);
      return;
    }

    try {
      setIsUploadingVideo(true);
      setUploadProgress(0);

      // Extract metadata
      const metadata = await extractVideoMetadata(file);
      setUploadProgress(25);

      // Upload to storage (we need projectId from context - for now use a placeholder path)
      // Note: In a real implementation, we'd need projectId and shotId passed down
      const { data: { user } } = await supabase.auth.getUser();
      const uploadPath = `structure-videos/${user?.id || 'anonymous'}/${Date.now()}-${file.name}`;
      const videoUrl = await uploadVideoToStorage(
        file,
        '', // projectId - will use default bucket path
        '', // shotId
        (progress) => setUploadProgress(25 + (progress * 0.65))
      );
      setUploadProgress(90);

      // Create resource for reuse
      const now = new Date().toISOString();
      const resourceMetadata: StructureVideoMetadata = {
        name: `Guidance Video ${new Date().toLocaleString()}`,
        videoUrl: videoUrl,
        thumbnailUrl: null,
        videoMetadata: metadata,
        created_by: {
          is_you: true,
          username: user?.email || 'user',
        },
        is_public: privacyDefaults.resourcesPublic,
        createdAt: now,
      };

      const resource = await createResource.mutateAsync({
        type: 'structure-video',
        metadata: resourceMetadata,
      });
      setUploadProgress(100);

      // Create the structure video config
      const newVideo: StructureVideoConfigWithMetadata = {
        path: videoUrl,
        start_frame: structureVideoFrameRange.segmentStart,
        end_frame: structureVideoFrameRange.segmentEnd,
        treatment: settings.structureTreatment ?? structureVideoDefaults?.treatment ?? 'adjust',
        motion_strength: settings.structureMotionStrength ?? structureVideoDefaults?.motionStrength ?? 1.2,
        structure_type: 'uni3c',
        uni3c_end_percent: settings.structureUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent ?? 0.1,
        metadata: metadata,
        resource_id: resource.id,
      };

      // Set pending state to show loading until props update
      setPendingVideoUrl(videoUrl);
      onAddSegmentStructureVideo(newVideo);
    } catch (error) {
      console.error('[SegmentSettingsForm] Upload failed:', error);
      toast.error(`Failed to upload video: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploadingVideo(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [onAddSegmentStructureVideo, structureVideoFrameRange, settings, structureVideoDefaults, createResource, privacyDefaults]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processVideoFile(file);
    }
  }, [processVideoFile]);

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
      {(() => {
        // Priority: settings.prompt > enhancedPrompt > shotDefaults.prompt
        // Key: check for undefined specifically, not falsiness
        // - undefined = no override, fall through to enhanced/default
        // - '' = user explicitly cleared, show empty (no badge)
        // - 'text' = user typed something, show it (no badge)
        const userHasSetPrompt = settings.prompt !== undefined;
        const hasEnhancedPrompt = !!enhancedPrompt?.trim();
        const hasDefaultPrompt = shotDefaults?.prompt !== undefined;

        // Determine what to display and which badge
        let promptDisplayValue: string;
        let badgeType: 'enhanced' | 'default' | null = null;

        if (userHasSetPrompt) {
          // User has explicitly set a prompt (even if empty)
          promptDisplayValue = settings.prompt;
          badgeType = null;
        } else if (hasEnhancedPrompt) {
          // AI-enhanced prompt (user hasn't overridden it)
          promptDisplayValue = enhancedPrompt!;
          badgeType = 'enhanced';
        } else if (hasDefaultPrompt) {
          // Fall back to shot defaults
          promptDisplayValue = shotDefaults!.prompt;
          badgeType = 'default';
        } else {
          promptDisplayValue = '';
          badgeType = null;
        }

        return (
          <div className="space-y-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium">Prompt:</Label>
                {badgeType === 'enhanced' && (
                  <span className="text-[10px] bg-green-500/15 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded">
                    Enhanced
                  </span>
                )}
                {badgeType === 'default' && (
                  <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded">
                    Default
                  </span>
                )}
                {badgeType === null && userHasSetPrompt && (
                  <FieldDefaultControls
                    isUsingDefault={false}
                    onUseDefault={() => onChange({ prompt: undefined })}
                    onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault('prompt', settings.prompt ?? '') : undefined}
                    isSaving={savingField === 'prompt'}
                  />
                )}
              </div>
              <Textarea
                value={promptDisplayValue}
                onChange={(e) => onChange({ prompt: e.target.value })}
                className="h-20 text-sm resize-none"
                placeholder="Describe this segment..."
                clearable
                onClear={() => {
                  onChange({ prompt: '' });
                  // Also clear enhanced prompt when clearing the field
                  onClearEnhancedPrompt?.();
                }}
                voiceInput
                voiceContext="This is a prompt for a video segment. Describe the motion, action, or visual content you want in this part of the video."
                onVoiceResult={(result) => {
                  onChange({ prompt: result.prompt || result.transcription });
                }}
              />
            </div>

            {/* Enhance Prompt Toggle & Make Primary Variant */}
            <div className="flex gap-2">
              {onEnhancePromptChange && (
                <div className="flex items-center space-x-2 p-2 bg-muted/30 rounded-lg border flex-1">
                  <Switch
                    id="enhance-prompt-segment"
                    checked={enhancePromptEnabled ?? !hasEnhancedPrompt}
                    onCheckedChange={onEnhancePromptChange}
                  />
                  <Label htmlFor="enhance-prompt-segment" className="text-sm font-medium cursor-pointer flex-1">
                    Enhance Prompt
                  </Label>
                </div>
              )}
              <div className="flex items-center space-x-2 p-2 bg-muted/30 rounded-lg border flex-1">
                <Switch
                  id="make-primary-segment"
                  checked={isRegeneration ? settings.makePrimaryVariant : true}
                  onCheckedChange={isRegeneration ? (value) => onChange({ makePrimaryVariant: value }) : undefined}
                  disabled={!isRegeneration}
                />
                <Label htmlFor="make-primary-segment" className="text-sm font-medium cursor-pointer flex-1">
                  Make Primary
                </Label>
              </div>
            </div>
          </div>
        );
      })()}

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
        <CollapsibleContent className={edgeExtendAmount === 6 ? '-mx-6' : '-mx-4'}>
          <div className={`space-y-3 bg-muted/30 border-y border-border/50 ${edgeExtendAmount === 6 ? 'px-6 py-3' : 'p-3'}`}>
            {/* Before/After Each Prompt - only show if shot has defaults */}
            {(shotDefaults?.textBeforePrompts !== undefined || shotDefaults?.textAfterPrompts !== undefined) && (
              <div className="grid grid-cols-2 gap-2">
                <DefaultableTextarea
                  label="Before:"
                  value={settings.textBeforePrompts}
                  defaultValue={shotDefaults?.textBeforePrompts}
                  hasDbOverride={hasOverride?.textBeforePrompts}
                  onChange={(value) => onChange({ textBeforePrompts: value })}
                  onClear={() => onChange({ textBeforePrompts: '' })}
                  onUseDefault={() => onChange({ textBeforePrompts: undefined })}
                  onSetAsDefault={onSaveFieldAsDefault ? (displayValue) => handleSaveFieldAsDefault('textBeforePrompts', displayValue) : undefined}
                  isSavingDefault={savingField === 'textBeforePrompts'}
                  className="h-14 text-xs resize-none"
                  placeholder="Text to prepend..."
                />
                <DefaultableTextarea
                  label="After:"
                  value={settings.textAfterPrompts}
                  defaultValue={shotDefaults?.textAfterPrompts}
                  hasDbOverride={hasOverride?.textAfterPrompts}
                  onChange={(value) => onChange({ textAfterPrompts: value })}
                  onClear={() => onChange({ textAfterPrompts: '' })}
                  onUseDefault={() => onChange({ textAfterPrompts: undefined })}
                  onSetAsDefault={onSaveFieldAsDefault ? (displayValue) => handleSaveFieldAsDefault('textAfterPrompts', displayValue) : undefined}
                  isSavingDefault={savingField === 'textAfterPrompts'}
                  className="h-14 text-xs resize-none"
                  placeholder="Text to append..."
                />
              </div>
            )}

            {/* Negative Prompt */}
            <DefaultableTextarea
              label="Negative Prompt:"
              value={settings.negativePrompt}
              defaultValue={shotDefaults?.negativePrompt}
              hasDbOverride={hasOverride?.negativePrompt}
              onChange={(value) => onChange({ negativePrompt: value })}
              onClear={() => onChange({ negativePrompt: '' })}
              onUseDefault={() => onChange({ negativePrompt: undefined })}
              onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault('negativePrompt', settings.negativePrompt ?? shotDefaults?.negativePrompt ?? '') : undefined}
              isSavingDefault={savingField === 'negativePrompt'}
              className="h-16 text-xs resize-none"
              placeholder="Things to avoid..."
              voiceInput
              voiceContext="This is a negative prompt - things to AVOID in video generation. List unwanted qualities as a comma-separated list."
              onVoiceResult={(result) => {
                onChange({ negativePrompt: result.prompt || result.transcription });
              }}
              containerClassName="space-y-1.5"
            />

            {/* Motion Controls */}
            {(() => {
              // Check if using defaults for motion settings
              const isUsingMotionModeDefault = settings.motionMode === undefined && !!shotDefaults?.motionMode;
              const isUsingPhaseConfigDefault = settings.phaseConfig === undefined && !!shotDefaults?.phaseConfig;
              // For loras: show "Default" badge only if settings.loras is undefined AND shot has default loras
              // settings.loras !== undefined means user has explicitly set loras (even if empty)
              const isUsingLorasDefault = settings.loras === undefined && (shotDefaults?.loras?.length ?? 0) > 0;
              const isUsingMotionDefaults = isUsingMotionModeDefault && isUsingPhaseConfigDefault;

              return (
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
                  labelSuffix={
                    <FieldDefaultControls
                      isUsingDefault={isUsingMotionDefaults}
                      onUseDefault={() => onChange({ motionMode: undefined, phaseConfig: undefined, selectedPhasePresetId: undefined })}
                      onSetAsDefault={onSaveFieldAsDefault ? async () => {
                        // Save both motion mode and phase config as defaults
                        await handleSaveFieldAsDefault('motionMode', settings.motionMode ?? shotDefaults?.motionMode ?? 'basic');
                        await handleSaveFieldAsDefault('phaseConfig', settings.phaseConfig ?? shotDefaults?.phaseConfig);
                        await handleSaveFieldAsDefault('selectedPhasePresetId', settings.selectedPhasePresetId ?? shotDefaults?.selectedPhasePresetId ?? null);
                      } : undefined}
                      isSaving={savingField === 'motionMode' || savingField === 'phaseConfig' || savingField === 'selectedPhasePresetId'}
                    />
                  }
                  renderBasicModeContent={() => (
                    <div className="space-y-3">
                      <div className="relative">
                        <ActiveLoRAsDisplay
                          selectedLoras={effectiveLoras}
                          onRemoveLora={handleRemoveLora}
                          onLoraStrengthChange={handleLoraStrengthChange}
                          availableLoras={availableLoras}
                        />
                        {/* Default/Reset controls for LoRAs */}
                        <div className="absolute -top-1 -right-1 z-10">
                          <FieldDefaultControls
                            isUsingDefault={isUsingLorasDefault}
                            onUseDefault={() => onChange({ loras: undefined })}
                            onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault(
                              'loras',
                              effectiveLoras
                            ) : undefined}
                            isSaving={savingField === 'loras'}
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleAddLoraClick}
                        className="w-full text-sm text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/30 hover:border-muted-foreground/50 rounded-lg py-2 transition-colors"
                      >
                        Add or manage LoRAs
                      </button>
                    </div>
                  )}
                />
              );
            })()}

            {/* Structure Video Section */}
            {/* Timeline Mode: Loading state when uploading or waiting for props (no existing video) */}
            {isTimelineMode && isVideoLoading && !structureVideoType && (
              <div className="space-y-3 pt-3 border-t border-border/50">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Video className="w-3.5 h-3.5" />
                  <span>Structure Video</span>
                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                </div>
                {/* Skeleton preview */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>Loading video...</span>
                  </div>
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="flex-1 relative">
                        <div className="w-full aspect-video bg-muted/50 rounded animate-pulse" />
                        <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center bg-black/60 text-white py-0.5 rounded-b">
                          {i === 0 ? 'Start' : i === 1 ? 'Mid' : 'End'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Timeline Mode: Add Structure Video (when no video exists and not loading) */}
            {isTimelineMode && !structureVideoType && !isVideoLoading && onAddSegmentStructureVideo && (
              <div className="space-y-3 pt-3 border-t border-border/50">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Video className="w-3.5 h-3.5" />
                  <span>Structure Video</span>
                </div>
                <div className="space-y-2">
                  <input
                    ref={addFileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={handleFileSelect}
                    disabled={isUploadingVideo}
                    className="hidden"
                    id="segment-structure-video-upload"
                  />
                  <div className="flex gap-2">
                    <Label htmlFor="segment-structure-video-upload" className="m-0 cursor-pointer flex-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isUploadingVideo}
                        className="w-full"
                        asChild
                      >
                        <span>
                          {isUploadingVideo ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                              {Math.round(uploadProgress)}%
                            </>
                          ) : (
                            <>
                              <Video className="w-3 h-3 mr-2" />
                              Upload
                            </>
                          )}
                        </span>
                      </Button>
                    </Label>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isUploadingVideo}
                      onClick={() => setShowVideoBrowser(true)}
                      className="flex-1"
                    >
                      <Images className="w-3 h-3 mr-2" />
                      Browse
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Add a motion guidance video for this segment
                  </p>
                </div>
              </div>
            )}

            {/* Structure Video Overrides - shown when segment has structure video */}
            {structureVideoType && (
              <div className="space-y-3 pt-3 border-t border-border/50">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Video className="w-3.5 h-3.5" />
                  <span>Structure Video {isTimelineMode ? '' : 'Overrides'}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground/80">
                    {structureVideoType === 'uni3c' ? 'Uni3C' : structureVideoType === 'flow' ? 'Optical Flow' : structureVideoType === 'canny' ? 'Canny' : structureVideoType === 'depth' ? 'Depth' : structureVideoType}
                  </span>
                </div>

                {/* 3-Frame Preview with Remove button overlay */}
                {structureVideoUrl && structureVideoFrameRange && (
                  <div className="relative">
                    {/* Remove button - top right of preview */}
                    {isTimelineMode && onRemoveSegmentStructureVideo && !isVideoLoading && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onRemoveSegmentStructureVideo}
                        disabled={isUploadingVideo}
                        className="absolute -top-1 -right-1 z-10 h-6 w-6 p-0 rounded-full bg-background/80 hover:bg-destructive/20 text-destructive hover:text-destructive"
                        title="Remove video"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                    {/* Show skeleton when waiting for new video props to arrive, otherwise show preview */}
                    {pendingVideoUrl && pendingVideoUrl !== structureVideoUrl && !isUploadingVideo ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <Loader2 className="w-3 h-3 animate-spin text-primary" />
                          <span>Loading new video...</span>
                        </div>
                        <div className="flex gap-1">
                          {[0, 1, 2].map((i) => (
                            <div key={i} className="flex-1 relative">
                              <div className="w-full aspect-video bg-muted/50 rounded animate-pulse" />
                              <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center bg-black/60 text-white py-0.5 rounded-b">
                                {i === 0 ? 'Start' : i === 1 ? 'Mid' : 'End'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <StructureVideoPreview
                        videoUrl={structureVideoUrl}
                        frameRange={structureVideoFrameRange}
                        onLoadComplete={handleVideoPreviewLoaded}
                      />
                    )}
                  </div>
                )}
                {/* Skeleton when no preview URL yet but loading */}
                {isVideoLoading && !structureVideoUrl && structureVideoFrameRange && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Loading video...</span>
                    </div>
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="flex-1 relative">
                          <div className="w-full aspect-video bg-muted/50 rounded animate-pulse" />
                          <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center bg-black/60 text-white py-0.5 rounded-b">
                            {i === 0 ? 'Start' : i === 1 ? 'Mid' : 'End'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Treatment Mode Selector with Upload/Browse - Timeline Mode Only */}
                {isTimelineMode && (
                  <div className="space-y-1.5">
                    <div className="flex gap-2">
                      {/* Treatment selector - left half */}
                      <div className="flex-1">
                        <Label className="text-xs font-medium">Treatment:</Label>
                        <SegmentedControl
                          value={settings.structureTreatment ?? structureVideoDefaults?.treatment ?? 'adjust'}
                          onValueChange={(v) => onChange({ structureTreatment: v as 'adjust' | 'clip' })}
                          className="w-full mt-1"
                          size="sm"
                        >
                          <SegmentedControlItem
                            value="adjust"
                            className="flex-1"
                            title="Stretch or compress video to match segment duration"
                          >
                            Fit to Range
                          </SegmentedControlItem>
                          <SegmentedControlItem
                            value="clip"
                            className="flex-1"
                            title="Use video frames directly — extra frames are trimmed if video is longer"
                          >
                            1:1 Mapping
                          </SegmentedControlItem>
                        </SegmentedControl>
                      </div>
                      {/* Upload/Browse buttons - right half */}
                      {onAddSegmentStructureVideo && (
                        <div className="flex-1">
                          <Label className="text-xs font-medium">Replace:</Label>
                          <div className="flex gap-1 mt-1">
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="video/mp4,video/webm,video/quicktime"
                              onChange={handleFileSelect}
                              disabled={isUploadingVideo}
                              className="hidden"
                              id="segment-structure-video-replace"
                            />
                            <Label htmlFor="segment-structure-video-replace" className="m-0 cursor-pointer flex-1">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isUploadingVideo}
                                className="w-full h-8"
                                asChild
                              >
                                <span>
                                  {isUploadingVideo ? (
                                    <>
                                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                      {Math.round(uploadProgress)}%
                                    </>
                                  ) : (
                                    <>
                                      <Video className="w-3 h-3 mr-1" />
                                      Upload
                                    </>
                                  )}
                                </span>
                              </Button>
                            </Label>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isUploadingVideo}
                              onClick={() => setShowVideoBrowser(true)}
                              className="flex-1 h-8"
                            >
                              <Images className="w-3 h-3 mr-1" />
                              Browse
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Motion Strength */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs font-medium">Strength:</Label>
                      <FieldDefaultControls
                        isUsingDefault={settings.structureMotionStrength === undefined}
                        onUseDefault={() => onChange({ structureMotionStrength: undefined })}
                        onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault(
                          'structureMotionStrength',
                          settings.structureMotionStrength ?? structureVideoDefaults?.motionStrength ?? 1.2
                        ) : undefined}
                        isSaving={savingField === 'structureMotionStrength'}
                      />
                    </div>
                    <span className="text-xs font-medium">
                      {(settings.structureMotionStrength ?? structureVideoDefaults?.motionStrength ?? 1.2).toFixed(1)}x
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
                      <div className="flex items-center gap-2">
                        <Label className="text-xs font-medium">End Percent:</Label>
                        <FieldDefaultControls
                          isUsingDefault={settings.structureUni3cEndPercent === undefined}
                          onUseDefault={() => onChange({ structureUni3cEndPercent: undefined })}
                          onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault(
                            'structureUni3cEndPercent',
                            settings.structureUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent ?? 0.1
                          ) : undefined}
                          isSaving={savingField === 'structureUni3cEndPercent'}
                        />
                      </div>
                      <span className="text-xs font-medium">
                        {((settings.structureUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent ?? 0.1) * 100).toFixed(0)}%
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
            selectedLoras={(effectiveLoras).map(lora => {
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

          {/* Structure Video Browser Modal - Timeline Mode Only */}
          {isTimelineMode && (
            <DatasetBrowserModal
              isOpen={showVideoBrowser}
              onOpenChange={setShowVideoBrowser}
              resourceType="structure-video"
              title="Browse Guidance Videos"
              onResourceSelect={handleVideoResourceSelect}
            />
          )}
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
