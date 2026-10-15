import type { DataProvider } from '@/tools/video-editor/data/DataProvider.ts';
import { TimelineVersionConflictError, type TimelineHeadRevision } from '@/tools/video-editor/data/DataProvider.ts';
import type { EditCommand } from '@/integrations/runtime/generated.ts';
import { propertyGestureCommands } from '../commands/semanticGestures.ts';
import type { AssetRegistry, TimelineClip, TimelineConfig } from '@/tools/video-editor/types/index.ts';
import { getClipTimelineDuration } from '@/tools/video-editor/lib/config-utils.ts';
import {
  assertValidReighElementOperation,
  type ReighAgentElementContext,
  type ReighElementCatalogEntry,
  type ReighElementOperation,
  type ReighElementRef,
} from './element-contract.ts';
import { tryCompileSequenceComponentAsync } from '@/tools/video-editor/sequences/compileSequenceComponent.tsx';
import { validateEffectParameterSchema } from '@/tools/video-editor/runtime/effectRegistrationService.ts';

type TimelineDocument = {
  config: unknown;
  registry: unknown;
  config_version: number;
  head?: TimelineHeadRevision;
};

export type ReighElementOperationResult = {
  operation: ReighElementOperation['name'];
  config_version?: number;
  element?: ReighElementCatalogEntry;
  elements?: readonly ReighElementCatalogEntry[];
  draft?: ReighElementCatalogEntry;
  config?: TimelineConfig;
  registry?: AssetRegistry;
  validation?: {
    valid: boolean;
    diagnostics: readonly { severity: 'error' | 'warning' | 'info'; path: string; message: string }[];
    capabilities: {
      browserPreview: 'supported' | 'blocked' | 'unknown';
      astridExport: 'supported' | 'blocked' | 'unknown';
      workerExport: 'supported' | 'blocked' | 'unknown';
    };
  };
};

type ElementTimelineDocument = {
  config: unknown;
  registry: unknown;
  config_version: number;
  head?: TimelineHeadRevision;
};

export type ElementTimelineRoutes = {
  get(timelineId: string): Promise<ElementTimelineDocument>;
  save(
    timelineId: string,
    input: { config: unknown; registry: unknown; expectedVersion: number; head?: TimelineHeadRevision; editCommands?: readonly EditCommand[] },
  ): Promise<ElementTimelineDocument>;
};

/**
 * Keep element mutations on the same provider and CAS boundary as ordinary
 * editor saves. In particular, the Workspace Runtime editor must not fall
 * back to Astrid's retired timeline bridge routes just to apply a catalog
 * element.
 */
export function createElementTimelineRoutes(
  provider: Pick<DataProvider, 'loadTimeline' | 'loadAssetRegistry' | 'saveTimeline' | 'saveTimelineAtHead'>,
  assertAuthority: () => void = () => {},
): ElementTimelineRoutes {
  return {
    async get(timelineId) {
      assertAuthority();
      const timeline = await provider.loadTimeline(timelineId);
      assertAuthority();
      const registry = await provider.loadAssetRegistry(timelineId);
      // DataProvider exposes the registry separately. Re-read the version
      // after that read so a concurrent save cannot pair one head's config
      // with another head's registry for the following CAS mutation.
      assertAuthority();
      const confirmedTimeline = await provider.loadTimeline(timelineId);
      assertAuthority();
      if (confirmedTimeline.configVersion !== timeline.configVersion
        || confirmedTimeline.head?.headRevisionId !== timeline.head?.headRevisionId
        || confirmedTimeline.head?.projectId !== timeline.head?.projectId
        || confirmedTimeline.head?.timelineId !== timeline.head?.timelineId) {
        throw new ReighElementOperationError(
          `Timeline changed while loading element operation data: ${timelineId}`,
        );
      }
      return {
        config: confirmedTimeline.config,
        registry,
        config_version: confirmedTimeline.configVersion,
        ...(confirmedTimeline.head ? { head: structuredClone(confirmedTimeline.head) } : {}),
      };
    },
    async save(timelineId, input) {
      assertAuthority();
      const config = input.config as TimelineConfig;
      const registry = input.registry as AssetRegistry;
      if (provider.saveTimelineAtHead) {
        if (!input.head) throw new TimelineVersionConflictError('Element operation requires its captured timeline head.');
        const receipt = await provider.saveTimelineAtHead(
          timelineId, config, input.head, registry, undefined, input.editCommands,
        );
        return { config, registry, config_version: receipt.configVersion, head: receipt.head };
      }
      const configVersion = await provider.saveTimeline(
        timelineId,
        config,
        input.expectedVersion,
        registry,
      );
      return { config, registry, config_version: configVersion };
    },
  };
}

export class ReighElementOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReighElementOperationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asTimelineConfig(value: unknown): TimelineConfig {
  if (!isRecord(value) || !Array.isArray(value.clips)) {
    throw new ReighElementOperationError('Astrid returned a timeline without a clips array');
  }
  return value as unknown as TimelineConfig;
}

function asAssetRegistry(value: unknown): AssetRegistry {
  return (isRecord(value) ? value : {}) as AssetRegistry;
}

function findElement(
  context: ReighAgentElementContext,
  ref: ReighElementRef,
  options: { allowDraft?: boolean } = {},
): ReighElementCatalogEntry {
  const entry = context.catalog.find((candidate) => candidate.id === ref.id && candidate.kind === ref.kind
    && (ref.packId === undefined || candidate.packId === ref.packId));
  if (!entry) {
    throw new ReighElementOperationError(`Element is not registered in the Astrid catalog: ${ref.kind}/${ref.id}`);
  }
  if (entry.revision !== ref.revision) {
    throw new ReighElementOperationError(
      `Element revision is stale for ${ref.id}: expected ${entry.revision}, received ${ref.revision}`,
    );
  }
  if (!options.allowDraft && entry.publication !== 'published') {
    throw new ReighElementOperationError(`Element ${ref.id} is not published for timeline use`);
  }
  return entry;
}

function requireClip(config: TimelineConfig, clipId: string): TimelineClip {
  const clip = config.clips.find((candidate) => candidate.id === clipId);
  if (!clip) throw new ReighElementOperationError(`Timeline clip not found: ${clipId}`);
  return clip;
}

function replaceClip(config: TimelineConfig, clipId: string, update: (clip: TimelineClip) => TimelineClip): TimelineConfig {
  let found = false;
  const clips = config.clips.map((clip) => {
    if (clip.id !== clipId) return clip;
    found = true;
    return update(clip);
  });
  if (!found) throw new ReighElementOperationError(`Timeline clip not found: ${clipId}`);
  return { ...config, clips };
}

function nextAdjacentClip(config: TimelineConfig, fromClipId: string, toClipId?: string): TimelineClip {
  const from = requireClip(config, fromClipId);
  if (toClipId) {
    const explicit = requireClip(config, toClipId);
    if (explicit.track !== from.track || Math.abs((from.at + clipDuration(from)) - explicit.at) >= 0.001) {
      throw new ReighElementOperationError('Transitions require adjacent clips on the same track');
    }
    return explicit;
  }
  const candidates = config.clips
    .filter((clip) => clip.track === from.track && clip.id !== from.id)
    .sort((left, right) => left.at - right.at);
  const next = candidates.find((clip) => Math.abs((from.at + clipDuration(from)) - clip.at) < 0.001);
  if (!next) throw new ReighElementOperationError(`No adjacent clip follows ${fromClipId}`);
  return next;
}

function visualTrackId(config: TimelineConfig, preferred?: string): string {
  if (preferred && config.tracks?.some((track) => track.id === preferred)) return preferred;
  return config.tracks?.find((track) => track.kind === 'visual')?.id
    ?? config.tracks?.[0]?.id
    ?? 'elements';
}

function uniqueElementClipId(config: TimelineConfig, elementId: string, at: number): string {
  const base = `element-${elementId}-${Math.round(at * 1000)}`;
  if (!config.clips.some((clip) => clip.id === base)) return base;
  let suffix = 2;
  while (config.clips.some((clip) => clip.id === `${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function clipDuration(clip: TimelineClip): number {
  return getClipTimelineDuration(clip);
}

function transitionType(id: string): string {
  // Persist the Astrid catalog identity. The browser renderer accepts the
  // historical `crossfade` alias at its resolution boundary, but the timeline
  // must retain the stable Astrid spelling for export and revision pinning.
  return id;
}

function transitionDurationFrames(
  entry: ReighElementCatalogEntry,
  requested: number | undefined,
): number {
  const defaultFrames = entry.defaults?.durationFrames;
  const frames = requested
    ?? (typeof defaultFrames === 'number' && Number.isInteger(defaultFrames) ? defaultFrames : 8);
  if (!Number.isInteger(frames) || frames <= 0) {
    throw new ReighElementOperationError('Transition duration must be a positive integer number of frames');
  }
  return frames;
}

function assertTransitionFits(
  from: TimelineClip,
  to: TimelineClip,
  durationFrames: number,
  fps: number,
): void {
  const shortestClipFrames = Math.min(clipDuration(from), clipDuration(to)) * fps;
  if (shortestClipFrames <= 0 || durationFrames > shortestClipFrames + 0.0001) {
    throw new ReighElementOperationError(
      `Transition duration ${durationFrames} frames exceeds the shorter adjacent clip (${Math.max(0, Math.floor(shortestClipFrames))} frames)`,
    );
  }
}

function applyTimelineOperation(
  context: ReighAgentElementContext,
  config: TimelineConfig,
  operation: Extract<ReighElementOperation, { name: `timeline.${string}` }>,
): TimelineConfig {
  switch (operation.name) {
    case 'timeline.apply_element': {
      const entry = findElement(context, operation.element, { allowDraft: true });
      if (operation.placement === 'between-clips' || entry.kind === 'transition') {
        if (entry.kind !== 'transition' || operation.placement !== 'between-clips') {
          throw new ReighElementOperationError('Transitions must use placement between-clips and timeline.apply_transition');
        }
        throw new ReighElementOperationError('Use timeline.apply_transition for a between-clips element');
      }
      if (operation.placement === 'clip') {
        if (!operation.clip_id) throw new ReighElementOperationError('Clip placement requires clip_id');
        return replaceClip(config, operation.clip_id, (clip) => {
          return {
            ...clip,
            elementRef: operation.element,
            ...(entry.kind === 'animation'
              ? {
                  // Astrid's canonical timeline schema carries animation
                  // refs in the phase slots. Applying an animation from the
                  // library uses entrance as the ergonomic default.
                  entrance: {
                    type: operation.element.id,
                    // Match TimelineRenderer's established fallback when the
                    // operation does not provide an explicit entrance span.
                    duration: 0.4,
                    ...(operation.params ? { params: operation.params } : {}),
                  },
                }
              : {}),
            ...(operation.params ? { params: { ...(clip.params ?? {}), ...operation.params } } : {}),
          };
        });
      }

      const target = operation.clip_id ? requireClip(config, operation.clip_id) : undefined;
      const at = operation.at ?? target?.at ?? 0;
      const duration = operation.duration ?? (target ? clipDuration(target) : 1);
      if (!Number.isFinite(at) || at < 0) throw new ReighElementOperationError('Overlay placement requires a non-negative at');
      if (!Number.isFinite(duration) || duration <= 0) throw new ReighElementOperationError('Overlay placement requires a positive duration');
      const overlay: TimelineClip = {
        id: uniqueElementClipId(config, operation.element.id, at),
        at,
        track: visualTrackId(config, target?.track),
        // Keep the Astrid element id in the ordinary visual dispatch path.
        // `effect-layer` is the legacy Reigh wrapper and cannot carry a
        // revision-pinned Astrid component by itself.
        clipType: entry.kind === 'effect' ? entry.id : 'effect-layer',
        hold: duration,
        elementRef: operation.element,
        ...(operation.params ? { params: operation.params } : {}),
      };
      return { ...config, clips: [...config.clips, overlay] };
    }
    case 'timeline.update_element':
      if (operation.element) findElement(context, operation.element, { allowDraft: true });
      return replaceClip(config, operation.clip_id, (clip) => ({
        ...clip,
        ...(operation.element ? { elementRef: operation.element } : {}),
        ...(operation.params ? { params: { ...(clip.params ?? {}), ...operation.params } } : {}),
      }));
    case 'timeline.remove_element':
      return replaceClip(config, operation.clip_id, (clip) => {
        const { elementRef: _elementRef, ...withoutElement } = clip;
        const removedId = clip.elementRef?.id;
        const entrance = withoutElement.entrance;
        const nextEntrance = removedId && entrance?.type === removedId
          ? undefined
          : entrance;
        return {
          ...withoutElement,
          ...(nextEntrance ? { entrance: nextEntrance } : { entrance: undefined }),
        };
      });
    case 'timeline.set_clip_fade':
      return replaceClip(config, operation.clip_id, (clip) => ({
        ...clip,
        effects: {
          ...(clip.effects && !Array.isArray(clip.effects) ? clip.effects : {}),
          ...(operation.fade_in === undefined ? {} : { fade_in: operation.fade_in }),
          ...(operation.fade_out === undefined ? {} : { fade_out: operation.fade_out }),
        },
        ...(operation.fade_in === undefined ? {} : { entrance: { type: 'fade', duration: operation.fade_in } }),
        ...(operation.fade_out === undefined ? {} : { exit: { type: 'fade-out', duration: operation.fade_out } }),
      }));
    case 'timeline.apply_transition': {
      const transitionEntry = findElement(context, operation.transition, { allowDraft: true });
      if (transitionEntry.kind !== 'transition') {
        throw new ReighElementOperationError(`${operation.transition.id} is not a transition`);
      }
      const from = requireClip(config, operation.from_clip);
      const to = nextAdjacentClip(config, operation.from_clip, operation.to_clip);
      if (from.track !== to.track || Math.abs((from.at + clipDuration(from)) - to.at) >= 0.001) {
        throw new ReighElementOperationError('Transitions require adjacent clips on the same track');
      }
      const fps = config.output?.fps ?? 30;
      const durationFrames = transitionDurationFrames(transitionEntry, operation.duration_frames);
      assertTransitionFits(from, to, durationFrames, fps);
      return replaceClip(config, to.id, (clip) => ({
        ...clip,
        elementRef: operation.transition,
        transition: {
          type: transitionType(operation.transition.id),
          duration: durationFrames / fps,
          revision: operation.transition.revision,
          ...(operation.params ? { params: operation.params } : {}),
        },
      }));
    }
    case 'timeline.update_transition': {
      const to = nextAdjacentClip(config, operation.from_clip, operation.to_clip);
      const from = requireClip(config, operation.from_clip);
      const transitionEntry = operation.transition
        ? findElement(context, operation.transition, { allowDraft: true })
        : undefined;
      if (transitionEntry && transitionEntry.kind !== 'transition') {
        throw new ReighElementOperationError(`${operation.transition?.id} is not a transition`);
      }
      return replaceClip(config, to.id, (clip) => {
        if (!clip.transition && !operation.transition) {
          throw new ReighElementOperationError(`No transition is applied to ${to.id}`);
        }
        const fps = config.output?.fps ?? 30;
        const durationFrames = transitionDurationFrames(
          transitionEntry ?? context.catalog.find((candidate) => candidate.id === clip.transition?.type && candidate.kind === 'transition') ?? {
            id: clip.transition?.type ?? 'transition',
            label: clip.transition?.type ?? 'transition',
            kind: 'transition',
            placement: 'between-clips',
            revision: clip.transition?.revision ?? 'legacy',
            capabilities: { browserPreview: 'supported', astridExport: 'unknown', workerExport: 'unknown' },
            publication: 'published',
          },
          operation.duration_frames,
        );
        assertTransitionFits(from, to, durationFrames, fps);
        return {
          ...clip,
          ...(operation.transition ? { elementRef: operation.transition } : {}),
          transition: {
            ...(clip.transition ?? { type: transitionType(operation.transition?.id ?? 'cross-fade'), duration: 8 / fps }),
            ...(operation.transition ? { type: transitionType(operation.transition.id), revision: operation.transition.revision } : {}),
            duration: durationFrames / fps,
            ...(operation.params ? { params: operation.params } : {}),
          },
        };
      });
    }
    case 'timeline.remove_transition':
      return replaceClip(config, nextAdjacentClip(config, operation.from_clip).id, (clip) => {
        const { transition: _transition, elementRef: _elementRef, ...withoutTransition } = clip;
        return withoutTransition;
      });
  }
}

/**
 * The one execution boundary for Elements mutations.
 *
 * The adapter deliberately accepts the existing timeline route rather than a
 * second persistence path: every mutation reads the current document and
 * performs exactly one expected-version save. A stale save therefore enters
 * the same CAS/conflict machinery as ordinary editor edits.
 */
export class AstridElementOperationAdapter {
  private readonly drafts = new Map<string, ReighElementCatalogEntry>();
  private readonly draftSources = new Map<string, string>();
  private readonly draftDependencies = new Map<string, readonly string[]>();
  private readonly validatedDrafts = new Map<string, ReighElementOperationResult['validation']>();

  constructor(
    private readonly context: ReighAgentElementContext,
    private readonly routes: ElementTimelineRoutes,
    private readonly projectSlug: string,
  ) {}

  async execute(rawOperation: unknown): Promise<ReighElementOperationResult> {
    assertValidReighElementOperation(rawOperation);
    const operation = rawOperation;

    if ('project' in operation && operation.project !== this.projectSlug) {
      throw new ReighElementOperationError(
        `Element operation project ${operation.project} does not match ${this.projectSlug}`,
      );
    }

    switch (operation.name) {
      case 'elements.list':
        return { operation: operation.name, elements: this.context.catalog };
      case 'elements.describe': {
        const element = this.context.catalog.find((candidate) => candidate.id === operation.element_id);
        if (!element) throw new ReighElementOperationError(`Element is not registered: ${operation.element_id}`);
        return { operation: operation.name, element };
      }
      case 'elements.create_draft': {
        const draft: ReighElementCatalogEntry = {
          id: operation.id,
          label: operation.label,
          kind: operation.kind,
          placement: operation.kind === 'transition' ? 'between-clips' : 'overlay',
          ...(operation.description ? { description: operation.description } : {}),
          revision: `draft-${operation.id}`,
          ...(operation.schema ? { schema: operation.schema } : {}),
          ...(operation.defaults ? { defaults: operation.defaults } : {}),
          capabilities: { browserPreview: 'unknown', astridExport: 'blocked', workerExport: 'blocked' },
          publication: 'draft',
        };
        this.drafts.set(draft.id, draft);
        this.draftSources.set(draft.id, operation.source);
        this.draftDependencies.set(draft.id, operation.dependencies ?? []);
        return { operation: operation.name, draft };
      }
      case 'elements.validate': {
        const draft = this.drafts.get(operation.draft_id);
        if (!draft) throw new ReighElementOperationError(`Draft is not registered in this session: ${operation.draft_id}`);
        const source = this.draftSources.get(draft.id);
        if (!source) throw new ReighElementOperationError(`Draft source is not registered in this session: ${draft.id}`);
        const diagnostics: { severity: 'error' | 'warning' | 'info'; path: string; message: string }[] = [];
        if (draft.schema) {
          for (const diagnostic of validateEffectParameterSchema(draft.schema)) {
            diagnostics.push({ severity: diagnostic.severity, path: diagnostic.code, message: diagnostic.message });
          }
        }
        if ((this.draftDependencies.get(draft.id) ?? []).length > 0) {
          diagnostics.push({
            severity: 'error',
            path: 'dependencies',
            message: 'Draft dependencies are not available to the browser preview sandbox; inline the component source.',
          });
        }
        const compilation = await tryCompileSequenceComponentAsync(source);
        if (!compilation.ok) {
          diagnostics.push({
            severity: 'error',
            path: 'source',
            message: `Remotion source did not compile: ${compilation.error}`,
          });
        }
        const validation = {
          valid: !diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
          diagnostics,
          capabilities: {
            browserPreview: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'blocked' as const : 'supported' as const,
            astridExport: 'blocked' as const,
            workerExport: 'blocked' as const,
          },
        };
        this.validatedDrafts.set(draft.id, validation);
        const validatedDraft = { ...draft, capabilities: validation.capabilities };
        this.drafts.set(draft.id, validatedDraft);
        return { operation: operation.name, draft: validatedDraft, validation };
      }
      case 'elements.publish': {
        const draft = this.drafts.get(operation.element_id);
        if (!draft || draft.revision !== operation.revision) {
          throw new ReighElementOperationError(`Draft revision is not available: ${operation.element_id}`);
        }
        if (this.validatedDrafts.get(draft.id)?.valid !== true) {
          throw new ReighElementOperationError(`Draft ${draft.id} must pass elements.validate before publish`);
        }
        const published = { ...draft, publication: 'published' as const };
        this.drafts.set(published.id, published);
        return { operation: operation.name, element: published };
      }
      default:
        return this.executeTimelineMutation(operation);
    }
  }

  private async executeTimelineMutation(
    operation: Extract<ReighElementOperation, { name: `timeline.${string}` }>,
  ): Promise<ReighElementOperationResult> {
    const draftRef = operation.name === 'timeline.apply_element'
      ? operation.element
      : operation.name === 'timeline.update_element'
        ? operation.element
        : operation.name === 'timeline.apply_transition'
          ? operation.transition
          : operation.name === 'timeline.update_transition'
            ? operation.transition
            : undefined;
    if (draftRef && this.draftSources.has(draftRef.id) && this.validatedDrafts.get(draftRef.id)?.valid !== true) {
      throw new ReighElementOperationError(`Draft ${draftRef.id} must pass elements.validate before timeline use`);
    }
    const document = await this.routes.get(operation.timeline) as TimelineDocument;
    if (document.config_version !== operation.expected_version) {
      throw new ReighElementOperationError(
        `Stale timeline version: expected ${operation.expected_version}, received ${document.config_version}`,
      );
    }
    const nextConfigBeforeSources = applyTimelineOperation(
      {
        ...this.context,
        catalog: [...this.context.catalog, ...this.drafts.values()],
      },
      asTimelineConfig(document.config),
      operation,
    );
    const nextConfig = this.attachDraftSource(nextConfigBeforeSources, operation);
    // Only parameter-only updates have an admitted command with identical
    // semantics. Ref/source/transition/overlay mutations remain explicit fallback.
    const editCommands = operation.name === 'timeline.update_element' && !operation.element && operation.params
      ? propertyGestureCommands({ config: asTimelineConfig(document.config) }, operation.clip_id, {
          params: operation.params,
        }, { mergeParams: true })
      : undefined;
    const saved = await this.routes.save(operation.timeline, {
      config: nextConfig,
      registry: asAssetRegistry(document.registry),
      expectedVersion: operation.expected_version,
      ...(document.head ? { head: document.head } : {}),
      ...(editCommands?.length ? { editCommands } : {}),
    }) as TimelineDocument;
    return {
      operation: operation.name,
      config_version: saved.config_version,
      config: asTimelineConfig(saved.config),
      registry: asAssetRegistry(saved.registry),
    };
  }

  private attachDraftSource(
    config: TimelineConfig,
    operation: Extract<ReighElementOperation, { name: `timeline.${string}` }>,
  ): TimelineConfig {
    const ref = operation.name === 'timeline.apply_element'
      ? operation.element
      : operation.name === 'timeline.update_element'
        ? operation.element
        : operation.name === 'timeline.apply_transition'
          ? operation.transition
          : operation.name === 'timeline.update_transition'
            ? operation.transition
            : undefined;
    if (!ref) return config;
    const source = this.draftSources.get(ref.id);
    if (!source) return config;
    const app = isRecord(config.app) ? config.app : {};
    const elements = isRecord(app.elements) ? app.elements : {};
    const nextConfig: TimelineConfig = {
      ...config,
      app: {
        ...app,
        elements: {
          ...elements,
          [ref.id]: { kind: ref.kind, revision: ref.revision, source },
        },
      },
    };
    // The pinned elementRef is the canonical dispatch key. Do not create a
    // second `remotion_module` lane here: that legacy generation tag is kept
    // readable for old timelines, while new agent-authored elements resolve
    // from the timeline's element registry through the normal clip shape.
    return nextConfig;
  }
}
