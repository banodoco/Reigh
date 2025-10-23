import { useState, useCallback, useEffect } from 'react';
import { GenerationRow } from '@/types/shots';
import { DerivedNavContext } from '../types';
import { transformExternalGeneration } from '../utils/external-generation-utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAddImageToShot, useAddImageToShotWithoutPosition } from '@/shared/hooks/useShots';
import { useProject } from '@/shared/contexts/ProjectContext';

interface UseExternalGenerationsProps {
  selectedShotId?: string;
  optimisticOrder: GenerationRow[];
  images: GenerationRow[];
  setLightboxIndex: (index: number | null) => void;
}

export function useExternalGenerations({
  selectedShotId,
  optimisticOrder,
  images,
  setLightboxIndex
}: UseExternalGenerationsProps) {
  const [externalGenerations, setExternalGenerations] = useState<GenerationRow[]>([]);
  const [tempDerivedGenerations, setTempDerivedGenerations] = useState<GenerationRow[]>([]);
  const [derivedNavContext, setDerivedNavContext] = useState<DerivedNavContext | null>(null);
  const [externalGenLightboxSelectedShot, setExternalGenLightboxSelectedShot] = useState<string | undefined>(selectedShotId);
  
  const { selectedProjectId } = useProject();
  const { mutateAsync: addToShotMutation } = useAddImageToShot();
  const { mutateAsync: addToShotWithoutPositionMutation } = useAddImageToShotWithoutPosition();
  
  // Listen for realtime generation updates
  useEffect(() => {
    const handleGenerationUpdate = async (event: any) => {
      const { payloads = [] } = event.detail || {};
      console.log('[BasedOnLineage] 🔄 Generation update batch received:', {
        payloadCount: payloads.length,
        timestamp: Date.now()
      });
      
      for (const payload of payloads) {
        const { generationId, upscaleCompleted } = payload;
        
        if (!generationId) continue;
        
        const isInExternal = externalGenerations.some(gen => gen.id === generationId);
        const isInTempDerived = tempDerivedGenerations.some(gen => gen.id === generationId);
        
        if (upscaleCompleted && (isInExternal || isInTempDerived)) {
          console.log('[BasedOnLineage] ✅ Upscale completed for external/temp generation, refetching:', {
            generationId: generationId.substring(0, 8)
          });
          
          try {
            const { data, error } = await supabase
              .from('generations')
              .select(`
                *,
                shot_generations(shot_id, timeline_frame)
              `)
              .eq('id', generationId)
              .single();
            
            if (error) throw error;
            
            if (data) {
              const shotGenerations = (data as any).shot_generations || [];
              const transformedData = transformExternalGeneration(data, shotGenerations);
              
              if (isInExternal) {
                setExternalGenerations(prev => 
                  prev.map(gen => gen.id === generationId ? transformedData : gen)
                );
              }
              if (isInTempDerived) {
                setTempDerivedGenerations(prev => 
                  prev.map(gen => gen.id === generationId ? transformedData : gen)
                );
              }
            }
          } catch (err) {
            console.error('[BasedOnLineage] ❌ Error refetching updated generation:', err);
          }
        }
      }
    };
    
    window.addEventListener('realtime:generation-update-batch' as any, handleGenerationUpdate as any);
    return () => {
      window.removeEventListener('realtime:generation-update-batch' as any, handleGenerationUpdate as any);
    };
  }, [externalGenerations, tempDerivedGenerations]);
  
  // Adapter functions for shot management
  const handleExternalGenAddToShot = useCallback(async (generationId: string, imageUrl?: string, thumbUrl?: string): Promise<boolean> => {
    if (!externalGenLightboxSelectedShot || !selectedProjectId) {
      console.warn('[ShotImageManager] Cannot add to shot - missing selected shot or project');
      return false;
    }
    
    try {
      await addToShotMutation({
        shot_id: externalGenLightboxSelectedShot,
        generation_id: generationId,
        imageUrl,
        thumbUrl,
        project_id: selectedProjectId,
      });
      toast.success('Added to shot');
      return true;
    } catch (error) {
      console.error('[ShotImageManager] Error adding to shot:', error);
      toast.error('Failed to add to shot');
      return false;
    }
  }, [externalGenLightboxSelectedShot, selectedProjectId, addToShotMutation]);
  
  const handleExternalGenAddToShotWithoutPosition = useCallback(async (generationId: string, imageUrl?: string, thumbUrl?: string): Promise<boolean> => {
    if (!externalGenLightboxSelectedShot || !selectedProjectId) {
      console.warn('[ShotImageManager] Cannot add to shot without position');
      return false;
    }
    
    try {
      await addToShotWithoutPositionMutation({
        shot_id: externalGenLightboxSelectedShot,
        generation_id: generationId,
        imageUrl,
        thumbUrl,
        project_id: selectedProjectId,
      });
      toast.success('Added to shot without position');
      return true;
    } catch (error) {
      console.error('[ShotImageManager] Error adding to shot without position:', error);
      toast.error('Failed to add to shot');
      return false;
    }
  }, [externalGenLightboxSelectedShot, selectedProjectId, addToShotWithoutPositionMutation]);
  
  // Handler to fetch and open an external generation
  const handleOpenExternalGeneration = useCallback(async (
    generationId: string,
    derivedContext?: string[]
  ) => {
    console.log('[BasedOnLineage] 🌐 Opening external generation:', {
      generationId: generationId.substring(0, 8),
      hasDerivedContext: !!derivedContext
    });
    
    // Set up derived navigation mode
    if (derivedContext && derivedContext.length > 0) {
      setDerivedNavContext({
        sourceGenerationId: generationId,
        derivedGenerationIds: derivedContext
      });
    } else if (derivedNavContext !== null) {
      setDerivedNavContext(null);
      setTempDerivedGenerations([]);
    }
    
    // Check if generation already exists
    const baseImages = (optimisticOrder && optimisticOrder.length > 0) ? optimisticOrder : (images || []);
    const existingIndex = baseImages.findIndex(img => img.id === generationId);
    
    if (existingIndex !== -1) {
      setLightboxIndex(existingIndex);
      return;
    }
    
    const externalIndex = externalGenerations.findIndex(img => img.id === generationId);
    if (externalIndex !== -1) {
      setLightboxIndex(baseImages.length + externalIndex);
      return;
    }
    
    const tempDerivedIndex = tempDerivedGenerations.findIndex(img => img.id === generationId);
    if (tempDerivedIndex !== -1) {
      setLightboxIndex(baseImages.length + externalGenerations.length + tempDerivedIndex);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('generations')
        .select(`
          *,
          shot_generations(shot_id, timeline_frame)
        `)
        .eq('id', generationId)
        .single();
      
      if (error) throw error;
      
      if (data) {
        const shotGenerations = (data as any).shot_generations || [];
        const transformedData = transformExternalGeneration(data, shotGenerations);
        
        if (derivedContext && derivedContext.length > 0) {
          setTempDerivedGenerations(prev => {
            const existingIdx = prev.findIndex(g => g.id === transformedData.id);
            if (existingIdx !== -1) {
              const newIndex = baseImages.length + externalGenerations.length + existingIdx;
              requestAnimationFrame(() => setLightboxIndex(newIndex));
              return prev;
            }
            
            const updated = [...prev, transformedData];
            const newIndex = baseImages.length + externalGenerations.length + updated.length - 1;
            requestAnimationFrame(() => setLightboxIndex(newIndex));
            return updated;
          });
        } else {
          setExternalGenerations(prev => {
            const existingIdx = prev.findIndex(g => g.id === transformedData.id);
            if (existingIdx !== -1) {
              const newIndex = baseImages.length + existingIdx;
              requestAnimationFrame(() => setLightboxIndex(newIndex));
              return prev;
            }
            
            const updated = [...prev, transformedData];
            const newIndex = baseImages.length + updated.length - 1;
            requestAnimationFrame(() => setLightboxIndex(newIndex));
            return updated;
          });
        }
      }
    } catch (error) {
      console.error('[ShotImageManager] ❌ Failed to fetch external generation:', error);
      toast.error('Failed to load generation');
    }
  }, [optimisticOrder, images, externalGenerations, tempDerivedGenerations, derivedNavContext, setLightboxIndex]);
  
  return {
    externalGenerations,
    setExternalGenerations,
    tempDerivedGenerations,
    setTempDerivedGenerations,
    derivedNavContext,
    setDerivedNavContext,
    externalGenLightboxSelectedShot,
    setExternalGenLightboxSelectedShot,
    handleExternalGenAddToShot,
    handleExternalGenAddToShotWithoutPosition,
    handleOpenExternalGeneration
  };
}

