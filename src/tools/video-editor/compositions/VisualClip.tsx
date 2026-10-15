import { AudioTrack } from './AudioTrack.tsx';
import { PlayerAudioSource } from './PlayerAudioSource.tsx';
import { PlayerClipSequence, PlayerClipEvaluationContext } from './PlayerClipSequence.tsx';
import { useContext, useMemo, useState, type CSSProperties, type ComponentProps, type FC, type ReactNode } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useRemotionEnvironment, useVideoConfig } from 'remotion';
import { ReadinessImage } from '@astrid/packs/rendering/shared/readiness-image';
import { ReadinessVideo } from './ReadinessVideo.tsx';
import {
  getClipDurationInFrames,
  getSanitizedMediaSrc,
  getSanitizedMediaTrimProps,
  getSanitizedPlaybackRate,
  getSanitizedVolume,
  parseResolution,
  secondsToFrames,
} from '@/tools/video-editor/lib/config-utils.ts';
import { wrapWithClipEffects } from '@/tools/video-editor/effects/index.tsx';
import {
  useOptionalEffectRegistryContext,
  type EffectRegistrySnapshot,
} from '@/tools/video-editor/effects/registry/index.ts';
import { useOptionalPreviewMediaFailure } from '@/tools/video-editor/compositions/PreviewMediaFailureContext.tsx';
import { computeViewportMediaLayout } from '@/tools/video-editor/lib/render-bounds.ts';
import {
  useOptionalTransitionRegistryContext,
} from '@/tools/video-editor/transitions/registry/index.ts';
import {
  createTransitionSnapshot,
  resolveTransition,
} from '@/tools/video-editor/transitions/catalog.ts';
import type { ResolvedTimelineClip, TrackDefinition } from '@/tools/video-editor/types/index.ts';
import { getTimelineClipShader } from '@/tools/video-editor/lib/timeline-domain.ts';
import { PendingMaterialPlaceholder } from '@/tools/video-editor/components/PendingMaterialPlaceholder.tsx';
import type { CapabilityFinding, RenderMaterialRef } from '@reigh/editor-sdk';
import type { RenderPlannerMaterialStatus } from '@/tools/video-editor/runtime/renderPlanner.ts';
import { ClipShaderPreviewCanvas } from '@/tools/video-editor/shaders/preview/ClipShaderPreviewCanvas.tsx';
import { mediaModifierBounds, type ModifierBounds } from '@banodoco/timeline-composition/theme-api';
import { admitAppModifierTarget, composeAppClipModifiers, useAppModifierHost } from '@/tools/video-editor/runtime/clip-modifiers.ts';
import {
  useOptionalShaderEffectRegistryContext,
  type ShaderEffectRegistrySnapshot,
} from '@/tools/video-editor/shaders/registry/index.ts';

// Keep the original video decoder/trim for pictures. Enveloped sound uses the
// same resolved source, decoded PCM and source clock as audio-only tracks.
const PlayerVideo: FC<ComponentProps<typeof ReadinessVideo> & {clip: ResolvedTimelineClip; fps: number}> =
  ({clip, fps, ...props}) => {
    const evaluation = useContext(PlayerClipEvaluationContext);
    const sharedAudio = evaluation?.clipId === clip.id
      && (evaluation.plan.fadeIn || evaluation.plan.fadeOut || evaluation.plan.drawDuration > evaluation.plan.ownDuration);
    // Freeze stops Remotion playback. Native video sound is therefore mounted
    // outside the picture transition, in its unchanged own-span AudioTrack.
    if (sharedAudio) return <ReadinessVideo {...props} muted volume={0} />;
    return <PlayerAudioSource src={props.src} clip={clip} fps={fps}>{audioSrc => audioSrc === props.src
      ? <ReadinessVideo {...props} />
      : <>
          <ReadinessVideo {...props} muted volume={0} />
          <Audio src={audioSrc} trimBefore={props.trimBefore} trimAfter={props.trimAfter}
            playbackRate={props.playbackRate} volume={props.muted ? 0 : props.volume} pauseWhenBuffering={false} />
        </>}
    </PlayerAudioSource>;
  };

// SD-025 (Sprint 3): inline missing-asset placeholder body. Mirrors the
// styling of UnknownClipPlaceholder so the two loud cases look like a pair.
// Lives inline (not a shared component) because VisualClip already wraps
// content in a Sequence/AbsoluteFill upstream — we only need the visible
// label here.
const MissingAssetBody: FC<{ clipId: string; clipType: string }> = ({ clipId, clipType }) => (
  <AbsoluteFill
    data-testid="missing-asset-placeholder"
    data-clip-id={clipId}
    data-clip-type={clipType}
    style={{
      backgroundColor: '#5B0000',
      borderTop: '2px solid #FF5252',
      borderBottom: '2px solid #FF5252',
      color: '#FFCDD2',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '12px 24px',
      textAlign: 'center',
      fontFamily:
        'ui-monospace, SFMono-Regular, "Roboto Mono", Menlo, Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.4,
      letterSpacing: '0.04em',
    }}
  >
    <div
      style={{
        maxWidth: '80%',
        padding: '8px 16px',
        borderRadius: 4,
        background: 'rgba(0, 0, 0, 0.45)',
      }}
    >
      {`clipType '${clipType}' missing asset — clip will not appear in render`}
    </div>
  </AbsoluteFill>
);

// SD-032 (Sprint 5): inline missing-transition placeholder body. Renders when
// a clip has a transition type that cannot be resolved through the unified
// catalog (built-ins + provider registry). The clip content still renders, but
// without transition styling — the placeholder is rendered as a diagnostic
// overlay. No silent fallback to crossfade.
const MissingTransitionBody: FC<{ clipId: string; transitionType: string }> = ({ clipId, transitionType }) => (
  <AbsoluteFill
    data-testid="missing-transition-placeholder"
    data-clip-id={clipId}
    data-transition-type={transitionType}
    style={{
      backgroundColor: '#1A0A2E',
      borderTop: '2px solid #A855F7',
      borderBottom: '2px solid #A855F7',
      color: '#E9D5FF',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '12px 24px',
      textAlign: 'center',
      fontFamily:
        'ui-monospace, SFMono-Regular, "Roboto Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      letterSpacing: '0.04em',
    }}
  >
    <div
      style={{
        maxWidth: '80%',
        padding: '8px 16px',
        borderRadius: 4,
        background: 'rgba(0, 0, 0, 0.45)',
      }}
    >
      {`transition '${transitionType}' not found — clip will render without transition`}
    </div>
  </AbsoluteFill>
);

const UnsupportedAssetBody: FC<{ clipId: string; clipType: string; assetType?: string }> = ({ clipId, clipType, assetType }) => (
  <AbsoluteFill
    data-testid="unsupported-asset-placeholder"
    data-clip-id={clipId}
    data-clip-type={clipType}
    data-asset-type={assetType}
    style={{
      backgroundColor: '#332600',
      borderTop: '2px solid #FBBF24',
      borderBottom: '2px solid #FBBF24',
      color: '#FEF3C7',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '12px 24px',
      textAlign: 'center',
      fontFamily:
        'ui-monospace, SFMono-Regular, "Roboto Mono", Menlo, Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.4,
      letterSpacing: '0.04em',
    }}
  >
    <div
      style={{
        maxWidth: '80%',
        padding: '8px 16px',
        borderRadius: 4,
        background: 'rgba(0, 0, 0, 0.45)',
      }}
    >
      {`clipType '${clipType}' references unsupported asset type '${assetType ?? 'unknown'}' — clip will not appear in render`}
    </div>
  </AbsoluteFill>
);

const UnsupportedClipShaderExportBody: FC<{ clipId: string; shaderId: string }> = ({ clipId, shaderId }) => (
  <AbsoluteFill
    data-testid="unsupported-clip-shader-export"
    data-clip-id={clipId}
    data-shader-id={shaderId}
    style={{
      backgroundColor: 'rgba(20, 20, 20, 0.72)',
      borderTop: '2px solid #38BDF8',
      borderBottom: '2px solid #38BDF8',
      color: '#E0F2FE',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '12px 24px',
      textAlign: 'center',
      fontFamily:
        'ui-monospace, SFMono-Regular, "Roboto Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
    }}
  >
    <div
      style={{
        maxWidth: '80%',
        padding: '8px 16px',
        borderRadius: 4,
        background: 'rgba(0, 0, 0, 0.45)',
      }}
    >
      {`shader '${shaderId}' is browser-preview only — export requires a shader materializer that produces RenderMaterial`}
    </div>
  </AbsoluteFill>
);

type VisualClipProps = {
  clip: ResolvedTimelineClip;
  track: TrackDefinition;
  fps: number;
  predecessor?: ResolvedTimelineClip | null;
  effectRegistrySnapshot?: EffectRegistrySnapshot;
  shaderRegistrySnapshot?: ShaderEffectRegistrySnapshot;
  materialRefs?: readonly RenderMaterialRef[];
  materialStatuses?: readonly RenderPlannerMaterialStatus[];
  materialDiagnostics?: readonly CapabilityFinding[];
};

const getClipBoxStyle = (
  clip: ResolvedTimelineClip,
  track: TrackDefinition,
  compositionWidth: number,
  compositionHeight: number,
): CSSProperties => {
  const hasPositionOverride = (
    clip.x !== undefined
    || clip.y !== undefined
    || clip.width !== undefined
    || clip.height !== undefined
    || clip.cropTop !== undefined
    || clip.cropBottom !== undefined
    || clip.cropLeft !== undefined
    || clip.cropRight !== undefined
  );
  const fit = track.fit ?? 'contain';
  const style: CSSProperties = fit === 'manual' || hasPositionOverride
    ? {
        position: 'absolute',
        left: clip.x ?? 0,
        top: clip.y ?? 0,
        width: clip.width ?? compositionWidth,
        height: clip.height ?? compositionHeight,
        objectFit: 'cover',
        opacity: clip.opacity ?? 1,
      }
    : {
        width: '100%',
        height: '100%',
        objectFit: fit,
        opacity: clip.opacity ?? 1,
      };
  const cropTop = clip.cropTop ?? 0;
  const cropRight = clip.cropRight ?? 0;
  const cropBottom = clip.cropBottom ?? 0;
  const cropLeft = clip.cropLeft ?? 0;

  if (cropTop || cropRight || cropBottom || cropLeft) {
    style.clipPath = `inset(${cropTop * 100}% ${cropRight * 100}% ${cropBottom * 100}% ${cropLeft * 100}%)`;
  }

  return style;
};

const getIntrinsicMediaSize = (
  clip: ResolvedTimelineClip,
  compositionWidth: number,
  compositionHeight: number,
): { width: number; height: number } => {
  const resolution = clip.assetEntry?.resolution;
  if (resolution) {
    const parsed = parseResolution(resolution);
    if (Number.isFinite(parsed.width) && Number.isFinite(parsed.height) && parsed.width > 0 && parsed.height > 0) {
      return parsed;
    }
  }

  return {
    width: clip.width ?? compositionWidth,
    height: clip.height ?? compositionHeight,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

function materialRefsForClip(
  clip: ResolvedTimelineClip,
  materialRefs: readonly RenderMaterialRef[] | undefined,
): readonly RenderMaterialRef[] {
  if (materialRefs && materialRefs.length > 0) return materialRefs;
  const app = isRecord(clip.app) ? clip.app : undefined;
  const refs = app?.materialRefs ?? clip.params?.materialRefs;
  return Array.isArray(refs) ? refs.filter(isRecord) as unknown as readonly RenderMaterialRef[] : [];
}

function statusForMaterial(material: RenderMaterialRef, statuses: readonly RenderPlannerMaterialStatus[] | undefined): RenderPlannerMaterialStatus {
  return statuses?.find((status) => status.materialRefId === material.id)
    ?? {
      materialRefId: material.id,
      state: material.determinism === 'deterministic' ? 'resolved' : 'pending',
      detail: material.determinism === 'deterministic' ? undefined : { phase: 'queued' },
    };
}

function shouldRenderMaterialPlaceholder(status: RenderPlannerMaterialStatus): boolean {
  return status.state === 'missing' || status.state === 'pending' || status.state === 'stale' || status.state === 'failed';
}

const VisualAsset: FC<VisualClipProps & { evaluatedFrame: number }> = ({ clip, track, fps, evaluatedFrame }) => {
  const { width: compositionWidth, height: compositionHeight } = useVideoConfig();
  const previewMediaFailure = useOptionalPreviewMediaFailure();
  const modifierHost = useAppModifierHost();
  const hasModifiers = Boolean(clip.modifiers?.length);
  const wrapSpatialContent = (content: ReactNode, bounds: ModifierBounds): ReactNode => {
    if (!hasModifiers) return content;
    const modified = composeAppClipModifiers({ clip, content, frame: evaluatedFrame, fps, bounds, host: modifierHost });
    // Spatial crop is inside the modifier. Alpha, animation/effects and the
    // transition host remain outside it and still execute exactly once.
    return <AbsoluteFill style={{ opacity: clip.opacity ?? 1 }}>{modified}</AbsoluteFill>;
  };
  // SD-025: never silent-null when a built-in clip is missing its asset.
  // Render a labeled red band so the gap is obvious in preview/export.
  if (!clip.assetEntry) {
    admitAppModifierTarget(clip, false);
    return <MissingAssetBody clipId={clip.id} clipType={clip.clipType ?? 'media'} />;
  }

  const mediaSrc = getSanitizedMediaSrc(clip.assetEntry.src);
  if (!mediaSrc) {
    admitAppModifierTarget(clip, false);
    return <MissingAssetBody clipId={clip.id} clipType={clip.clipType ?? 'media'} />;
  }

  const clipVolume = getSanitizedVolume(clip.volume);
  const effectiveVolume = track.muted ? 0 : getSanitizedVolume(track.volume) * clipVolume;
  const playbackRate = getSanitizedPlaybackRate(clip.speed);
  const trimProps = getSanitizedMediaTrimProps(clip, fps);
  const retryToken = previewMediaFailure?.enabled
    ? previewMediaFailure.retryTokenFor(clip.id, mediaSrc)
    : 0;
  const posterUrl = clip.assetEntry.thumbnailUrl ?? null;
  const mediaFailure = previewMediaFailure?.enabled
      ? {
        onError: () => {
          previewMediaFailure.reportFailure({clipId: clip.id, source: mediaSrc, posterUrl}, retryToken);
          return 'fallback' as const;
        },
        onVideoFrame: retryToken > 0
          ? () => previewMediaFailure.markFrameReady(clip.id, mediaSrc, retryToken)
          : undefined,
        onLoadedData: retryToken > 0
          ? () => previewMediaFailure.markFrameReady(clip.id, mediaSrc, retryToken)
          : undefined,
        fallback: (style: CSSProperties) => (
          <ClipFailurePoster posterUrl={posterUrl} style={style} />
        ),
      }
    : null;
  const isImage = clip.assetEntry.type?.startsWith('image');
  const isVideo = clip.assetEntry.type?.startsWith('video');
  if (!isImage && !isVideo) {
    admitAppModifierTarget(clip, false);
    return (
      <UnsupportedAssetBody
        clipId={clip.id}
        clipType={clip.clipType ?? 'media'}
        assetType={clip.assetEntry.type}
      />
    );
  }
  const hasPositionOverride = (
    clip.x !== undefined
    || clip.y !== undefined
    || clip.width !== undefined
    || clip.height !== undefined
    || clip.cropTop !== undefined
    || clip.cropBottom !== undefined
    || clip.cropLeft !== undefined
    || clip.cropRight !== undefined
  );
  const fit = track.fit ?? 'contain';
  const useViewportLayout = fit === 'manual' || hasPositionOverride;

  if (!useViewportLayout) {
    const style = getClipBoxStyle(hasModifiers ? { ...clip, opacity: 1 } : clip, track, compositionWidth, compositionHeight);
    const bounds = hasModifiers ? mediaModifierBounds(clip, { ...track, scale: 1 },
      { ...clip.assetEntry, file: mediaSrc }, compositionWidth, compositionHeight) : undefined;
    const sharedStyle: CSSProperties = {
      ...style,
      mixBlendMode: track.blendMode && track.blendMode !== 'normal' ? track.blendMode : undefined,
    };

    if (isImage) {
      const content = <ReadinessImage src={mediaSrc} mediaId={clip.id} style={sharedStyle} crossOrigin="anonymous" />;
      return bounds ? wrapSpatialContent(content, bounds) : content;
    }

    const content = (
      <PlayerVideo
        clip={clip}
        fps={fps}
        clipId={clip.id}
        resetKey={`${clip.id}:${mediaSrc}:${trimProps.trimBefore}:${trimProps.trimAfter ?? 'none'}:${playbackRate}:${effectiveVolume}:${retryToken}`}
        fallback={mediaFailure?.fallback(sharedStyle) ?? null}
        onError={mediaFailure?.onError}
        src={mediaSrc}
        trimBefore={trimProps.trimBefore}
        trimAfter={trimProps.trimAfter}
        playbackRate={playbackRate}
        volume={effectiveVolume}
        muted={effectiveVolume <= 0}
        style={sharedStyle}
        data-astrid-retry-token={String(retryToken)}
        onVideoFrame={mediaFailure?.onVideoFrame}
        onLoadedData={mediaFailure?.onLoadedData}
      />
    );
    return bounds ? wrapSpatialContent(content, bounds) : content;
  }

  const fullBounds = {
    x: clip.x ?? 0,
    y: clip.y ?? 0,
    width: clip.width ?? compositionWidth,
    height: clip.height ?? compositionHeight,
  };
  const intrinsicSize = getIntrinsicMediaSize(clip, compositionWidth, compositionHeight);
  const viewportLayout = computeViewportMediaLayout({
    fullBounds,
    cropValues: {
      cropTop: clip.cropTop,
      cropBottom: clip.cropBottom,
      cropLeft: clip.cropLeft,
      cropRight: clip.cropRight,
    },
    compositionWidth,
    compositionHeight,
    intrinsicWidth: intrinsicSize.width,
    intrinsicHeight: intrinsicSize.height,
  });

  if (!viewportLayout) {
    admitAppModifierTarget(clip, false);
    return null;
  }

  const viewportStyle: CSSProperties = {
    position: 'absolute',
    left: viewportLayout.renderBounds.x,
    top: viewportLayout.renderBounds.y,
    width: viewportLayout.renderBounds.width,
    height: viewportLayout.renderBounds.height,
    overflow: 'hidden',
    opacity: hasModifiers ? 1 : clip.opacity ?? 1,
  };
  const mediaStyle: CSSProperties = {
    position: 'absolute',
    left: viewportLayout.mediaBounds.x,
    top: viewportLayout.mediaBounds.y,
    width: viewportLayout.mediaBounds.width,
    height: viewportLayout.mediaBounds.height,
    // Override Tailwind preflight's `img { max-width: 100%; height: auto; }`
    // which would squash the media to fit the viewport container. The media
    // must overflow the container (clipped by overflow:hidden) for the
    // manual cover layout to work correctly.
    maxWidth: 'none',
    maxHeight: 'none',
    mixBlendMode: track.blendMode && track.blendMode !== 'normal' ? track.blendMode : undefined,
  };

  if (isImage) {
    return wrapSpatialContent((
      <div style={viewportStyle}>
        <ReadinessImage src={mediaSrc} mediaId={clip.id} style={mediaStyle} crossOrigin="anonymous" />
      </div>
    ), { status: 'known', rect: viewportLayout.renderBounds });
  }

  return wrapSpatialContent((
    <div style={viewportStyle}>
      <PlayerVideo
        clip={clip}
        fps={fps}
        clipId={clip.id}
        resetKey={`${clip.id}:${mediaSrc}:${trimProps.trimBefore}:${trimProps.trimAfter ?? 'none'}:${playbackRate}:${effectiveVolume}:viewport:${retryToken}`}
        fallback={mediaFailure?.fallback({position: 'absolute', inset: 0}) ?? null}
        onError={mediaFailure?.onError}
        src={mediaSrc}
        trimBefore={trimProps.trimBefore}
        trimAfter={trimProps.trimAfter}
        playbackRate={playbackRate}
        volume={effectiveVolume}
        muted={effectiveVolume <= 0}
        style={mediaStyle}
        data-astrid-retry-token={String(retryToken)}
        onVideoFrame={mediaFailure?.onVideoFrame}
        onLoadedData={mediaFailure?.onLoadedData}
      />
    </div>
  ), { status: 'known', rect: viewportLayout.renderBounds });
};

const ClipFailurePoster: FC<{posterUrl: string | null; style: CSSProperties}> = ({posterUrl, style}) => {
  const [posterFailed, setPosterFailed] = useState(false);
  return (
    <div
      data-astrid-preview-failed-poster="true"
      style={{
        ...style,
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        background: '#fffefa',
      }}
    >
      {posterUrl && !posterFailed && (
        <img
          src={posterUrl}
          alt=""
          onError={() => setPosterFailed(true)}
          style={{width: '100%', height: '100%', objectFit: 'contain'}}
        />
      )}
    </div>
  );
};

export const VisualClip: FC<VisualClipProps> = ({
  clip,
  track,
  fps,
  effectRegistrySnapshot,
  shaderRegistrySnapshot,
  materialRefs,
  materialStatuses,
  materialDiagnostics,
}) => {
  const environment = useRemotionEnvironment();
  const providerRegistryContext = useOptionalEffectRegistryContext();
  const registrySnapshot = effectRegistrySnapshot ?? providerRegistryContext?.snapshot;
  const providerShaderRegistryContext = useOptionalShaderEffectRegistryContext();
  const shaderSnapshot = shaderRegistrySnapshot ?? providerShaderRegistryContext?.snapshot;
  const { width: compositionWidth, height: compositionHeight } = useVideoConfig();

  // Transition registry: resolve through the unified catalog (built-ins +
  // provider-scoped contributed transitions). No silent fallback to crossfade
  // for missing or unrenderable IDs.
  const transitionRegistryContext = useOptionalTransitionRegistryContext();
  const mergedTransitionSnapshot = useMemo(
    () => createTransitionSnapshot(transitionRegistryContext?.snapshot),
    [transitionRegistryContext?.snapshot],
  );

  if (clip.clipType === 'effect-layer') {
    return null;
  }

  const pendingMaterial = materialRefsForClip(clip, materialRefs)
    .map((material) => ({ material, status: statusForMaterial(material, materialStatuses) }))
    .find(({ status }) => shouldRenderMaterialPlaceholder(status));

  if (pendingMaterial) {
    return (
      <PendingMaterialPlaceholder
        clipId={clip.id}
        material={pendingMaterial.material}
        status={pendingMaterial.status}
        diagnostics={materialDiagnostics?.filter((diagnostic) =>
          diagnostic.materialRefId === pendingMaterial.material.id || diagnostic.clipId === clip.id)}
      />
    );
  }

  const durationInFrames = getClipDurationInFrames(clip, fps);
  const frame = useCurrentFrame();
  const shader = getTimelineClipShader(clip);
  if (shader) admitAppModifierTarget(clip, false);
  const shaderRecord = shader
    ? shaderSnapshot?.get(shader.shaderId, shader.extensionId)
    : undefined;
  const renderBrowserShaderPreview = Boolean(
    shader
    && shader.enabled !== false
    && shaderRecord
    && !environment.isRendering
    && !environment.isClientSideRendering,
  );
  const renderUnsupportedShaderExport = Boolean(
    shader
    && shader.enabled !== false
    && (environment.isRendering || environment.isClientSideRendering),
  );

  let transitionStyle: CSSProperties | undefined;
  if (clip.transition) {
    const record = resolveTransition(clip.transition.type, mergedTransitionSnapshot);
    if (record) {
      const transitionProgress = interpolate(
        frame,
        [0, Math.max(1, secondsToFrames(clip.transition.duration, fps))],
        [0, 1],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        },
      );
      const renderer = record.renderer;
      const params = clip.transition.params ?? {};
      if (typeof renderer === 'function') {
        transitionStyle = (renderer as (progress: number, params: Record<string, unknown>) => CSSProperties)(
          transitionProgress,
          params,
        );
      } else {
        // Object-style renderer (static CSSProperties)
        transitionStyle = renderer as CSSProperties;
      }
    } else {
      // Transition ID not found in catalog — render diagnostic placeholder
      // and skip the clip content wrapper (the clip still renders, but
      // without transition styling). No crossfade fallback.
      return <MissingTransitionBody clipId={clip.id} transitionType={clip.transition.type} />;
    }
  }

  const content: ReactNode = (
    <AbsoluteFill style={{ overflow: 'hidden', ...transitionStyle }}>
      <VisualAsset clip={clip} track={track} fps={fps} evaluatedFrame={frame} />
      {renderUnsupportedShaderExport && shader ? (
        <UnsupportedClipShaderExportBody clipId={clip.id} shaderId={shader.shaderId} />
      ) : null}
      {renderBrowserShaderPreview && shader && shaderRecord ? (
        <ClipShaderPreviewCanvas
          shader={shader}
          record={shaderRecord}
          timeSeconds={frame / fps}
          frame={frame}
          width={compositionWidth}
          height={compositionHeight}
          testId="visual-clip-shader-preview"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </AbsoluteFill>
  );

  return <>{wrapWithClipEffects(content, clip, durationInFrames, fps, registrySnapshot)}</>;
};

const LazyGuard: FC<{ durationInFrames: number; children: ReactNode }> = ({ durationInFrames, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bufferFrames = Math.max(1, Math.round(fps));

  if (frame < -bufferFrames || frame > durationInFrames + bufferFrames) {
    return null;
  }

  return <>{children}</>;
};

export const VisualClipSequence: FC<VisualClipProps> = ({
  clip,
  track,
  fps,
  predecessor,
  effectRegistrySnapshot,
  shaderRegistrySnapshot,
  materialRefs,
  materialStatuses,
  materialDiagnostics,
}) => {
  const evaluation = useContext(PlayerClipEvaluationContext);
  const sharedAudio = evaluation?.clipId === clip.id && clip.assetEntry?.type?.startsWith('video')
    && (evaluation.plan.fadeIn || evaluation.plan.fadeOut || evaluation.plan.drawDuration > evaluation.plan.ownDuration);
  const durationInFrames = getClipDurationInFrames(clip, fps);
  const transitionFrames = predecessor && clip.transition
    ? secondsToFrames(clip.transition.duration, fps)
    : 0;
  const from = Math.max(0, secondsToFrames(clip.at, fps) - transitionFrames);
  // Extend by transitionFrames so the clip isn't cut short when `from` is
  // pulled back for a transition-in, plus 1 overlap frame so the outgoing
  // clip stays mounted while the next clip's <Video> element loads.
  const canonicalTiming = clip.app?.canonicalTiming as
    | { occurrenceStartMs?: unknown; occurrenceDurationMs?: unknown }
    | undefined;
  const canonicalEndMs = typeof canonicalTiming?.occurrenceStartMs === 'number'
    && typeof canonicalTiming.occurrenceDurationMs === 'number'
    ? canonicalTiming.occurrenceStartMs + canonicalTiming.occurrenceDurationMs
    : undefined;
  // Remotion renders Sequence frames in [from, from + durationInFrames).
  // Transition-in pre-roll changes `from`, and the legacy overlap frame
  // extends the visual past a canonical occurrence's excluded end. Canonical
  // clips therefore end at the actual half-open boundary after expansion.
  const effectiveDuration = canonicalEndMs === undefined
    ? durationInFrames + transitionFrames + 1
    : Math.max(0, Math.min(
        durationInFrames + transitionFrames,
        Math.ceil((canonicalEndMs / 1000) * fps) - from,
      ));

  return (
    <PlayerClipSequence clipId={clip.id}
      audio={sharedAudio ? <AudioTrack track={track} clips={[clip]} fps={fps} /> : undefined}
      key={clip.id}
      from={from}
      durationInFrames={effectiveDuration}
      premountFor={fps}
    >
      <LazyGuard durationInFrames={effectiveDuration}>
        <VisualClip
          clip={clip}
          track={track}
          fps={fps}
          predecessor={predecessor}
          effectRegistrySnapshot={effectRegistrySnapshot}
          shaderRegistrySnapshot={shaderRegistrySnapshot}
          materialRefs={materialRefs}
          materialStatuses={materialStatuses}
          materialDiagnostics={materialDiagnostics}
        />
      </LazyGuard>
    </PlayerClipSequence>
  );
};
