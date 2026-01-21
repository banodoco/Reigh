import React, { useState, useMemo } from 'react';
import { TaskDetailsProps, getVariantConfig, parseTaskParams } from './taskDetailsConfig';
import { framesToSeconds } from '../Timeline/utils/time-utils';

/**
 * Task details for join clips tasks
 * Shows: video clips, transition prompts, frame configuration
 */
export const JoinClipsDetails: React.FC<TaskDetailsProps> = ({
  task,
  inputImages,
  variant,
  isMobile = false,
}) => {
  const config = getVariantConfig(variant, isMobile, inputImages.length);
  const [videoLoadedStates, setVideoLoadedStates] = useState<{[key: number]: boolean}>({});
  
  const parsedParams = useMemo(() => parseTaskParams(task?.params), [task?.params]);
  const orchestratorDetails = parsedParams?.orchestrator_details;
  const orchestratorPayload = parsedParams?.full_orchestrator_payload;

  // Multi-clip format
  const clipsArray = parsedParams?.clips || orchestratorDetails?.clips || orchestratorPayload?.clips;
  const perJoinSettings = parsedParams?.per_join_settings || orchestratorDetails?.per_join_settings || orchestratorPayload?.per_join_settings;
  
  // Legacy two-video format
  const startingVideoPath = !clipsArray && (parsedParams?.starting_video_path || orchestratorDetails?.starting_video_path || orchestratorPayload?.starting_video_path);
  const endingVideoPath = !clipsArray && (parsedParams?.ending_video_path || orchestratorDetails?.ending_video_path || orchestratorPayload?.ending_video_path);
  const joinClipsPrompt = !clipsArray && (parsedParams?.prompt || orchestratorDetails?.prompt || orchestratorPayload?.prompt);
  
  // Frame configuration - use ?? to handle 0 values correctly
  const contextFrameCount = parsedParams?.context_frame_count ?? orchestratorDetails?.context_frame_count ?? orchestratorPayload?.context_frame_count;
  const gapFrameCount = parsedParams?.gap_frame_count ?? orchestratorDetails?.gap_frame_count ?? orchestratorPayload?.gap_frame_count;
  const replaceMode = parsedParams?.replace_mode ?? orchestratorDetails?.replace_mode ?? orchestratorPayload?.replace_mode;
  const keepBridgingImages = parsedParams?.keep_bridging_images ?? orchestratorDetails?.keep_bridging_images ?? orchestratorPayload?.keep_bridging_images;

  const setClipVideoLoaded = (index: number, loaded: boolean) => {
    setVideoLoadedStates(prev => ({ ...prev, [index]: loaded }));
  };

  const renderVideoPreview = (url: string, index: number, label: string) => (
    <div className="space-y-1">
      <p className={`${config.textSize} text-muted-foreground text-center`}>{label}</p>
      <div className="relative group cursor-pointer">
        {!videoLoadedStates[index] ? (
          <div 
            className="w-full aspect-video bg-black rounded border shadow-sm flex items-center justify-center"
            onClick={() => setClipVideoLoaded(index, true)}
          >
            <div className="bg-white/20 group-hover:bg-white/30 rounded-full p-2 transition-colors">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
        ) : (
          <>
            <video 
              src={url}
              className="w-full object-cover rounded border shadow-sm"
              loop muted playsInline autoPlay
              onClick={(e) => {
                const video = e.currentTarget;
                video.paused ? video.play() : video.pause();
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="bg-black/50 rounded-full p-1.5">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className={`p-3 bg-muted/30 rounded-lg border space-y-3 ${variant === 'panel' ? '' : variant === 'modal' && isMobile ? 'w-full' : 'w-[360px]'}`}>
      {/* Multi-Clip Format */}
      {clipsArray && clipsArray.length > 0 && (
        <div className="space-y-3">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>
            Video Clips ({clipsArray.length})
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {clipsArray.map((clip: any, index: number) => (
              <div key={index}>
                {renderVideoPreview(clip.url, index, `Clip ${index + 1}`)}
                {clip.name && (
                  <p className={`${config.textSize} text-muted-foreground text-center truncate mt-1 preserve-case`} title={clip.name}>
                    {clip.name}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Individual Transition Prompts */}
          {perJoinSettings && perJoinSettings.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-muted-foreground/20">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Transition Prompts</p>
              {perJoinSettings.map((settings: any, index: number) => (
                settings.prompt && (
                  <div key={index} className="space-y-1">
                    <p className={`${config.textSize} text-muted-foreground`}>
                      Clip {index + 1} → {index + 2}
                    </p>
                    <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap leading-relaxed pl-2 border-l-2 border-muted-foreground/30`}>
                      {settings.prompt}
                    </p>
                  </div>
                )
              ))}
            </div>
          )}
        </div>
      )}

      {/* Legacy Two-Video Format */}
      {!clipsArray && (startingVideoPath || endingVideoPath) && (
        <div className="grid grid-cols-2 gap-3">
          {startingVideoPath && renderVideoPreview(startingVideoPath, 0, 'Starting Clip')}
          {endingVideoPath && renderVideoPreview(endingVideoPath, 1, 'Ending Clip')}
        </div>
      )}

      {/* Frame Configuration */}
      {(contextFrameCount != null || gapFrameCount != null || replaceMode != null || keepBridgingImages != null) && (
        <div className={`space-y-2 ${(clipsArray?.length > 0) || startingVideoPath || endingVideoPath ? 'pt-2 border-t border-muted-foreground/20' : ''}`}>
          <p className={`${config.textSize} font-medium text-muted-foreground`}>Configuration</p>
          <div className="grid grid-cols-2 gap-3">
            {gapFrameCount != null && (
              <div className="space-y-1">
                <p className={`${config.textSize} text-muted-foreground`}>Gap Frames</p>
                <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                  {framesToSeconds(gapFrameCount)} ({gapFrameCount} frames)
                </p>
              </div>
            )}
            {contextFrameCount != null && (
              <div className="space-y-1">
                <p className={`${config.textSize} text-muted-foreground`}>Context Frames</p>
                <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                  {framesToSeconds(contextFrameCount)} ({contextFrameCount} frames)
                </p>
              </div>
            )}
            {replaceMode != null && (
              <div className="space-y-1">
                <p className={`${config.textSize} text-muted-foreground`}>Transition Mode</p>
                <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                  {replaceMode ? 'Replace' : 'Insert'}
                </p>
              </div>
            )}
            {keepBridgingImages != null && (
              <div className="space-y-1">
                <p className={`${config.textSize} text-muted-foreground`}>Bridge Anchors</p>
                <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                  {keepBridgingImages ? 'On' : 'Off'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legacy Single Prompt */}
      {!clipsArray && joinClipsPrompt && (
        <div className="space-y-1">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>Transition Prompt</p>
          <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap leading-relaxed`}>
            {joinClipsPrompt}
          </p>
        </div>
      )}
    </div>
  );
};

export default JoinClipsDetails;

