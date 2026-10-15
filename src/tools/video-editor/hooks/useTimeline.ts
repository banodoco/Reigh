import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import {
  isDataProviderPersistenceEnabled,
  TimelineVersionConflictError,
  type DataProvider,
  type LoadedTimeline,
  type TimelineHeadRevision,
} from '@/tools/video-editor/data/DataProvider.ts';
import type { TimelineConfig } from '@/tools/video-editor/types/index.ts';

export const timelineQueryKey = (timelineId: string | null | undefined) => ['timeline', timelineId] as const;
export const assetRegistryQueryKey = (timelineId: string | null | undefined) => ['asset-registry', timelineId] as const;

export function useTimeline(provider: DataProvider | null, timelineId: string | null | undefined) {
  const queryClient = useQueryClient();
  const configVersionRef = useRef(1);
  const headRef = useRef<TimelineHeadRevision>();

  const timelineQuery = useQuery({
    queryKey: timelineQueryKey(timelineId),
    enabled: Boolean(provider && timelineId),
    queryFn: async () => {
      const timeline = await provider!.loadTimeline(timelineId!);
      configVersionRef.current = timeline.configVersion;
      headRef.current = timeline.head;
      return timeline;
    },
  });

  const saveTimeline = useMutation({
    mutationFn: async (config: TimelineConfig) => {
      if (!isDataProviderPersistenceEnabled(provider)) {
        return { config, configVersion: configVersionRef.current };
      }
      if (provider!.saveTimelineAtHead) {
        if (!headRef.current) throw new TimelineVersionConflictError('Timeline editing head is unknown. Reload before saving.');
        const receipt = await provider!.saveTimelineAtHead(timelineId!, config, headRef.current);
        headRef.current = receipt.head;
        configVersionRef.current = receipt.configVersion;
        return { config, configVersion: receipt.configVersion, head: receipt.head };
      }
      const nextVersion = await provider!.saveTimeline(
        timelineId!,
        config,
        configVersionRef.current,
      );
      configVersionRef.current = nextVersion;
      return { config, configVersion: nextVersion };
    },
    onMutate: async (config) => {
      await queryClient.cancelQueries({ queryKey: timelineQueryKey(timelineId) });
      const previous = queryClient.getQueryData<LoadedTimeline>(timelineQueryKey(timelineId));
      queryClient.setQueryData<LoadedTimeline>(timelineQueryKey(timelineId), {
        config,
        configVersion: configVersionRef.current,
        head: headRef.current,
        // An optimistic config save never touches lane source items: carry
        // the loaded bundle through so a refetch race can't blank it.
        bundle: previous?.bundle ?? null,
      });
      return { previous };
    },
    onError: (_error, _config, context) => {
      if (context?.previous) {
        queryClient.setQueryData(timelineQueryKey(timelineId), context.previous);
        configVersionRef.current = context.previous.configVersion;
        headRef.current = context.previous.head;
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: timelineQueryKey(timelineId) });
      void queryClient.invalidateQueries({ queryKey: assetRegistryQueryKey(timelineId) });
    },
  });

  return {
    ...timelineQuery,
    data: timelineQuery.data?.config,
    audioLanePresentation: timelineQuery.data?.audioLanePresentation,
    configVersion: timelineQuery.data?.configVersion ?? configVersionRef.current,
    saveTimeline,
  };
}
