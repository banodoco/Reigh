/**
 * ControlsPanel Component
 *
 * Router component that renders the appropriate panel based on current mode:
 * - VideoEditPanel: when in video edit mode (trim/regenerate)
 * - EditModePanel: when in image edit mode (inpaint/annotate/reposition)
 * - InfoPanel: default info view with task details and variants
 *
 * This eliminates the duplicated ternary logic between desktop and mobile layouts.
 */

import React from 'react';
import { VideoEditPanel } from './VideoEditPanel';
import { EditModePanel } from './EditModePanel';
import { InfoPanel } from './InfoPanel';
import type { VideoEditPanelProps } from './VideoEditPanel';
import type { EditModePanelProps } from './EditModePanel';
import type { InfoPanelProps } from './InfoPanel';
import type { SegmentRegenerateFormProps } from './SegmentRegenerateForm';

// Mode detection props
interface ModeProps {
  isInVideoEditMode: boolean;
  isSpecialEditMode: boolean;
}

// Combine all panel props (omitting variant since we handle it)
export interface ControlsPanelProps extends ModeProps {
  /** Layout variant - passed through to child panels */
  variant: 'desktop' | 'mobile';

  // VideoEditPanel props
  videoEditSubMode: 'trim' | 'replace' | 'regenerate' | null;
  onEnterTrimMode: () => void;
  onEnterReplaceMode: () => void;
  onEnterRegenerateMode: () => void;
  onExitVideoEditMode: () => void;
  regenerateFormProps?: SegmentRegenerateFormProps | null;
  // Trim props
  trimState: VideoEditPanelProps['trimState'];
  onStartTrimChange: VideoEditPanelProps['onStartTrimChange'];
  onEndTrimChange: VideoEditPanelProps['onEndTrimChange'];
  onResetTrim: VideoEditPanelProps['onResetTrim'];
  trimmedDuration: VideoEditPanelProps['trimmedDuration'];
  hasTrimChanges: VideoEditPanelProps['hasTrimChanges'];
  onSaveTrim: VideoEditPanelProps['onSaveTrim'];
  isSavingTrim: VideoEditPanelProps['isSavingTrim'];
  trimSaveProgress: VideoEditPanelProps['trimSaveProgress'];
  trimSaveError: VideoEditPanelProps['trimSaveError'];
  trimSaveSuccess: VideoEditPanelProps['trimSaveSuccess'];
  videoUrl: VideoEditPanelProps['videoUrl'];
  trimCurrentTime: VideoEditPanelProps['trimCurrentTime'];
  trimVideoRef: VideoEditPanelProps['trimVideoRef'];
  // Regenerate props
  videoEditing: VideoEditPanelProps['videoEditing'];
  projectId: VideoEditPanelProps['projectId'];

  // EditModePanel props
  sourceGenerationData: EditModePanelProps['sourceGenerationData'];
  onOpenExternalGeneration: EditModePanelProps['onOpenExternalGeneration'];
  allShots: EditModePanelProps['allShots'];
  isCurrentMediaPositioned: EditModePanelProps['isCurrentMediaPositioned'];
  onReplaceInShot: EditModePanelProps['onReplaceInShot'];
  sourcePrimaryVariant: EditModePanelProps['sourcePrimaryVariant'];
  onMakeMainVariant: EditModePanelProps['onMakeMainVariant'];
  canMakeMainVariant: EditModePanelProps['canMakeMainVariant'];
  editMode: EditModePanelProps['editMode'];
  setEditMode: EditModePanelProps['setEditMode'];
  setIsInpaintMode: EditModePanelProps['setIsInpaintMode'];
  inpaintPrompt: EditModePanelProps['inpaintPrompt'];
  setInpaintPrompt: EditModePanelProps['setInpaintPrompt'];
  inpaintNumGenerations: EditModePanelProps['inpaintNumGenerations'];
  setInpaintNumGenerations: EditModePanelProps['setInpaintNumGenerations'];
  loraMode: EditModePanelProps['loraMode'];
  setLoraMode: EditModePanelProps['setLoraMode'];
  customLoraUrl: EditModePanelProps['customLoraUrl'];
  setCustomLoraUrl: EditModePanelProps['setCustomLoraUrl'];
  isGeneratingInpaint: EditModePanelProps['isGeneratingInpaint'];
  inpaintGenerateSuccess: EditModePanelProps['inpaintGenerateSuccess'];
  isCreatingMagicEditTasks: EditModePanelProps['isCreatingMagicEditTasks'];
  magicEditTasksCreated: EditModePanelProps['magicEditTasksCreated'];
  brushStrokes: EditModePanelProps['brushStrokes'];
  handleExitMagicEditMode: EditModePanelProps['handleExitMagicEditMode'];
  handleUnifiedGenerate: EditModePanelProps['handleUnifiedGenerate'];
  handleGenerateAnnotatedEdit: EditModePanelProps['handleGenerateAnnotatedEdit'];
  handleGenerateReposition: EditModePanelProps['handleGenerateReposition'];
  isGeneratingReposition: EditModePanelProps['isGeneratingReposition'];
  repositionGenerateSuccess: EditModePanelProps['repositionGenerateSuccess'];
  hasTransformChanges: EditModePanelProps['hasTransformChanges'];
  handleSaveAsVariant: EditModePanelProps['handleSaveAsVariant'];
  isSavingAsVariant: EditModePanelProps['isSavingAsVariant'];
  saveAsVariantSuccess: EditModePanelProps['saveAsVariantSuccess'];
  createAsGeneration: EditModePanelProps['createAsGeneration'];
  onCreateAsGenerationChange: EditModePanelProps['onCreateAsGenerationChange'];

  // Img2Img mode props
  img2imgPrompt?: EditModePanelProps['img2imgPrompt'];
  setImg2imgPrompt?: EditModePanelProps['setImg2imgPrompt'];
  img2imgStrength?: EditModePanelProps['img2imgStrength'];
  setImg2imgStrength?: EditModePanelProps['setImg2imgStrength'];
  enablePromptExpansion?: EditModePanelProps['enablePromptExpansion'];
  setEnablePromptExpansion?: EditModePanelProps['setEnablePromptExpansion'];
  isGeneratingImg2Img?: EditModePanelProps['isGeneratingImg2Img'];
  img2imgGenerateSuccess?: EditModePanelProps['img2imgGenerateSuccess'];
  handleGenerateImg2Img?: EditModePanelProps['handleGenerateImg2Img'];
  img2imgLoraManager?: EditModePanelProps['img2imgLoraManager'];
  availableLoras?: EditModePanelProps['availableLoras'];
  // LoRA manager for other edit modes (text, inpaint, annotate, reposition)
  editLoraManager?: EditModePanelProps['editLoraManager'];
  advancedSettings?: EditModePanelProps['advancedSettings'];
  setAdvancedSettings?: EditModePanelProps['setAdvancedSettings'];
  isLocalGeneration?: EditModePanelProps['isLocalGeneration'];
  qwenEditModel?: EditModePanelProps['qwenEditModel'];
  setQwenEditModel?: EditModePanelProps['setQwenEditModel'];

  // InfoPanel props
  isVideo: InfoPanelProps['isVideo'];
  showImageEditTools: InfoPanelProps['showImageEditTools'];
  readOnly: InfoPanelProps['readOnly'];
  isInpaintMode: InfoPanelProps['isInpaintMode'];
  onExitInpaintMode: InfoPanelProps['onExitInpaintMode'];
  onEnterInpaintMode: InfoPanelProps['onEnterInpaintMode'];
  onEnterVideoEditMode: InfoPanelProps['onEnterVideoEditMode'];
  onClose: InfoPanelProps['onClose'];
  taskDetailsData: InfoPanelProps['taskDetailsData'];
  derivedItems: InfoPanelProps['derivedItems'];
  replaceImages: InfoPanelProps['replaceImages'];
  onReplaceImagesChange: InfoPanelProps['onReplaceImagesChange'];
  onSwitchToPrimary: InfoPanelProps['onSwitchToPrimary'];
  variantsSectionRef: InfoPanelProps['variantsSectionRef'];

  // Shared props (used by multiple panels)
  currentMediaId: string;
  currentShotId?: string;
  derivedGenerations: any;
  paginatedDerived: any;
  derivedPage: number;
  derivedTotalPages: number;
  onSetDerivedPage: (page: number | ((prev: number) => number)) => void;
  variants: any[];
  activeVariant: any;
  primaryVariant: any;
  onVariantSelect: (variantId: string) => void;
  onMakePrimary: (variantId: string) => Promise<void>;
  isLoadingVariants: boolean;
  // Variant promotion
  onPromoteToGeneration?: (variantId: string) => Promise<void>;
  isPromoting?: boolean;
  // Variant deletion
  onDeleteVariant?: (variantId: string) => Promise<void>;

  /** Handler to load a variant's settings into the regenerate form */
  onLoadVariantSettings?: (variantParams: Record<string, any>) => void;
}

export const ControlsPanel: React.FC<ControlsPanelProps> = (props) => {
  const {
    variant,
    isInVideoEditMode,
    isSpecialEditMode,
    // VideoEditPanel props
    videoEditSubMode,
    onEnterTrimMode,
    onEnterReplaceMode,
    onEnterRegenerateMode,
    onExitVideoEditMode,
    regenerateFormProps,
    trimState,
    onStartTrimChange,
    onEndTrimChange,
    onResetTrim,
    trimmedDuration,
    hasTrimChanges,
    onSaveTrim,
    isSavingTrim,
    trimSaveProgress,
    trimSaveError,
    trimSaveSuccess,
    videoUrl,
    trimCurrentTime,
    trimVideoRef,
    videoEditing,
    projectId,
    // EditModePanel props
    sourceGenerationData,
    onOpenExternalGeneration,
    allShots,
    isCurrentMediaPositioned,
    onReplaceInShot,
    sourcePrimaryVariant,
    onMakeMainVariant,
    canMakeMainVariant,
    editMode,
    setEditMode,
    setIsInpaintMode,
    inpaintPrompt,
    setInpaintPrompt,
    inpaintNumGenerations,
    setInpaintNumGenerations,
    loraMode,
    setLoraMode,
    customLoraUrl,
    setCustomLoraUrl,
    isGeneratingInpaint,
    inpaintGenerateSuccess,
    isCreatingMagicEditTasks,
    magicEditTasksCreated,
    brushStrokes,
    handleExitMagicEditMode,
    handleUnifiedGenerate,
    handleGenerateAnnotatedEdit,
    handleGenerateReposition,
    isGeneratingReposition,
    repositionGenerateSuccess,
    hasTransformChanges,
    handleSaveAsVariant,
    isSavingAsVariant,
    saveAsVariantSuccess,
    createAsGeneration,
    onCreateAsGenerationChange,
    // Img2Img props
    img2imgPrompt,
    setImg2imgPrompt,
    img2imgStrength,
    setImg2imgStrength,
    enablePromptExpansion,
    setEnablePromptExpansion,
    isGeneratingImg2Img,
    img2imgGenerateSuccess,
    handleGenerateImg2Img,
    img2imgLoraManager,
    availableLoras,
    editLoraManager,
    advancedSettings,
    setAdvancedSettings,
    isLocalGeneration,
    qwenEditModel,
    setQwenEditModel,
    // InfoPanel props
    isVideo,
    showImageEditTools,
    readOnly,
    isInpaintMode,
    onExitInpaintMode,
    onEnterInpaintMode,
    onEnterVideoEditMode,
    onClose,
    taskDetailsData,
    derivedItems,
    replaceImages,
    onReplaceImagesChange,
    onSwitchToPrimary,
    variantsSectionRef,
    // Shared props
    currentMediaId,
    currentShotId,
    derivedGenerations,
    paginatedDerived,
    derivedPage,
    derivedTotalPages,
    onSetDerivedPage,
    variants,
    activeVariant,
    primaryVariant,
    onVariantSelect,
    onMakePrimary,
    isLoadingVariants,
    // Variant promotion
    onPromoteToGeneration,
    isPromoting,
    // Variant deletion
    onDeleteVariant,
    // Load variant settings
    onLoadVariantSettings,
  } = props;

  // Route to VideoEditPanel
  if (isInVideoEditMode && videoEditSubMode) {
    return (
      <VideoEditPanel
        variant={variant}
        videoEditSubMode={videoEditSubMode}
        onEnterTrimMode={onEnterTrimMode}
        onEnterReplaceMode={onEnterReplaceMode}
        onEnterRegenerateMode={onEnterRegenerateMode}
        onClose={onClose}
        onExitVideoEditMode={onExitVideoEditMode}
        // Trim props
        trimState={trimState}
        onStartTrimChange={onStartTrimChange}
        onEndTrimChange={onEndTrimChange}
        onResetTrim={onResetTrim}
        trimmedDuration={trimmedDuration}
        hasTrimChanges={hasTrimChanges}
        onSaveTrim={onSaveTrim}
        isSavingTrim={isSavingTrim}
        trimSaveProgress={trimSaveProgress}
        trimSaveError={trimSaveError}
        trimSaveSuccess={trimSaveSuccess}
        videoUrl={videoUrl}
        trimCurrentTime={trimCurrentTime}
        trimVideoRef={trimVideoRef}
        // Replace (portion) props
        videoEditing={videoEditing}
        projectId={projectId}
        // Regenerate props
        regenerateFormProps={regenerateFormProps}
        // Variants props
        variants={variants}
        activeVariantId={activeVariant?.id || null}
        onVariantSelect={onVariantSelect}
        onMakePrimary={onMakePrimary}
        isLoadingVariants={isLoadingVariants}
        onPromoteToGeneration={onPromoteToGeneration}
        isPromoting={isPromoting}
        onLoadVariantSettings={onLoadVariantSettings}
        onDeleteVariant={onDeleteVariant}
      />
    );
  }

  // Route to EditModePanel (image editing)
  if (isSpecialEditMode) {
    return (
      <EditModePanel
        sourceGenerationData={sourceGenerationData}
        onOpenExternalGeneration={onOpenExternalGeneration}
        currentShotId={currentShotId}
        allShots={allShots}
        currentMediaId={currentMediaId}
        isCurrentMediaPositioned={isCurrentMediaPositioned}
        onReplaceInShot={onReplaceInShot}
        sourcePrimaryVariant={sourcePrimaryVariant}
        onMakeMainVariant={onMakeMainVariant}
        canMakeMainVariant={canMakeMainVariant}
        editMode={editMode}
        setEditMode={setEditMode}
        setIsInpaintMode={setIsInpaintMode}
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
        setDerivedPage={onSetDerivedPage}
        variants={variants}
        activeVariantId={activeVariant?.id || null}
        onVariantSelect={onVariantSelect}
        onMakePrimary={onMakePrimary}
        isLoadingVariants={isLoadingVariants}
        onPromoteToGeneration={onPromoteToGeneration}
        isPromoting={isPromoting}
        onDeleteVariant={onDeleteVariant}
        onClose={onClose}
        variant={variant}
        createAsGeneration={createAsGeneration}
        onCreateAsGenerationChange={onCreateAsGenerationChange}
        // Img2Img props
        img2imgPrompt={img2imgPrompt}
        setImg2imgPrompt={setImg2imgPrompt}
        img2imgStrength={img2imgStrength}
        setImg2imgStrength={setImg2imgStrength}
        enablePromptExpansion={enablePromptExpansion}
        setEnablePromptExpansion={setEnablePromptExpansion}
        isGeneratingImg2Img={isGeneratingImg2Img}
        img2imgGenerateSuccess={img2imgGenerateSuccess}
        handleGenerateImg2Img={handleGenerateImg2Img}
        img2imgLoraManager={img2imgLoraManager}
        availableLoras={availableLoras}
        editLoraManager={editLoraManager}
        advancedSettings={advancedSettings}
        setAdvancedSettings={setAdvancedSettings}
        isLocalGeneration={isLocalGeneration}
        qwenEditModel={qwenEditModel}
        setQwenEditModel={setQwenEditModel}
      />
    );
  }

  // Default: InfoPanel
  return (
    <InfoPanel
      variant={variant}
      // Header props
      isVideo={isVideo}
      showImageEditTools={showImageEditTools}
      readOnly={readOnly}
      isInpaintMode={isInpaintMode}
      isInVideoEditMode={isInVideoEditMode}
      onExitInpaintMode={onExitInpaintMode}
      onEnterInpaintMode={onEnterInpaintMode}
      onExitVideoEditMode={onExitVideoEditMode}
      onEnterVideoEditMode={onEnterVideoEditMode}
      onClose={onClose}
      // TaskDetails props
      taskDetailsData={taskDetailsData}
      derivedItems={derivedItems}
      derivedGenerations={derivedGenerations}
      paginatedDerived={paginatedDerived}
      derivedPage={derivedPage}
      derivedTotalPages={derivedTotalPages}
      onSetDerivedPage={onSetDerivedPage}
      onNavigateToGeneration={onOpenExternalGeneration}
      currentMediaId={currentMediaId}
      currentShotId={currentShotId}
      replaceImages={replaceImages}
      onReplaceImagesChange={onReplaceImagesChange}
      activeVariant={activeVariant}
      primaryVariant={primaryVariant}
      onSwitchToPrimary={onSwitchToPrimary}
      // Variants props
      variants={variants}
      onVariantSelect={onVariantSelect}
      onMakePrimary={onMakePrimary}
      isLoadingVariants={isLoadingVariants}
      variantsSectionRef={variantsSectionRef}
      onPromoteToGeneration={onPromoteToGeneration}
      isPromoting={isPromoting}
      onDeleteVariant={onDeleteVariant}
    />
  );
};

export default ControlsPanel;
