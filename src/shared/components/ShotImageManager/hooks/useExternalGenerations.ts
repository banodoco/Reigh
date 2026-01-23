import React, { useState, useCallback, useEffect } from 'react';
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
  setLightboxIndexRef: React.MutableRefObject<(index: number) => void>;
}

export function useExternalGenerations({
  selectedShotId,
  optimisticOrder,
  images,
  setLightboxIndexRef
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
                shot_generations!shot_generations_generation_id_generations_id_fk(shot_id, timeline_frame)
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
    console.log('[BasedOnNav] 🌐 handleOpenExternalGeneration START:', {
      targetGenerationId: generationId.substring(0, 8),
      hasDerivedContext: !!derivedContext,
      derivedContextLength: derivedContext?.length || 0,
      currentDerivedNavContext: derivedNavContext ? {
        sourceId: derivedNavContext.sourceGenerationId.substring(0, 8),
        derivedIdsCount: derivedNavContext.derivedGenerationIds.length
      } : null
    });
    
    // Check if generation already exists BEFORE modifying state
    const baseImages = (optimisticOrder && optimisticOrder.length > 0) ? optimisticOrder : (images || []);
    const existingIndex = baseImages.findIndex(img => img.id === generationId);
    
    console.log('[BasedOnNav] 📊 Current array state:', {
      baseImagesCount: baseImages.length,
      externalGenerationsCount: externalGenerations.length,
      tempDerivedGenerationsCount: tempDerivedGenerations.length,
      totalCurrentImages: baseImages.length + externalGenerations.length + tempDerivedGenerations.length,
      existingIndexInBase: existingIndex
    });
    
    if (existingIndex !== -1) {
      console.log('[BasedOnNav] ✅ Found in BASE images at index', existingIndex);
      // Set up derived navigation mode
      if (derivedContext && derivedContext.length > 0) {
        console.log('[BasedOnNav] 🔄 Setting derived nav context (entering derived mode)');
        setDerivedNavContext({
          sourceGenerationId: generationId,
          derivedGenerationIds: derivedContext
        });
      } else if (derivedNavContext !== null) {
        console.log('[BasedOnNav] 🔄 Clearing derived nav context (exiting derived mode)');
        setDerivedNavContext(null);
        setTempDerivedGenerations([]);
      }
      console.log('[BasedOnNav] 🎯 Setting lightbox index to', existingIndex);
      setLightboxIndexRef.current(existingIndex);
      console.log('[BasedOnNav] ✅ handleOpenExternalGeneration COMPLETE (found in base)');
      return;
    }
    
    const externalIndex = externalGenerations.findIndex(img => img.id === generationId);
    if (externalIndex !== -1) {
      const calculatedIndex = baseImages.length + externalIndex;
      console.log('[BasedOnNav] ✅ Found in EXTERNAL images at index', externalIndex, '(absolute:', calculatedIndex, ')');
      // Set up derived navigation mode
      if (derivedContext && derivedContext.length > 0) {
        console.log('[BasedOnNav] 🔄 Setting derived nav context (entering derived mode)');
        setDerivedNavContext({
          sourceGenerationId: generationId,
          derivedGenerationIds: derivedContext
        });
      } else if (derivedNavContext !== null) {
        console.log('[BasedOnNav] 🔄 Clearing derived nav context (exiting derived mode)');
        console.log('[BasedOnNav] ⚠️ CRITICAL: tempDerived being cleared, new currentImages length will be:', baseImages.length + externalGenerations.length);
        setDerivedNavContext(null);
        setTempDerivedGenerations([]);
      }
      console.log('[BasedOnNav] 🎯 Setting lightbox index to', calculatedIndex);
      setLightboxIndexRef.current(calculatedIndex);
      console.log('[BasedOnNav] ✅ handleOpenExternalGeneration COMPLETE (found in external)');
      return;
    }
    
    const tempDerivedIndex = tempDerivedGenerations.findIndex(img => img.id === generationId);
    if (tempDerivedIndex !== -1) {
      const calculatedIndex = baseImages.length + externalGenerations.length + tempDerivedIndex;
      console.log('[BasedOnNav] ✅ Found in TEMP DERIVED images at index', tempDerivedIndex, '(absolute:', calculatedIndex, ')');
      // Set up derived navigation mode
      if (derivedContext && derivedContext.length > 0) {
        console.log('[BasedOnNav] 🔄 Setting derived nav context (entering derived mode - staying in temp)');
        setDerivedNavContext({
          sourceGenerationId: generationId,
          derivedGenerationIds: derivedContext
        });
        console.log('[BasedOnNav] 🎯 Setting lightbox index to', calculatedIndex);
        setLightboxIndexRef.current(calculatedIndex);
      } else if (derivedNavContext !== null) {
        // CRITICAL: We're exiting derived mode and the target is IN tempDerived
        // We need to move it to externalGenerations FIRST, then clear tempDerived
        console.log('[BasedOnNav] 🔄 Clearing derived nav context (exiting derived mode FROM tempDerived)');
        console.log('[BasedOnNav] 🔧 FIX: Moving target generation from tempDerived to externalGenerations before clearing');
        
        const targetGeneration = tempDerivedGenerations[tempDerivedIndex];
        const newExternalIndex = externalGenerations.length;
        const newAbsoluteIndex = baseImages.length + newExternalIndex;
        
        console.log('[BasedOnNav] 📦 Moving generation', generationId.substring(0, 8), 'from tempDerived[', tempDerivedIndex, '] to external[', newExternalIndex, '], new absolute index:', newAbsoluteIndex);
        
        // Add to externalGenerations
        setExternalGenerations(prev => [...prev, targetGeneration]);
        
        // Set the new index BEFORE clearing tempDerived
        console.log('[BasedOnNav] 🎯 Setting lightbox index to NEW position:', newAbsoluteIndex);
        setLightboxIndexRef.current(newAbsoluteIndex);
        
        // Now safe to clear
        console.log('[BasedOnNav] 🧹 Clearing derived nav context and tempDerived');
        setDerivedNavContext(null);
        setTempDerivedGenerations([]);
      } else {
        // No context change, just update index
        console.log('[BasedOnNav] 🎯 Setting lightbox index to', calculatedIndex);
        setLightboxIndexRef.current(calculatedIndex);
      }
      console.log('[BasedOnNav] ✅ handleOpenExternalGeneration COMPLETE (found in tempDerived)');
      return;
    }
    
    // Not found in any existing arrays - need to fetch
    console.log('[BasedOnNav] 🔍 Generation NOT FOUND in any array, will fetch from database');
    // Set up derived navigation mode BEFORE clearing temp state
    if (derivedContext && derivedContext.length > 0) {
      console.log('[BasedOnNav] 🔄 Setting derived nav context (entering derived mode - will fetch)');
      setDerivedNavContext({
        sourceGenerationId: generationId,
        derivedGenerationIds: derivedContext
      });
    } else if (derivedNavContext !== null) {
      // Update lightbox index to a safe position BEFORE clearing temp derived
      // Point to end of externalGenerations (where new item will be added)
      const newIndex = baseImages.length + externalGenerations.length;
      console.log('[BasedOnNav] 🔄 Clearing derived nav context (exiting derived mode - will fetch)');
      console.log('[BasedOnNav] ⚠️ CRITICAL: tempDerived being cleared, new currentImages length will be:', baseImages.length + externalGenerations.length);
      console.log('[BasedOnNav] 🎯 Pre-emptively setting index to safe position:', newIndex);
      setLightboxIndexRef.current(newIndex);
      // Now safe to clear without invalidating the index
      setDerivedNavContext(null);
      setTempDerivedGenerations([]);
    }
    
    try {
      console.log('[BasedOnNav] 🌐 Fetching generation from database...');
      const { data, error } = await supabase
        .from('generations')
        .select(`
          *,
          shot_generations!shot_generations_generation_id_generations_id_fk(shot_id, timeline_frame)
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
              requestAnimationFrame(() => setLightboxIndexRef.current(newIndex));
              return prev;
            }
            
            const updated = [...prev, transformedData];
            const newIndex = baseImages.length + externalGenerations.length + updated.length - 1;
            requestAnimationFrame(() => setLightboxIndexRef.current(newIndex));
            return updated;
          });
        } else {
          setExternalGenerations(prev => {
            const existingIdx = prev.findIndex(g => g.id === transformedData.id);
            if (existingIdx !== -1) {
              const newIndex = baseImages.length + existingIdx;
              requestAnimationFrame(() => setLightboxIndexRef.current(newIndex));
              return prev;
            }
            
            const updated = [...prev, transformedData];
            const newIndex = baseImages.length + updated.length - 1;
            requestAnimationFrame(() => setLightboxIndexRef.current(newIndex));
            return updated;
          });
        }
      }
    } catch (error) {
      console.error('[ShotImageManager] ❌ Failed to fetch external generation:', error);
      toast.error('Failed to load generation');
    }
  }, [optimisticOrder, images, externalGenerations, tempDerivedGenerations, derivedNavContext, setLightboxIndexRef]);
  
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

