/**
 * Floating UI State Hook for VideoTravelToolPage
 * 
 * Manages refs and state for floating UI elements:
 * - Header, timeline, and CTA container refs
 * - Callback refs that track DOM attachment
 * - Generate video CTA state and handlers
 * - Selection state for floating CTA visibility
 * 
 * @see VideoTravelToolPage.tsx - Main page component that uses this hook
 * @see ShotEditor - Component that uses these refs
 */

import { useState, useCallback, useRef } from 'react';

export interface UseVideoTravelFloatingUIReturn {
  // Container refs
  headerContainerRef: React.RefObject<HTMLDivElement>;
  timelineSectionRef: React.RefObject<HTMLDivElement>;
  ctaContainerRef: React.RefObject<HTMLDivElement>;
  
  // Ready state (tracks when refs are attached to DOM)
  headerReady: boolean;
  timelineReady: boolean;
  ctaReady: boolean;
  
  // Callback refs (for ShotEditor to use)
  headerCallbackRef: (node: HTMLDivElement | null) => void;
  timelineCallbackRef: (node: HTMLDivElement | null) => void;
  ctaCallbackRef: (node: HTMLDivElement | null) => void;
  
  // Selection state for floating CTA visibility control
  hasActiveSelection: boolean;
  handleSelectionChange: (hasSelection: boolean) => void;
  resetSelection: () => void;
  
  // Generate video CTA state
  variantName: string;
  setVariantName: (name: string) => void;
  isGeneratingVideo: boolean;
  videoJustQueued: boolean;
  
  // Refs for ShotEditor to populate
  getGenerationDataRef: React.MutableRefObject<(() => any) | null>;
  generateVideoRef: React.MutableRefObject<((variantName: string) => Promise<void>) | null>;
  nameClickRef: React.MutableRefObject<(() => void) | null>;
  
  // Handlers
  handleGenerateVideo: () => Promise<void>;
  handleFloatingHeaderNameClick: () => void;
}

/**
 * Hook that manages floating UI state for the Video Travel tool.
 * Handles refs, ready states, and generate video CTA functionality.
 */
export const useVideoTravelFloatingUI = (): UseVideoTravelFloatingUIReturn => {
  // =============================================================================
  // REFS FOR FLOATING ELEMENTS
  // =============================================================================
  const headerContainerRef = useRef<HTMLDivElement>(null);
  const timelineSectionRef = useRef<HTMLDivElement>(null);
  const ctaContainerRef = useRef<HTMLDivElement>(null);
  
  // State to track when refs are attached to DOM elements
  const [headerReady, setHeaderReady] = useState(false);
  const [timelineReady, setTimelineReady] = useState(false);
  const [ctaReady, setCtaReady] = useState(false);
  
  // Callback refs that update both the ref object AND state when elements attach
  const headerCallbackRef = useCallback((node: HTMLDivElement | null) => {
    headerContainerRef.current = node;
    setHeaderReady(!!node);
  }, []);
  
  const timelineCallbackRef = useCallback((node: HTMLDivElement | null) => {
    timelineSectionRef.current = node;
    setTimelineReady(!!node);
  }, []);
  
  const ctaCallbackRef = useCallback((node: HTMLDivElement | null) => {
    ctaContainerRef.current = node;
    setCtaReady(!!node);
  }, []);
  
  // =============================================================================
  // SELECTION STATE
  // =============================================================================
  const [hasActiveSelection, setHasActiveSelection] = useState(false);
  
  const handleSelectionChange = useCallback((hasSelection: boolean) => {
    setHasActiveSelection(hasSelection);
  }, []);
  
  const resetSelection = useCallback(() => {
    setHasActiveSelection(false);
  }, []);
  
  // =============================================================================
  // GENERATE VIDEO CTA STATE
  // =============================================================================
  const [variantName, setVariantName] = useState('');
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoJustQueued, setVideoJustQueued] = useState(false);
  
  // Refs to get shot-specific data and generate function from ShotEditor
  const getGenerationDataRef = useRef<(() => any) | null>(null);
  const generateVideoRef = useRef<((variantName: string) => Promise<void>) | null>(null);
  const nameClickRef = useRef<(() => void) | null>(null);
  
  // =============================================================================
  // HANDLERS
  // =============================================================================
  
  // Handle generate video - calls ShotEditor's function with current variant name
  const handleGenerateVideo = useCallback(async () => {
    if (generateVideoRef.current) {
      setIsGeneratingVideo(true);
      setVideoJustQueued(false);
      try {
        await generateVideoRef.current(variantName);
        setVariantName(''); // Clear after success
        setVideoJustQueued(true);
        setTimeout(() => setVideoJustQueued(false), 2000);
      } catch (error) {
        console.error('Failed to generate video:', error);
      } finally {
        setIsGeneratingVideo(false);
      }
    }
  }, [variantName]);
  
  // Handle floating header name click - scroll to top and trigger edit mode
  const handleFloatingHeaderNameClick = useCallback(() => {
    // Scroll to absolute top (position 0) to fully hide floating header
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Trigger edit mode after a short delay to let scroll finish
    setTimeout(() => {
      if (nameClickRef.current) {
        nameClickRef.current();
      }
    }, 300);
  }, []);

  return {
    // Container refs
    headerContainerRef,
    timelineSectionRef,
    ctaContainerRef,
    
    // Ready state
    headerReady,
    timelineReady,
    ctaReady,
    
    // Callback refs
    headerCallbackRef,
    timelineCallbackRef,
    ctaCallbackRef,
    
    // Selection state
    hasActiveSelection,
    handleSelectionChange,
    resetSelection,
    
    // Generate video CTA state
    variantName,
    setVariantName,
    isGeneratingVideo,
    videoJustQueued,
    
    // Refs for ShotEditor
    getGenerationDataRef,
    generateVideoRef,
    nameClickRef,
    
    // Handlers
    handleGenerateVideo,
    handleFloatingHeaderNameClick,
  };
};
