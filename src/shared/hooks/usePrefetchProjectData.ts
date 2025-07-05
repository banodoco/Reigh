import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Shot } from '@/types/shots';
import { GeneratedImageWithMetadata } from '@/shared/components/ImageGallery';

/**
 * Prefetch heavy project-level data (shots & generations) as soon as we know
 * the current project. This warms React-Query cache so first renders of heavy
 * tools like Video-Travel & Image-Generation can hydrate synchronously.
 *
 * NOTE: We intentionally keep these queries fresh for 5 min to match the tool
 * pages. Update both sides together if you tweak staleTime.
 */
export function usePrefetchProjectData(projectId?: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId) return;

    /* -------------------------------- Shots ------------------------------- */
    const fetchShots = async (): Promise<Shot[]> => {
      // 1. Fetch base shot rows
      const { data: shots, error: shotsError } = await supabase
        .from('shots')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (shotsError) throw shotsError;

      if (!shots?.length) return [];

      // 2. Fetch associated generations for all shots in one go
      const shotIds = shots.map((s) => s.id);
      const { data: shotGenerations, error: sgError } = await supabase
        .from('shot_generations')
        .select(`*, generation:generations(*)`)
        .in('shot_id', shotIds)
        .order('position', { ascending: true });
      if (sgError) throw sgError;

      // 3. Group by shot and build the typed Shot[] structure used in the app
      const gensByShot: Record<string, any[]> = {};
      (shotGenerations || []).forEach((sg) => {
        if (!gensByShot[sg.shot_id]) gensByShot[sg.shot_id] = [];
        if (sg.generation) {
          gensByShot[sg.shot_id].push({
            ...sg.generation,
            shotImageEntryId: sg.id,
            shot_generation_id: sg.id,
            position: sg.position,
            imageUrl: sg.generation?.location || sg.generation?.imageUrl,
            thumbUrl: sg.generation?.thumb_url || sg.generation?.thumbUrl,
          });
        }
      });

      return shots.map((shot) => ({
        id: shot.id,
        name: shot.name,
        created_at: shot.created_at,
        updated_at: shot.updated_at,
        project_id: shot.project_id,
        images: gensByShot[shot.id] || [],
      }));
    };

    queryClient.prefetchQuery({
      queryKey: ['shots', projectId],
      queryFn: fetchShots,
      staleTime: 5 * 60 * 1000, // 5 min – keep in sync with hooks
    });

    /* --------------------------- Generations ------------------------------ */
    const fetchGenerations = async (): Promise<GeneratedImageWithMetadata[]> => {
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1000); // same limit as useListAllGenerations
      if (error) throw error;

      return (
        data || []
      ).map((item: any) => ({
        id: item.id,
        url: item.location,
        prompt: item.params?.prompt || item.metadata?.prompt || 'No prompt',
        metadata: item.params || item.metadata || {},
      }));
    };

    queryClient.prefetchQuery({
      queryKey: ['generations', projectId],
      queryFn: fetchGenerations,
      staleTime: 5 * 60 * 1000,
    });
  }, [projectId, queryClient]);
} 