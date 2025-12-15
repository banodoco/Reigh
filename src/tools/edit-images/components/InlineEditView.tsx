import React, { useRef, useState, useEffect } from 'react';
import { GenerationRow } from '@/types/shots';
import { isVideoAny } from '@/shared/lib/typeGuards';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useUserUIState } from '@/shared/hooks/useUserUIState';

import {
  useUpscale,
  useInpainting,
  useEditModeLoRAs,
  useSourceGeneration,
  useMagicEditMode,
  useGenerationLineage,
  useStarToggle,
  useRepositionMode
} from '@/shared/components/MediaLightbox/hooks';

import {
  MediaDisplayWithCanvas,
  TopLeftControls,
  TopRightControls,
  BottomLeftControls,
  BottomRightControls,
  EditModePanel,
  FloatingToolControls,
} from '@/shared/components/MediaLightbox/components';
import { Button } from '@/shared/components/ui/button';
import { Square, Trash2, Diamond } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { downloadMedia } from '@/shared/components/MediaLightbox/utils';
import { useVariants } from '@/tools/travel-between-images/components/VideoGallery/components/VideoTrimEditor';

interface InlineEditViewProps {
  media: GenerationRow;
  onClose: () => void;
  onNavigateToGeneration?: (generationId: string) => Promise<void>;
}

export function InlineEditView({ media, onClose, onNavigateToGeneration }: InlineEditViewProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const isMobile = useIsMobile();
  const { selectedProjectId } = useProject();
  const { value: generationMethods } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  const isCloudMode = generationMethods.inCloud;

  if (!media) return null;

  // Uses canonical isVideoAny from typeGuards
  const isVideo = isVideoAny(media as any);
  
  const upscaleHook = useUpscale({ media, selectedProjectId, isVideo });
  const { 
    effectiveImageUrl,
    sourceUrlForTasks,
    isUpscaling,
    showingUpscaled,
    isPendingUpscale,
    hasUpscaledVersion,
    handleUpscale,
    handleToggleUpscaled,
  } = upscaleHook;

  // Image dimensions state (needed by inpainting hook)
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Create as variant toggle - when true, creates variant; when false, creates new generation
  // Default to false (createAsGeneration=false means variant mode is ON)
  const [createAsGeneration, setCreateAsGeneration] = useState(false);
  
  // Flip functionality removed - use reposition mode instead
  const isFlippedHorizontally = false;
  const isSaving = false;

  const { isInSceneBoostEnabled, setIsInSceneBoostEnabled, loraMode, setLoraMode, customLoraUrl, setCustomLoraUrl, editModeLoRAs } = useEditModeLoRAs();

  // Variants hook - moved early so activeVariantId is available for other hooks
  const actualGenerationId = (media as any).generation_id || media.id;
  const {
    activeVariant,
    setActiveVariantId,
    refetch: refetchVariants,
  } = useVariants({
    generationId: actualGenerationId,
    enabled: true,
  });

  const inpaintingHook = useInpainting({
    media,
    selectedProjectId,
    isVideo,
    displayCanvasRef,
    maskCanvasRef,
    imageContainerRef,
    imageDimensions,
    handleExitInpaintMode: () => {},
    loras: editModeLoRAs,
    toolTypeOverride: 'edit-images',
    activeVariantId: activeVariant?.id, // Store strokes per-variant, not per-generation
    createAsGeneration, // If true, create a new generation instead of a variant
  });
  const {
    isInpaintMode,
    brushStrokes,
    isEraseMode,
    inpaintPrompt,
    inpaintNumGenerations,
    brushSize,
    isGeneratingInpaint,
    inpaintGenerateSuccess,
    isAnnotateMode,
    editMode,
    annotationMode,
    selectedShapeId,
    showTextModeHint,
    setIsInpaintMode,
    setIsEraseMode,
    setInpaintPrompt,
    setInpaintNumGenerations,
    setBrushSize,
    setIsAnnotateMode,
    setEditMode,
    setAnnotationMode,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleUndo,
    handleClearMask,
    handleEnterInpaintMode,
    handleGenerateInpaint,
    handleGenerateAnnotatedEdit,
    handleDeleteSelected,
    handleToggleFreeForm,
    getDeleteButtonPosition,
  } = inpaintingHook;
  
  const magicEditHook = useMagicEditMode({
    media,
    selectedProjectId,
    isVideo,
    isInpaintMode,
    setIsInpaintMode,
    handleEnterInpaintMode,
    handleGenerateInpaint,
    brushStrokes,
    inpaintPrompt,
    setInpaintPrompt,
    inpaintNumGenerations,
    setInpaintNumGenerations,
    editModeLoRAs,
    sourceUrlForTasks,
    imageDimensions,
    isInSceneBoostEnabled,
    setIsInSceneBoostEnabled,
    toolTypeOverride: 'edit-images',
    createAsGeneration, // If true, create a new generation instead of a variant
  });
  const {
    isCreatingMagicEditTasks,
    magicEditTasksCreated,
    inpaintPanelPosition,
    setInpaintPanelPosition,
    handleEnterMagicEditMode,
    handleExitMagicEditMode,
    handleUnifiedGenerate,
    isSpecialEditMode
  } = magicEditHook;

  const repositionHook = useRepositionMode({
    media,
    selectedProjectId,
    imageDimensions,
    imageContainerRef,
    loras: editModeLoRAs,
    inpaintPrompt,
    inpaintNumGenerations,
    handleExitInpaintMode: handleExitMagicEditMode,
    toolTypeOverride: 'edit-images',
    onVariantCreated: setActiveVariantId,
    refetchVariants,
    createAsGeneration, // If true, create a new generation instead of a variant
  });
  const {
    transform: repositionTransform,
    hasTransformChanges,
    isGeneratingReposition,
    repositionGenerateSuccess,
    isSavingAsVariant,
    saveAsVariantSuccess,
    setTranslateX,
    setTranslateY,
    setScale,
    setRotation,
    toggleFlipH,
    toggleFlipV,
    resetTransform,
    handleGenerateReposition,
    handleSaveAsVariant,
    getTransformStyle,
  } = repositionHook;

  const { sourceGenerationData } = useSourceGeneration({
    media,
    onOpenExternalGeneration: onNavigateToGeneration ? 
      async (id) => onNavigateToGeneration(id) : undefined
  });

  const lineageHook = useGenerationLineage({ media });
  const {
    derivedGenerations,
    derivedPage,
    derivedTotalPages,
    paginatedDerived,
    setDerivedPage,
  } = lineageHook;
  
  const starToggleHook = useStarToggle({ media });
  const { localStarred, toggleStarMutation, handleToggleStar } = starToggleHook;

  const handleDownload = async () => {
    await downloadMedia(effectiveImageUrl, media.id, isVideo, media.contentType);
  };

  useEffect(() => {
    if (!isSpecialEditMode) {
       handleEnterMagicEditMode();
    }
  }, [isSpecialEditMode, handleEnterMagicEditMode]);

  if (isMobile) {
    return (
      <TooltipProvider delayDuration={500}>
         <div className="w-full flex flex-col bg-transparent">
            <div 
              className="flex items-center justify-center relative bg-black w-full shrink-0 rounded-t-2xl overflow-hidden"
              style={{ height: '45dvh', touchAction: 'pan-y' }}
            >
               <MediaDisplayWithCanvas
                 effectiveImageUrl={effectiveImageUrl}
                 thumbUrl={(media as any).thumbnail_url || media.thumbUrl}
                 isVideo={isVideo}
                 isFlippedHorizontally={isFlippedHorizontally}
                 isSaving={isSaving}
                 isInpaintMode={isInpaintMode}
                 editMode={editMode}
                 repositionTransformStyle={editMode === 'reposition' ? getTransformStyle() : undefined}
                 imageContainerRef={imageContainerRef}
                 canvasRef={canvasRef}
                 displayCanvasRef={displayCanvasRef}
                 maskCanvasRef={maskCanvasRef}
                 onImageLoad={setImageDimensions}
                 handlePointerDown={handlePointerDown}
                 handlePointerMove={handlePointerMove}
                 handlePointerUp={handlePointerUp}
                 variant="mobile-stacked"
                 containerClassName="w-full h-full"
                 debugContext="Mobile Inline"
               />
             
               {isSpecialEditMode && (
                   <FloatingToolControls
                     variant="mobile"
                     editMode={editMode}
                     onSetEditMode={setEditMode}
                     brushSize={brushSize}
                     isEraseMode={isEraseMode}
                     onSetBrushSize={setBrushSize}
                     onSetIsEraseMode={setIsEraseMode}
                     annotationMode={annotationMode}
                     onSetAnnotationMode={setAnnotationMode}
                     repositionTransform={repositionTransform}
                     onRepositionTranslateXChange={setTranslateX}
                     onRepositionTranslateYChange={setTranslateY}
                     onRepositionScaleChange={setScale}
                     onRepositionRotationChange={setRotation}
                     onRepositionFlipH={toggleFlipH}
                     onRepositionFlipV={toggleFlipV}
                     onRepositionReset={resetTransform}
                     imageDimensions={imageDimensions}
                     brushStrokes={brushStrokes}
                     onUndo={handleUndo}
                     onClearMask={handleClearMask}
                     panelPosition={inpaintPanelPosition}
                     onSetPanelPosition={setInpaintPanelPosition}
                   />
                 )}

                 <TopLeftControls
                   isVideo={isVideo}
                   readOnly={false}
                   isSpecialEditMode={isSpecialEditMode}
                   selectedProjectId={selectedProjectId}
                   isCloudMode={isCloudMode}
                   showImageEditTools={true}
                   effectiveImageUrl={effectiveImageUrl}
                 />

                 <TopRightControls
                   isVideo={isVideo}
                   readOnly={false}
                   isSpecialEditMode={isSpecialEditMode}
                   selectedProjectId={selectedProjectId}
                   isCloudMode={isCloudMode}
                   showDownload={true}
                   handleDownload={handleDownload}
                   mediaId={media.id}
                   onClose={onClose}
                 />

                 <BottomLeftControls
                   isVideo={isVideo}
                   readOnly={false}
                   isSpecialEditMode={isSpecialEditMode}
                   selectedProjectId={selectedProjectId}
                   isCloudMode={isCloudMode}
                   handleEnterMagicEditMode={handleEnterMagicEditMode}
                   isUpscaling={isUpscaling}
                   isPendingUpscale={isPendingUpscale}
                   hasUpscaledVersion={hasUpscaledVersion}
                   showingUpscaled={showingUpscaled}
                   handleUpscale={handleUpscale}
                   handleToggleUpscaled={handleToggleUpscaled}
                 />

                 <BottomRightControls
                   isVideo={isVideo}
                   readOnly={false}
                   isSpecialEditMode={isSpecialEditMode}
                   selectedProjectId={selectedProjectId}
                   isCloudMode={isCloudMode}
                   localStarred={localStarred}
                   handleToggleStar={handleToggleStar}
                   toggleStarPending={toggleStarMutation.isPending}
                   isAddingToReferences={false}
                   addToReferencesSuccess={false}
                   handleAddToReferences={() => {}}
                 />
             </div>

            <div 
              className={cn(
                "bg-background border-t border-border relative z-[60] w-full rounded-b-2xl pb-8"
              )}
              style={{ minHeight: '55dvh' }}
            >
               {isSpecialEditMode ? (
                 <EditModePanel
                   sourceGenerationData={sourceGenerationData}
                   onOpenExternalGeneration={onNavigateToGeneration ? 
                     async (id) => onNavigateToGeneration(id) : undefined
                   }
                   currentMediaId={media.id}
                   editMode={editMode}
                   setEditMode={setEditMode}
                   setIsInpaintMode={setIsInpaintMode}
                   showTextModeHint={showTextModeHint}
                   inpaintPrompt={inpaintPrompt}
                   setInpaintPrompt={setInpaintPrompt}
                   inpaintNumGenerations={inpaintNumGenerations}
                   setInpaintNumGenerations={setInpaintNumGenerations}
                   loraMode={loraMode}
                   setLoraMode={setLoraMode}
                   customLoraUrl={customLoraUrl}
                   setCustomLoraUrl={setCustomLoraUrl}
                   isGeneratingInpaint={isGeneratingInpaint}
                   inpaintGenerateSuccess={inpaintGenerateSuccess}
                   isCreatingMagicEditTasks={isCreatingMagicEditTasks}
                   magicEditTasksCreated={magicEditTasksCreated}
                   brushStrokes={brushStrokes}
                   handleExitMagicEditMode={handleExitMagicEditMode}
                   handleUnifiedGenerate={handleUnifiedGenerate}
                   handleGenerateAnnotatedEdit={handleGenerateAnnotatedEdit}
                   handleGenerateReposition={handleGenerateReposition}
                   isGeneratingReposition={isGeneratingReposition}
                   repositionGenerateSuccess={repositionGenerateSuccess}
                   hasTransformChanges={hasTransformChanges}
                   handleSaveAsVariant={handleSaveAsVariant}
                   isSavingAsVariant={isSavingAsVariant}
                   saveAsVariantSuccess={saveAsVariantSuccess}
                   derivedGenerations={derivedGenerations}
                   paginatedDerived={paginatedDerived}
                   derivedPage={derivedPage}
                   derivedTotalPages={derivedTotalPages}
                   setDerivedPage={setDerivedPage}
                   onClose={onClose}
                   variant="mobile"
                   hideInfoEditToggle={true}
                   createAsGeneration={createAsGeneration}
                   onCreateAsGenerationChange={setCreateAsGeneration}
                 />
               ) : (
                 <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
                     <h3 className="text-xl font-medium">Image Editor</h3>
                     <p className="text-muted-foreground">Select an option to start editing</p>
                     
                     <div className="grid grid-cols-1 gap-4 w-full max-w-xs">
                       <Button onClick={() => {
                           setIsInpaintMode(true);
                           setEditMode('inpaint');
                       }} className="w-full">
                           Inpaint / Erase
                       </Button>
                       
                       <Button onClick={handleEnterMagicEditMode} variant="secondary" className="w-full">
                           Magic Edit
                       </Button>
                     </div>
                 </div>
               )}
             </div>
         </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={500}>
       <div className="w-full h-full flex bg-transparent overflow-hidden">
          <div 
            className="flex-1 flex items-center justify-center relative bg-black rounded-l-xl overflow-hidden"
            style={{ width: '60%', height: '100%' }}
          >
            <MediaDisplayWithCanvas
              effectiveImageUrl={effectiveImageUrl}
              thumbUrl={(media as any).thumbnail_url || media.thumbUrl}
              isVideo={isVideo}
              isFlippedHorizontally={isFlippedHorizontally}
              isSaving={isSaving}
              isInpaintMode={isInpaintMode}
              editMode={editMode}
              repositionTransformStyle={editMode === 'reposition' ? getTransformStyle() : undefined}
              imageContainerRef={imageContainerRef}
              canvasRef={canvasRef}
              displayCanvasRef={displayCanvasRef}
              maskCanvasRef={maskCanvasRef}
              onImageLoad={setImageDimensions}
              handlePointerDown={handlePointerDown}
              handlePointerMove={handlePointerMove}
              handlePointerUp={handlePointerUp}
              variant="desktop-side-panel"
              containerClassName="max-w-full max-h-full"
              debugContext="InlineEdit"
            />

            {selectedShapeId && isAnnotateMode && (() => {
              const buttonPos = getDeleteButtonPosition();
              if (!buttonPos) return null;
              
              const selectedShape = brushStrokes.find(s => s.id === selectedShapeId);
              const isFreeForm = selectedShape?.isFreeForm || false;
              
              return (
                <div className="absolute z-[100] flex gap-2" style={{
                  left: `${buttonPos.x}px`,
                  top: `${buttonPos.y}px`,
                  transform: 'translate(-50%, -50%)'
                }}>
                  <button
                    onClick={handleToggleFreeForm}
                    className={cn(
                      "rounded-full p-2 shadow-lg transition-colors",
                      isFreeForm 
                        ? "bg-purple-600 hover:bg-purple-700 text-white" 
                        : "bg-gray-700 hover:bg-gray-600 text-white"
                    )}
                    title={isFreeForm 
                      ? "Switch to rectangle mode (edges move linearly)" 
                      : "Switch to free-form mode (rhombus/non-orthogonal angles)"}
                  >
                    {isFreeForm ? <Diamond className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>
                  
                  <button
                    onClick={handleDeleteSelected}
                    className="bg-red-600 hover:bg-red-700 text-white rounded-full p-2 shadow-lg transition-colors"
                    title="Delete annotation (or press DELETE key)"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })()}

              <TopLeftControls
                isVideo={isVideo}
                readOnly={false}
                isSpecialEditMode={isSpecialEditMode}
                selectedProjectId={selectedProjectId}
                isCloudMode={isCloudMode}
                showImageEditTools={true}
                effectiveImageUrl={effectiveImageUrl}
              />

              {isSpecialEditMode && (
                <FloatingToolControls
                  variant={isMobile ? "mobile" : "tablet"}
                  editMode={editMode}
                  onSetEditMode={setEditMode}
                  brushSize={brushSize}
                  isEraseMode={isEraseMode}
                  onSetBrushSize={setBrushSize}
                  onSetIsEraseMode={setIsEraseMode}
                  annotationMode={annotationMode}
                  onSetAnnotationMode={setAnnotationMode}
                  repositionTransform={repositionTransform}
                  onRepositionTranslateXChange={setTranslateX}
                  onRepositionTranslateYChange={setTranslateY}
                  onRepositionScaleChange={setScale}
                  onRepositionRotationChange={setRotation}
                  onRepositionFlipH={toggleFlipH}
                  onRepositionFlipV={toggleFlipV}
                  onRepositionReset={resetTransform}
                  imageDimensions={imageDimensions}
                  brushStrokes={brushStrokes}
                  onUndo={handleUndo}
                  onClearMask={handleClearMask}
                  panelPosition={inpaintPanelPosition}
                  onSetPanelPosition={setInpaintPanelPosition}
                />
              )}

              <BottomLeftControls
                isVideo={isVideo}
                readOnly={false}
                isSpecialEditMode={isSpecialEditMode}
                selectedProjectId={selectedProjectId}
                isCloudMode={isCloudMode}
                handleEnterMagicEditMode={handleEnterMagicEditMode}
                isUpscaling={isUpscaling}
                isPendingUpscale={isPendingUpscale}
                hasUpscaledVersion={hasUpscaledVersion}
                showingUpscaled={showingUpscaled}
                handleUpscale={handleUpscale}
                handleToggleUpscaled={handleToggleUpscaled}
              />

              <BottomRightControls
                isVideo={isVideo}
                readOnly={false}
                isSpecialEditMode={isSpecialEditMode}
                selectedProjectId={selectedProjectId}
                isCloudMode={isCloudMode}
                localStarred={localStarred}
                handleToggleStar={handleToggleStar}
                toggleStarPending={toggleStarMutation.isPending}
                isAddingToReferences={false}
                addToReferencesSuccess={false}
                handleAddToReferences={() => {}}
              />

              <TopRightControls
                isVideo={isVideo}
                readOnly={false}
                isSpecialEditMode={isSpecialEditMode}
                selectedProjectId={selectedProjectId}
                isCloudMode={isCloudMode}
                showDownload={true}
                handleDownload={handleDownload}
                mediaId={media.id}
                onClose={onClose}
              />
          </div>

          <div 
            className={cn(
              "bg-background border-l border-border overflow-y-auto relative z-[60] rounded-r-xl"
            )}
            style={{ width: '40%', height: '100%' }}
          >
              {isSpecialEditMode ? (
                <EditModePanel
                  sourceGenerationData={sourceGenerationData}
                  onOpenExternalGeneration={onNavigateToGeneration ? 
                    async (id) => onNavigateToGeneration(id) : undefined
                  }
                  currentMediaId={media.id}
                  editMode={editMode}
                  setEditMode={setEditMode}
                  setIsInpaintMode={setIsInpaintMode}
                  showTextModeHint={showTextModeHint}
                  inpaintPrompt={inpaintPrompt}
                  setInpaintPrompt={setInpaintPrompt}
                  inpaintNumGenerations={inpaintNumGenerations}
                  setInpaintNumGenerations={setInpaintNumGenerations}
                  loraMode={loraMode}
                  setLoraMode={setLoraMode}
                  customLoraUrl={customLoraUrl}
                  setCustomLoraUrl={setCustomLoraUrl}
                  isGeneratingInpaint={isGeneratingInpaint}
                  inpaintGenerateSuccess={inpaintGenerateSuccess}
                  isCreatingMagicEditTasks={isCreatingMagicEditTasks}
                  magicEditTasksCreated={magicEditTasksCreated}
                  brushStrokes={brushStrokes}
                  handleExitMagicEditMode={handleExitMagicEditMode}
                  handleUnifiedGenerate={handleUnifiedGenerate}
                  handleGenerateAnnotatedEdit={handleGenerateAnnotatedEdit}
                  handleGenerateReposition={handleGenerateReposition}
                  isGeneratingReposition={isGeneratingReposition}
                  repositionGenerateSuccess={repositionGenerateSuccess}
                  hasTransformChanges={hasTransformChanges}
                  handleSaveAsVariant={handleSaveAsVariant}
                  isSavingAsVariant={isSavingAsVariant}
                  saveAsVariantSuccess={saveAsVariantSuccess}
                  derivedGenerations={derivedGenerations}
                  paginatedDerived={paginatedDerived}
                  derivedPage={derivedPage}
                  derivedTotalPages={derivedTotalPages}
                  setDerivedPage={setDerivedPage}
                  onClose={onClose}
                  variant="desktop"
                  hideInfoEditToggle={true}
                  createAsGeneration={createAsGeneration}
                  onCreateAsGenerationChange={setCreateAsGeneration}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
                    <h3 className="text-xl font-medium">Image Editor</h3>
                    <p className="text-muted-foreground">Select an option to start editing</p>
                    
                    <div className="grid grid-cols-1 gap-4 w-full max-w-xs">
                      <Button onClick={() => {
                          setIsInpaintMode(true);
                          setEditMode('inpaint');
                      }} className="w-full">
                          Inpaint / Erase
                      </Button>
                      
                      <Button onClick={handleEnterMagicEditMode} variant="secondary" className="w-full">
                          Magic Edit
                      </Button>
                    </div>
                </div>
              )}
          </div>
       </div>
    </TooltipProvider>
  );
}

