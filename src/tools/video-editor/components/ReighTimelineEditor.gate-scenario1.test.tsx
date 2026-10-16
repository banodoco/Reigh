// @vitest-environment jsdom
import React from 'react';
import { AgentChatProvider } from '@/shared/contexts/AgentChatContext.tsx';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createFakeIndexedDB, resetFakeIndexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '@/tools/video-editor/data/shotComposition.fixture.json';
import { createShotCompositionAdapter } from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import { createTimelineStore, TimelineStoreProvider } from '@/tools/video-editor/hooks/timelineStore.ts';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import { VideoEditorRuntimeProvider } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import { ReighTimelineEditor } from './ReighTimelineEditor.tsx';
import * as shotTimelineDataProvider from '@/tools/travel-between-images/components/shotTimelineDataProvider.ts';

vi.stubGlobal('indexedDB', createFakeIndexedDB());

const mocks = vi.hoisted(() => ({
  createShot: vi.fn(),
  navigateToShot: vi.fn(),
  pinGroup: vi.fn(),
  shots: [] as unknown[],
  selectedProjectId: 'project-gate-scenario1',
  loadTimeline: vi.fn(),
  loadAssetRegistry: vi.fn(),
  onResolve: vi.fn(({ file }: { file: string }) => `https://bridge.test/${file}`),
  runtimeProviderWrites: [] as Array<{ boundary: string; args: unknown[] }>,
}));

// Keep the parent editor's unrelated host integrations inert while leaving
// TimelineEditorCore and the canonical occurrence gesture real.
vi.mock('@/tools/video-editor/hooks/usePerfDiagnostics.ts', () => ({ useRenderDiagnostic: () => undefined }));
vi.mock('@/tools/video-editor/hooks/useClipDrag.ts', () => ({ useClipDrag: () => ({ dragSessionRef: { current: null } }) }));
vi.mock('@/tools/video-editor/hooks/useMarqueeSelect.ts', () => ({ useMarqueeSelect: () => ({ marqueeRect: null, onPointerDown: vi.fn() }) }));
vi.mock('@/tools/video-editor/hooks/useStaleVariants.ts', () => ({
  useStaleVariants: () => ({
    staleAssetKeys: new Set<string>(), dismissedAssetKeys: new Set<string>(), generationAssetKeys: new Set<string>(),
    dismissAsset: vi.fn(), updateAssetToCurrentVariant: vi.fn(), applyVariantToAsset: vi.fn(),
  }),
}));
vi.mock('@/tools/video-editor/hooks/useActiveTaskClips.ts', () => ({ useActiveTaskClips: () => ({ activeTaskAssetKeys: new Set<string>() }) }));
vi.mock('@/tools/video-editor/hooks/useAddVariantAsGeneration.ts', () => ({
  useAddVariantAsGeneration: () => ({ addVariantAsGenerationAfterClip: vi.fn(), isPending: false, isAddingVariantAsGenerationPending: () => false }),
}));
vi.mock('@/shared/hooks/shotCreation/useShotCreation.ts', () => ({
  useShotCreation: () => ({ createShot: mocks.createShot, isCreating: false, lastCreatedShot: null, clearLastCreated: vi.fn() }),
}));
vi.mock('@/shared/hooks/shots/useShotNavigation.ts', () => ({
  useShotNavigation: () => ({
    navigateToShot: mocks.navigateToShot, navigateToShotEditor: vi.fn(),
    navigateToNextShot: vi.fn(), navigateToPreviousShot: vi.fn(),
  }),
}));
vi.mock('@/shared/contexts/ProjectContext.tsx', () => ({ useProjectSelectionContext: () => ({ selectedProjectId: mocks.selectedProjectId }) }));
vi.mock('@/shared/contexts/ShotsContext.tsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/contexts/ShotsContext.tsx')>();
  return { ...actual, useShots: () => ({ shots: mocks.shots }) };
});
vi.mock('@/tools/video-editor/hooks/usePinnedShotGroups.ts', () => ({
  usePinnedShotGroupViews: () => [],
  usePinnedShotGroups: () => ({ pinGroup: mocks.pinGroup, unpinGroup: vi.fn(), updatePinnedGroup: vi.fn() }),
  usePinnedGroupSync: () => undefined,
}));
vi.mock('@/tools/video-editor/hooks/useShotGroupHandlers.ts', () => ({
  useShotGroupHandlers: () => ({
    shotGroupClipIds: new Set<string>(), activeTaskClipIds: new Set<string>(), staleShotGroupIds: new Set<string>(),
    handleShotGroupNavigate: vi.fn(), handleShotGroupGenerateVideo: vi.fn(), handleDeleteShotGroup: vi.fn(),
    handleUpdateToLatestVideo: vi.fn(), handleShotGroupUnpin: vi.fn(), handleShotGroupSwitchToFinalVideo: vi.fn(),
    handleShotGroupSwitchToImages: vi.fn(),
  }),
}));
vi.mock('@/tools/video-editor/hooks/useSwitchToFinalVideo.ts', () => ({
  useSwitchToFinalVideo: () => ({ switchToFinalVideo: vi.fn(), updateToLatestVideo: vi.fn(), switchToImages: vi.fn() }),
}));
vi.mock('@/tools/video-editor/hooks/useFinalVideoAvailable.ts', () => ({
  useFinalVideoAvailable: () => ({ finalVideoMap: new Map(), dismissFinalVideo: vi.fn() }),
}));
vi.mock('@/tools/travel-between-images/components/VideoGenerationModal.tsx', () => ({ VideoGenerationModal: () => null }));

// The popup and ShotEditorView are real. Only generation settings and external
// settings/network edges are inert; the nested canonical timeline editor and
// its save provider remain mounted below ShotTimelinePreview.
vi.mock('@/tools/travel-between-images/components/ShotEditor', () => ({ ShotSettingsEditor: () => null }));
vi.mock('@/tools/travel-between-images/components/VideoTravelFloatingOverlay.tsx', () => ({ VideoTravelFloatingOverlay: () => null }));
vi.mock('@/tools/travel-between-images/providers', () => ({
  VideoTravelSettingsProvider: ({ children }: { children: React.ReactNode }) => children,
  useVideoTravelSettingsMutations: () => ({ settings: {}, status: 'loading', shotId: null, updateField: vi.fn(), updateFields: vi.fn() }),
}));
vi.mock('@/shared/hooks/mobile', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/shared/hooks/mobile')>(),
  useIsMobile: () => false,
  useIsTablet: () => false,
}));
vi.mock('@/shared/hooks/shots', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/hooks/shots')>();
  return { ...actual, useUpdateShotName: () => ({ mutate: vi.fn() }) };
});
vi.mock('@/shared/hooks/shots/useShotImages', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/hooks/shots/useShotImages')>();
  return { ...actual, usePrimeShotImagesCache: () => undefined };
});
vi.mock('@/shared/hooks/invalidation/useGenerationInvalidation', () => ({ useEnqueueGenerationsInvalidation: () => vi.fn() }));
vi.mock('@/shared/hooks/projects/useProjectVideoCountsCache', () => ({
  useProjectVideoCountsCache: () => ({ getFinalVideoCount: () => 0, getHasStructureVideo: () => false }),
}));
vi.mock('@/shared/hooks/projects/useProjectGenerationModesCache', () => ({ useProjectGenerationModesCache: () => ({ updateShotMode: vi.fn() }) }));
vi.mock('@/shared/hooks/gallery/useVideoGalleryPreloader', () => ({ useVideoGalleryPreloader: () => undefined }));
vi.mock('@/tools/travel-between-images/hooks/useStickyHeader', () => ({ useStickyHeader: () => ({ isSticky: false }) }));
vi.mock('@/tools/travel-between-images/hooks/navigation/useNavigationState', () => ({
  useNavigationState: ({ shots }: { shots?: unknown[] }) => ({ sortedShots: shots ?? [], hasPrevious: false, hasNext: false }),
}));
vi.mock('@/tools/travel-between-images/hooks/useOperationTracking', () => ({
  useOperationTracking: () => ({ setIsDraggingInTimeline: vi.fn(), signalShotOperation: vi.fn() }),
}));

// This is the popup's read-only document-loading edge. The real adapter and
// nested shot timeline provider are injected separately and remain observable.
vi.mock('@/integrations/astrid/workspaceV1.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/integrations/astrid/workspaceV1.ts')>(),
  isAstridWorkspaceV1: true,
}));
vi.mock('@/integrations/runtime/dataProvider.ts', () => ({
  RuntimeDataProvider: class TestRuntimeReadEdge {
    shotComposition = { load: async () => ({}) };
    loadTimeline = (...args: unknown[]) => mocks.loadTimeline(...args);
    loadAssetRegistry = (...args: unknown[]) => mocks.loadAssetRegistry(...args);
    onResolve = (...args: unknown[]) => mocks.onResolve(...args);
    resolveAssetUrl = (file: string) => `https://bridge.test/${file}`;
    saveTimeline = (...args: unknown[]) => {
      mocks.runtimeProviderWrites.push({ boundary: 'RuntimeDataProvider.saveTimeline', args });
      return Promise.resolve(1);
    };
    saveTimelineAtHead = (...args: unknown[]) => {
      mocks.runtimeProviderWrites.push({ boundary: 'RuntimeDataProvider.saveTimelineAtHead', args });
      return Promise.resolve({ configVersion: 2 });
    };
  },
}));

// Use the App's actual nested editor/provider, with only its renderer and
// optional extension component registry kept synthetic for JSDOM.
vi.mock('@/tools/video-editor/components/PreviewPanel/RemotionPreview.tsx', () => ({
  RemotionPreview: React.forwardRef(() => <div data-testid="shot-preview-renderer" />),
}));
vi.mock('@/tools/video-editor/sequences/components/FrameOverlaySequence.tsx', () => ({ FrameOverlaySequence: () => null }));
vi.mock('@/tools/video-editor/sequences/components/EndSpanningLayerSequence.tsx', () => ({ EndSpanningLayerSequence: () => null }));
vi.mock('@/tools/video-editor/runtime/astrid-element-components.tsx', () => ({
  INSTALLED_ASTRID_ELEMENT_HOST: {
    descriptors: [],
    sequenceRegistry: {},
    resolveComponent: () => undefined,
    resolveSequenceClipEntry: () => undefined,
    describeClipCapability: () => undefined,
  },
}));
vi.mock('@/tools/video-editor/runtime/astrid-element-catalog.ts', () => ({
  ASTRID_ANIMATION_CATALOG: [], ASTRID_EFFECT_CATALOG: [], ASTRID_TRANSITION_CATALOG: [],
}));

const projectId = 'project-gate-scenario1';
const timelineId = 'timeline-gate-scenario1';
const occurrenceId = 'occurrence-gate-scenario1';

function freshSyntheticComposition() {
  const graph = structuredClone(fixture);
  const sourceOccurrence = graph.occurrences.find((occurrence) => occurrence.shot_id === 'shot-beta')!;
  graph.project.project_id = projectId;
  graph.project.document_id = timelineId;
  graph.primary_timeline.document_id = timelineId;
  graph.primary_timeline.head.revision_id = 'parent-head-gate-scenario1';
  graph.occurrences = [{
    ...sourceOccurrence,
    occurrence_id: occurrenceId,
    parent_document_id: timelineId,
    stable_deep_link: `project/${projectId}/document/${timelineId}/shot/${sourceOccurrence.shot_id}/revision/${sourceOccurrence.revision_id}/occurrence/${occurrenceId}`,
    output_identity: `project/${projectId}/document/${timelineId}/occurrence/${occurrenceId}/output/final-video`,
  }];
  graph.shot_revisions = graph.shot_revisions
    .filter((revision) => revision.shot_id === sourceOccurrence.shot_id && revision.revision_id === sourceOccurrence.revision_id)
    .map((revision) => ({
      ...revision,
      dependencies: [],
      audio: revision.audio ? { ...revision.audio, scope: { ...revision.audio.scope, project_id: projectId } } : revision.audio,
      assets: revision.assets.map((asset) => ({ ...asset, scope: { ...asset.scope, project_id: projectId } })),
    }));
  return graph;
}

function createParentTimelineData(): TimelineData {
  return {
    config: {
      output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
      tracks: [{ id: 'video', kind: 'visual', label: 'video' }],
      clips: [], pinnedShotGroups: [],
    },
    configVersion: 1,
    registry: { assets: {} },
    resolvedConfig: {
      output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
      tracks: [{ id: 'video', kind: 'visual', label: 'video' }], clips: [], registry: { assets: {} },
    },
    rows: [{ id: 'video', actions: [{ id: occurrenceId, start: 0, end: 1.2 }] }],
    meta: { [occurrenceId]: { asset: 'object-beta-image', track: 'video', clipType: 'shot' } },
    effects: {}, assetMap: {}, output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
    tracks: [{ id: 'video', kind: 'visual', label: 'video' }], clipOrder: { video: [occurrenceId] },
    signature: 'gate-scenario1', stableSignature: 'gate-scenario1',
  };
}

function createParentStore(data: TimelineData) {
  const store = createTimelineStore();
  const state = store.getState();
  const applyEdit = vi.fn();
  const isClipSelected = vi.fn(() => false);
  store.getState().syncDataSlice({
    ...state.data,
    data,
    resolvedConfig: data.resolvedConfig,
    isLoading: false,
    dataRef: { ...state.data.dataRef, current: data },
  });
  store.getState().syncOpsSlice({ ...state.ops, applyEdit, isClipSelected });
  return { store, applyEdit };
}

describe('PRES-HARNESS GATE scenario 1: editor then canonical shot popup does not save', () => {
  beforeEach(() => {
    resetFakeIndexedDB();
    mocks.createShot.mockReset();
    mocks.navigateToShot.mockReset();
    mocks.pinGroup.mockReset();
    mocks.loadTimeline.mockReset().mockResolvedValue({
      config: {
        output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
        tracks: [{ id: 'video', kind: 'visual', label: 'video' }], clips: [], pinnedShotGroups: [],
      },
      configVersion: 1,
    });
    mocks.loadAssetRegistry.mockReset().mockResolvedValue({
      assets: { 'beta-image': { media_id: 'object-beta-image', type: 'image/png', duration: 1.2 } },
    });
    mocks.onResolve.mockClear();
    mocks.runtimeProviderWrites.length = 0;
    vi.stubGlobal('indexedDB', createFakeIndexedDB());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens the actual LocalTimelineShotBrowser editor body and emits no save without edits', async () => {
    const graph = freshSyntheticComposition();
    const adapterLoads: unknown[] = [];
    const adapterPublishes: unknown[] = [];
    const adapterSaveAtHeadCalls: unknown[] = [];
    const providerWrites: string[] = [];
    const httpCalls: Array<{ method: string; url: string }> = [];
    const httpWrites: Array<{ method: string; url: string }> = [];
    const port = {
      load: async (request: unknown) => {
        adapterLoads.push(request);
        return graph;
      },
      publish: async (request: unknown) => {
        adapterPublishes.push(request);
        throw new Error('Unexpected canonical shot publication during popup open');
      },
      saveTimelineAtHead: async (...args: unknown[]) => {
        adapterSaveAtHeadCalls.push(args);
        throw new Error('Unexpected canonical shot save during popup open');
      },
    };
    const adapter = createShotCompositionAdapter(port);
    const composition = adapter.prepare(graph);
    const adapterPublishSpy = vi.spyOn(adapter, 'publish');
    const nestedProviderSaves: ReturnType<typeof vi.fn>[] = [];
    const createProvider = shotTimelineDataProvider.createShotTimelineDataProvider;
    vi.spyOn(shotTimelineDataProvider, 'createShotTimelineDataProvider').mockImplementation((...args) => {
      const provider = createProvider(...args);
      nestedProviderSaves.push(vi.spyOn(provider, 'saveTimeline'));
      return provider;
    });

    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestMethod = init?.method ?? (input instanceof Request ? input.method : 'GET');
      const method = requestMethod.toUpperCase();
      const url = String(input);
      httpCalls.push({ method, url });
      if (method !== 'GET' && method !== 'HEAD') httpWrites.push({ method, url });
      return new Response('{}', { status: method === 'GET' || method === 'HEAD' ? 200 : 500, headers: { 'content-type': 'application/json' } });
    });
    void originalFetch;

    const parentSave = async (boundary: string, args: unknown[]) => {
      providerWrites.push(boundary);
      return boundary === 'saveTimelineAtHead' ? { configVersion: 2 } : 2;
    };
    const parentProvider = {
      saveTimeline: (...args: unknown[]) => parentSave('saveTimeline', args),
      saveTimelineAtHead: (...args: unknown[]) => parentSave('saveTimelineAtHead', args),
    };
    const { store, applyEdit } = createParentStore(createParentTimelineData());
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const view = render(
      <MemoryRouter initialEntries={[`/tools/video-editor?runtime=1&runtimeProject=${projectId}&runtimeTimeline=${timelineId}`]}>
        <QueryClientProvider client={queryClient}>
          <AgentChatProvider>
            <TimelineStoreProvider store={store}>
              <VideoEditorRuntimeProvider value={{
                userId: null,
                timelineId,
                project: { projectId, projectSlug: projectId },
                provider: parentProvider,
                shots: {
                  canonicalOccurrences: composition.occurrences,
                  canonicalComposition: composition,
                  shotComposition: adapter,
                  isLoading: false,
                },
              } as never}>
                <ReighTimelineEditor />
              </VideoEditorRuntimeProvider>
            </TimelineStoreProvider>
          </AgentChatProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    try {
      const parentClip = view.container.querySelector(`[data-clip-id="${occurrenceId}"]`);
      expect(parentClip).toBeTruthy();

      // The canonical parent editor's ordinary double-click is the production
      // gesture that opens the embedded LocalTimelineShotBrowser.
      fireEvent.doubleClick(parentClip!);

      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeInTheDocument();
        expect(dialog.querySelector(`[data-canonical-occurrence-id="${occurrenceId}"]`)).toBeTruthy();
        expect(screen.getByRole('region', { name: 'Shot timeline' })).toHaveAttribute('data-shot-timeline-status', 'ready');
        expect(dialog.querySelector('[data-shot-timeline-editor="true"]')).toBeTruthy();
        expect(dialog.querySelector('.timeline-wrapper')).toBeTruthy();
      }, { timeout: 5000 });

      // The nested editor reports a clean initial state after its provider has
      // loaded, then we wait past its 500 ms save debounce before observing the
      // actual save boundaries.
      await waitFor(() => {
        expect(document.querySelector('[data-shot-timeline-save-status="saved"]')).toBeTruthy();
      }, { timeout: 5000 });
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 700)); });

      expect(applyEdit).not.toHaveBeenCalled();
      expect(providerWrites).toEqual([]);
      expect(mocks.runtimeProviderWrites).toEqual([]);
      expect(nestedProviderSaves.length).toBeGreaterThan(0);
      expect(nestedProviderSaves.every((save) => save.mock.calls.length === 0)).toBe(true);
      expect(adapterPublishSpy).not.toHaveBeenCalled();
      expect(adapterPublishes).toEqual([]);
      expect(adapterSaveAtHeadCalls).toEqual([]);
      expect(httpWrites).toEqual([]);
      expect(adapterLoads.length).toBeGreaterThan(0);
      expect(mocks.loadTimeline).toHaveBeenCalled();
      expect(mocks.loadAssetRegistry).toHaveBeenCalled();
    } finally {
      view.unmount();
      queryClient.clear();
    }
  }, 20000);
});
