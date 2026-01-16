import React, { useState, useMemo } from 'react';
import { Button } from '@/shared/components/ui/button';
import { TaskDetailsProps, getVariantConfig, parseTaskParams, deriveInputImages } from './taskDetailsConfig';
import { getDisplayNameFromUrl } from '../../utils/loraDisplayUtils';

/**
 * Task details for video travel/generation tasks
 * Shows: variant name, guidance images, phase settings, video/style reference, prompts, technical settings, LoRAs
 */
export const VideoTravelDetails: React.FC<TaskDetailsProps> = ({
  task,
  inputImages,
  variant,
  isMobile = false,
  showAllImages = false,
  onShowAllImagesChange,
  showFullPrompt = false,
  onShowFullPromptChange,
  showFullNegativePrompt = false,
  onShowFullNegativePromptChange,
  generationName,
  onGenerationNameChange,
  isEditingGenerationName = false,
  onEditingGenerationNameChange,
  availableLoras,
}) => {
  const config = getVariantConfig(variant, isMobile, inputImages.length);
  const [videoLoaded, setVideoLoaded] = useState(false);
  
  const parsedParams = useMemo(() => parseTaskParams(task?.params), [task?.params]);
  const derivedImages = useMemo(() => deriveInputImages(parsedParams), [parsedParams]);
  const effectiveInputImages = inputImages.length > 0 ? inputImages : derivedImages;

  const orchestratorDetails = parsedParams?.orchestrator_details;
  const orchestratorPayload = parsedParams?.full_orchestrator_payload;
  const individualSegmentParams = parsedParams?.individual_segment_params;

  // Phase config
  const phaseConfig = useMemo(() => (
    individualSegmentParams?.phase_config ||
    orchestratorPayload?.phase_config || 
    orchestratorDetails?.phase_config || 
    parsedParams?.phase_config
  ), [individualSegmentParams, orchestratorPayload, orchestratorDetails, parsedParams]);

  const phaseStepsDisplay = useMemo(() => {
    if (!phaseConfig?.steps_per_phase || !Array.isArray(phaseConfig.steps_per_phase)) return null;
    const stepsArray = phaseConfig.steps_per_phase;
    const total = stepsArray.reduce((a: number, b: number) => a + b, 0);
    return `${stepsArray.join(' → ')} (${total} total)`;
  }, [phaseConfig?.steps_per_phase]);

  const phasesWithLoras = useMemo(() => {
    if (!phaseConfig?.phases || !Array.isArray(phaseConfig.phases)) return [];
    return phaseConfig.phases.filter((phase: any) => phase.loras && phase.loras.length > 0);
  }, [phaseConfig?.phases]);

  const additionalLoras = (
    individualSegmentParams?.additional_loras ||
    orchestratorPayload?.additional_loras || 
    orchestratorDetails?.additional_loras || 
    parsedParams?.additional_loras
  ) as Record<string, any> | undefined;

  // Segment info
  const isSegmentTask = parsedParams?.segment_index !== undefined;
  const segmentIndex = parsedParams?.segment_index;
  const isFirstSegment = parsedParams?.is_first_segment;
  const isLastSegment = parsedParams?.is_last_segment;

  // Layout for two-column on large screens when phases present
  const showPhaseContentInRightColumn = phaseConfig?.phases && variant === 'panel';

  // Get prompts
  const prompt = individualSegmentParams?.base_prompt ||
    (isSegmentTask 
      ? (parsedParams?.base_prompt || parsedParams?.prompt)
      : (orchestratorDetails?.base_prompts_expanded?.[0] || 
         orchestratorPayload?.base_prompts_expanded?.[0] || 
         orchestratorDetails?.base_prompt ||
         orchestratorPayload?.base_prompt ||
         parsedParams?.prompt));
  
  const negativePrompt = individualSegmentParams?.negative_prompt ||
    (isSegmentTask 
      ? parsedParams?.negative_prompt
      : (orchestratorDetails?.negative_prompts_expanded?.[0] || orchestratorPayload?.negative_prompts_expanded?.[0] || parsedParams?.negative_prompt));

  const enhancePrompt = orchestratorDetails?.enhance_prompt || orchestratorPayload?.enhance_prompt || parsedParams?.enhance_prompt;

  // Structure guidance (new format with videos array, target, strength, step_window)
  const structureGuidance = orchestratorDetails?.structure_guidance || orchestratorPayload?.structure_guidance || parsedParams?.structure_guidance;

  // Video/style reference - prefer new structure_guidance.videos format, fall back to legacy fields
  const structureVideo = structureGuidance?.videos?.[0];
  const videoPath = structureVideo?.path || orchestratorDetails?.structure_video_path || orchestratorPayload?.structure_video_path || parsedParams?.structure_video_path;
  const videoTreatment = structureVideo?.treatment || orchestratorDetails?.structure_video_treatment || orchestratorPayload?.structure_video_treatment || parsedParams?.structure_video_treatment;
  const videoType = orchestratorDetails?.structure_video_type || orchestratorPayload?.structure_video_type || parsedParams?.structure_video_type;
  const motionStrength = orchestratorDetails?.structure_video_motion_strength ?? orchestratorPayload?.structure_video_motion_strength ?? parsedParams?.structure_video_motion_strength;

  const styleImage = parsedParams?.style_reference_image || orchestratorDetails?.style_reference_image;
  const styleStrength = parsedParams?.style_reference_strength ?? orchestratorDetails?.style_reference_strength;

  // Technical settings
  const modelName = orchestratorDetails?.model_name || orchestratorPayload?.model_name || parsedParams?.model_name;
  const steps = orchestratorDetails?.steps || orchestratorPayload?.steps || parsedParams?.num_inference_steps;
  const resolution = orchestratorDetails?.parsed_resolution_wh || parsedParams?.parsed_resolution_wh;
  const frames = isSegmentTask
    ? (individualSegmentParams?.num_frames || parsedParams?.num_frames || parsedParams?.segment_frames_target)
    : (orchestratorDetails?.segment_frames_expanded?.[0] || orchestratorPayload?.segment_frames_expanded?.[0] || parsedParams?.segment_frames_expanded);
  const amountOfMotion = individualSegmentParams?.amount_of_motion ?? orchestratorDetails?.amount_of_motion ?? orchestratorPayload?.amount_of_motion ?? parsedParams?.amount_of_motion;

  const formatModelName = (name: string) => {
    return name
      .replace(/wan_2_2_i2v_lightning_baseline_(\d+)_(\d+)_(\d+)/, 'Wan 2.2 I2V Lightning ($1.$2.$3)')
      .replace(/wan_2_2_i2v_baseline_(\d+)_(\d+)_(\d+)/, 'Wan 2.2 I2V Baseline ($1.$2.$3)')
      .replace(/wan_2_2_i2v_lightning/, 'Wan 2.2 I2V Lightning')
      .replace(/wan_2_2_i2v/, 'Wan 2.2 I2V')
      .replace(/_/g, ' ');
  };

  return (
    <div className={`p-3 bg-muted/30 rounded-lg border ${showPhaseContentInRightColumn ? 'w-full grid grid-cols-1 lg:grid-cols-2 gap-4' : 'space-y-3'} ${!showPhaseContentInRightColumn && variant === 'panel' ? '' : variant === 'modal' && isMobile ? 'w-full' : !showPhaseContentInRightColumn ? 'w-[360px]' : ''}`}>
      {/* Main Content Column */}
      <div className={showPhaseContentInRightColumn ? 'space-y-3 min-w-0' : 'contents'}>
        
        {/* Segment Indicator */}
        {isSegmentTask && (
          <div className="space-y-1 pb-3 border-b border-muted-foreground/20">
            <div className="flex items-center gap-2">
              <span className={`${config.textSize} font-medium text-primary`}>
                Segment {segmentIndex + 1}
              </span>
              {isFirstSegment && <span className={`${config.textSize} text-muted-foreground`}>(First)</span>}
              {isLastSegment && <span className={`${config.textSize} text-muted-foreground`}>(Last)</span>}
            </div>
          </div>
        )}
        
        {/* Variant Name Section */}
        {!isSegmentTask && (variant === 'modal' || variant === 'panel') && (generationName !== undefined || onGenerationNameChange) && (
          <div className="space-y-1 pb-3 border-b border-muted-foreground/20">
            <p className={`${config.textSize} font-medium text-muted-foreground`}>Variant Name</p>
            {isEditingGenerationName ? (
              <input
                type="text"
                value={generationName || ''}
                onChange={(e) => onGenerationNameChange?.(e.target.value)}
                onBlur={() => onEditingGenerationNameChange?.(false)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') onEditingGenerationNameChange?.(false); }}
                autoFocus
                placeholder="Enter variant name..."
                className="flex-1 px-2 py-1 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary w-full"
              />
            ) : (
              <div 
                className="flex items-center justify-between group cursor-pointer hover:bg-muted/50 px-2 py-1 rounded transition-colors"
                onClick={() => onEditingGenerationNameChange?.(true)}
              >
                <p className={`${config.textSize} ${config.fontWeight} text-foreground ${!generationName && 'text-muted-foreground italic'}`}>
                  {generationName || 'Click to add variant name...'}
                </p>
                <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">Edit</span>
              </div>
            )}
          </div>
        )}

        {/* Guidance Images */}
        {effectiveInputImages.length > 0 && (
          <div className="space-y-2">
            <p className={`${config.textSize} font-medium text-muted-foreground`}>
              Image Guidance ({effectiveInputImages.length})
            </p>
            <div className={`grid gap-1 ${config.imageGridCols}`}>
              {(showAllImages ? effectiveInputImages : effectiveInputImages.slice(0, config.maxImages)).map((img, i) => (
                <img key={i} src={img} alt={`Input ${i + 1}`} className="w-full aspect-square object-cover rounded border shadow-sm" />
              ))}
              {effectiveInputImages.length > config.maxImages && !showAllImages && (
                <div onClick={() => onShowAllImagesChange?.(true)} className="w-full aspect-square bg-muted/50 hover:bg-muted/70 rounded border cursor-pointer flex items-center justify-center">
                  <span className={`${config.textSize} text-muted-foreground font-medium`}>{effectiveInputImages.length - config.maxImages} more</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Video/Structure Guidance */}
        {videoPath && (
          <div className="space-y-2">
            <p className={`${config.textSize} font-medium text-muted-foreground`}>
              {structureGuidance?.target ? 'Structure Guidance' : 'Video Guidance'}
            </p>
            <div className="flex items-start gap-3">
              <div className="relative group cursor-pointer" style={{ width: '80px' }} onClick={() => setVideoLoaded(true)}>
                {!videoLoaded ? (
                  <div className="w-full aspect-video bg-black rounded border flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                ) : (
                  <video src={videoPath} className="w-full rounded border" loop muted playsInline autoPlay />
                )}
              </div>
              <div className={`${config.textSize} ${config.fontWeight} space-y-1`}>
                {structureGuidance?.target && (
                  <div><span className="text-muted-foreground">Target: </span><span className="uppercase">{structureGuidance.target}</span></div>
                )}
                {structureGuidance?.strength != null && (
                  <div><span className="text-muted-foreground">Strength: </span>{structureGuidance.strength}</div>
                )}
                {structureGuidance?.step_window && Array.isArray(structureGuidance.step_window) && (
                  <div><span className="text-muted-foreground">Step Window: </span>{structureGuidance.step_window[0]} → {structureGuidance.step_window[1]}</div>
                )}
                {videoType && <div><span className="text-muted-foreground">Type: </span><span className="capitalize">{videoType}</span></div>}
                {videoTreatment && <div><span className="text-muted-foreground">Treatment: </span><span className="capitalize">{videoTreatment}</span></div>}
                {motionStrength != null && <div><span className="text-muted-foreground">Strength: </span>{Math.round(motionStrength * 100)}%</div>}
              </div>
            </div>
          </div>
        )}

        {/* Style Reference */}
        {styleImage && (
          <div className="space-y-2">
            <p className={`${config.textSize} font-medium text-muted-foreground`}>Style Reference</p>
            <div className="flex items-center gap-3">
              <img src={styleImage} alt="Style" className="w-[80px] object-cover rounded border" />
              {styleStrength != null && <span className={`${config.textSize} ${config.fontWeight}`}>Strength: {Math.round(styleStrength * 100)}%</span>}
            </div>
          </div>
        )}

        {/* Prompts */}
        <div className="space-y-3">
          <div className="space-y-1">
            <p className={`${config.textSize} font-medium text-muted-foreground`}>Prompt{enhancePrompt ? ' (enhanced)' : ''}</p>
            <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap`}>
              {prompt ? (showFullPrompt || prompt.length <= config.promptLength ? prompt : prompt.slice(0, config.promptLength) + '...') : 'None'}
            </p>
            {prompt && prompt.length > config.promptLength && onShowFullPromptChange && (
              <Button variant="ghost" size="sm" onClick={() => onShowFullPromptChange(!showFullPrompt)} className="h-6 px-0 text-xs text-primary">
                {showFullPrompt ? 'Show Less' : 'Show More'}
              </Button>
            )}
          </div>
          {negativePrompt && negativePrompt !== 'N/A' && (
            <div className="space-y-1">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Negative Prompt</p>
              <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap`}>
                {showFullNegativePrompt || negativePrompt.length <= config.negativePromptLength ? negativePrompt : negativePrompt.slice(0, config.negativePromptLength) + '...'}
              </p>
              {negativePrompt.length > config.negativePromptLength && onShowFullNegativePromptChange && (
                <Button variant="ghost" size="sm" onClick={() => onShowFullNegativePromptChange(!showFullNegativePrompt)} className="h-6 px-0 text-xs text-primary">
                  {showFullNegativePrompt ? 'Show Less' : 'Show More'}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Technical Settings */}
        <div className="grid grid-cols-2 gap-3">
          {modelName && (
            <div className="space-y-1">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Model</p>
              <p className={`${config.textSize} ${config.fontWeight}`}>{formatModelName(modelName)}</p>
            </div>
          )}
          {!phaseConfig?.phases && (
            <div className="space-y-1">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Steps</p>
              <p className={`${config.textSize} ${config.fontWeight}`}>{steps || 'N/A'}</p>
            </div>
          )}
          <div className="space-y-1">
            <p className={`${config.textSize} font-medium text-muted-foreground`}>Resolution</p>
            <p className={`${config.textSize} ${config.fontWeight}`}>{resolution || 'N/A'}</p>
          </div>
          <div className="space-y-1">
            <p className={`${config.textSize} font-medium text-muted-foreground`}>{isSegmentTask ? 'Frames' : 'Frames / Segment'}</p>
            <p className={`${config.textSize} ${config.fontWeight}`}>{frames || 'N/A'}</p>
          </div>
          <div className="space-y-1">
            <p className={`${config.textSize} font-medium text-muted-foreground`}>Amount of Motion</p>
            <p className={`${config.textSize} ${config.fontWeight}`}>{amountOfMotion != null ? `${Math.round(amountOfMotion * 100)}%` : 'N/A'}</p>
          </div>
        </div>

        {/* LoRAs (when not in right column) */}
        {!showPhaseContentInRightColumn && phasesWithLoras.length > 0 && (
          <div className="pt-2 border-t border-muted-foreground/20 space-y-2">
            <p className={`${config.textSize} font-medium text-muted-foreground`}>LoRAs by Phase</p>
            {phasesWithLoras.map((phase: any) => (
              <div key={phase.phase} className="space-y-1">
                <p className={`${config.textSize} font-medium`}>Phase {phase.phase}</p>
                <div className="space-y-1 ml-2">
                  {phase.loras.map((lora: any, idx: number) => (
                    <div key={idx} className={`flex justify-between p-1.5 bg-background/50 rounded border ${config.textSize}`}>
                      <span className={`${config.fontWeight} truncate`}>{getDisplayNameFromUrl(lora.url, availableLoras)}</span>
                      <span className="text-muted-foreground ml-1">{lora.multiplier}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        
        {!showPhaseContentInRightColumn && !phasesWithLoras.length && additionalLoras && Object.keys(additionalLoras).length > 0 && (
          <div className="pt-2 border-t border-muted-foreground/20 space-y-2">
            <p className={`${config.textSize} font-medium text-muted-foreground`}>LoRAs Used</p>
            {Object.entries(additionalLoras).slice(0, config.maxLoras).map(([url, strength]) => (
              <div key={url} className={`flex justify-between p-1.5 bg-background/50 rounded border ${config.textSize}`}>
                <span className={`${config.fontWeight} truncate`}>{url.split('/').pop()?.replace(/\.(safetensors|ckpt|pt)$/, '')}</span>
                <span className="text-muted-foreground ml-1">{strength as number}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right Column: Phase Settings and LoRAs (only when showPhaseContentInRightColumn) */}
      {showPhaseContentInRightColumn && (
        <div className="space-y-3 lg:border-l lg:border-muted-foreground/20 lg:pl-4 min-w-0">
          {phaseConfig?.phases && (
            <div className="space-y-2">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Phase Settings</p>
              <div className="grid grid-cols-2 gap-2">
                <div><span className={`${config.textSize} text-muted-foreground`}>Phases:</span> <span className={`${config.textSize} ${config.fontWeight}`}>{phaseConfig.num_phases || phaseConfig.phases?.length}</span></div>
                {phaseConfig.flow_shift !== undefined && <div><span className={`${config.textSize} text-muted-foreground`}>Flow Shift:</span> <span className={`${config.textSize} ${config.fontWeight}`}>{phaseConfig.flow_shift}</span></div>}
                {phaseConfig.sample_solver && <div><span className={`${config.textSize} text-muted-foreground`}>Solver:</span> <span className={`${config.textSize} ${config.fontWeight} capitalize`}>{phaseConfig.sample_solver}</span></div>}
              </div>
              {phaseStepsDisplay && <div><span className={`${config.textSize} text-muted-foreground`}>Steps per Phase:</span> <span className={`${config.textSize} ${config.fontWeight}`}>{phaseStepsDisplay}</span></div>}
            </div>
          )}

          {phasesWithLoras.length > 0 && (
            <div className="pt-3 border-t border-muted-foreground/20 space-y-2">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>LoRAs by Phase</p>
              {phasesWithLoras.map((phase: any) => (
                <div key={phase.phase} className="space-y-1">
                  <p className={`${config.textSize} font-medium`}>Phase {phase.phase}</p>
                  <div className="space-y-1 ml-2">
                    {phase.loras.map((lora: any, idx: number) => (
                      <div key={idx} className={`flex justify-between p-1.5 bg-background/50 rounded border ${config.textSize}`}>
                        <span className={`${config.fontWeight} truncate`}>{getDisplayNameFromUrl(lora.url, availableLoras)}</span>
                        <span className="text-muted-foreground ml-1">{lora.multiplier}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VideoTravelDetails;

