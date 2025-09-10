import React from "react";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { SliderWithValue } from "@/shared/components/ui/slider-with-value";
import { Trash2 } from "lucide-react";
import { ActiveLoRAsDisplay, ActiveLora } from "@/shared/components/ActiveLoRAsDisplay";
import { LoraModel } from "@/shared/components/LoraSelectorModal";
import FileInput from "@/shared/components/FileInput";
import { GenerationMode } from "../types";

interface ModelSectionProps {
  selectedModel: GenerationMode;
  isGenerating: boolean;
  availableLoras: LoraModel[];
  selectedLoras: ActiveLora[];
  styleReferenceImage: string | null;
  styleReferenceStrength: number;
  isUploadingStyleReference: boolean;
  onModelChange: (value: GenerationMode) => void;
  onAddLora: (lora: LoraModel) => void;
  onRemoveLora: (loraId: string) => void;
  onLoraStrengthChange: (loraId: string, strength: number) => void;
  onOpenLoraModal: () => void;
  onStyleUpload: (files: File[]) => void;
  onStyleRemove: () => void;
  onStyleStrengthChange: (value: number) => void;
  renderLoraHeaderActions?: () => React.ReactNode;
  onAddTriggerWord?: (loraId: string, triggerWord: string) => void;
}

// Small in-file components for organization
const LoraSection: React.FC<{
  selectedLoras: ActiveLora[];
  availableLoras: LoraModel[];
  isGenerating: boolean;
  onRemoveLora: (loraId: string) => void;
  onLoraStrengthChange: (loraId: string, strength: number) => void;
  onOpenLoraModal: () => void;
  renderLoraHeaderActions?: () => React.ReactNode;
  onAddTriggerWord?: (loraId: string, triggerWord: string) => void;
}> = ({
  selectedLoras,
  availableLoras,
  isGenerating,
  onRemoveLora,
  onLoraStrengthChange,
  onOpenLoraModal,
  renderLoraHeaderActions,
  onAddTriggerWord,
}) => (
  <div className="space-y-2">
    <div className="space-y-1">
      <Label className="text-lg font-medium text-slate-700 dark:text-slate-200 border-l-8 border-purple-200/60 pl-3 py-1 relative">
        LoRAs
        <span className="absolute top-1/2 left-full transform -translate-y-1/2 ml-2.5 w-12 h-2 bg-purple-200/60 rounded-full"></span>
      </Label>
    </div>

    {/* Active LoRAs Display */}
    <ActiveLoRAsDisplay
      selectedLoras={selectedLoras}
      onRemoveLora={onRemoveLora}
      onLoraStrengthChange={onLoraStrengthChange}
      isGenerating={isGenerating}
      availableLoras={availableLoras}
      className=""
      onAddTriggerWord={onAddTriggerWord}
      renderHeaderActions={() => (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onOpenLoraModal}
            disabled={isGenerating}
          >
            Add or Manage LoRAs
          </Button>
          {renderLoraHeaderActions?.()}
        </div>
      )}
    />
  </div>
);

const StyleReferenceSection: React.FC<{
  styleReferenceImage: string | null;
  styleReferenceStrength: number;
  isUploadingStyleReference: boolean;
  isGenerating: boolean;
  onStyleUpload: (files: File[]) => void;
  onStyleRemove: () => void;
  onStyleStrengthChange: (value: number) => void;
}> = ({
  styleReferenceImage,
  styleReferenceStrength,
  isUploadingStyleReference,
  isGenerating,
  onStyleUpload,
  onStyleRemove,
  onStyleStrengthChange,
}) => (
  <div className="space-y-2">
    <div className="space-y-1">
      <Label className="text-lg font-medium text-slate-700 dark:text-slate-200 border-l-8 border-purple-200/60 pl-3 py-1 relative">
        References
        <span className="absolute top-1/2 left-full transform -translate-y-1/2 ml-2.5 w-12 h-2 bg-purple-200/60 rounded-full"></span>
      </Label>
    </div>

    {/* Style Reference Upload */}
    <div className="space-y-3">
      {styleReferenceImage ? (
        /* Display uploaded style reference */
        <div className="w-1/3">
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50 relative">
            <div className="flex flex-col items-center space-y-3">
              <div className="relative w-full">
                <img
                  src={styleReferenceImage}
                  alt="Style Reference"
                  className="w-full aspect-square object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                />
                <div className="absolute top-2 left-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded px-2 py-1 border border-gray-200 dark:border-gray-600 z-10">
                  <p className="text-xs font-light text-gray-600 dark:text-gray-400">Style</p>
                </div>
                <div className="absolute top-2 right-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-full p-0.5 border border-gray-200 dark:border-gray-600 z-10">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onStyleRemove}
                    disabled={isGenerating}
                    className="h-5 w-5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </Button>
                </div>
              </div>
              <div className="w-full">
                <SliderWithValue
                  label="Strength"
                  value={styleReferenceStrength}
                  onChange={onStyleStrengthChange}
                  min={0.1}
                  max={2.0}
                  step={0.1}
                  disabled={isGenerating}
                  numberInputClassName="w-10"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Upload area for style reference */
        <div className="w-1/3">
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50 relative">
            <div className="absolute top-2 left-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded px-2 py-1 border border-gray-200 dark:border-gray-600 z-10">
              <p className="text-xs font-light text-gray-600 dark:text-gray-400">Style</p>
            </div>
            <FileInput
              onFileChange={onStyleUpload}
              acceptTypes={['image']}
              multiple={false}
              disabled={isGenerating}
              label=""
              className="w-full"
              suppressSelectionSummary
              suppressRemoveAll
              suppressAcceptedTypes
              showLoaderDuringSingleSelection
              loaderDurationMs={400}
              forceLoading={isUploadingStyleReference}
            />
          </div>
        </div>
      )}
    </div>
  </div>
);

export const ModelSection: React.FC<ModelSectionProps> = ({
  selectedModel,
  isGenerating,
  availableLoras,
  selectedLoras,
  styleReferenceImage,
  styleReferenceStrength,
  isUploadingStyleReference,
  onModelChange,
  onAddLora,
  onRemoveLora,
  onLoraStrengthChange,
  onOpenLoraModal,
  onStyleUpload,
  onStyleRemove,
  onStyleStrengthChange,
  renderLoraHeaderActions,
  onAddTriggerWord,
}) => {
  return (
    <div className="flex-1">
      {/* Model Section */}
      <div className="space-y-4 mb-6">
        <div className="space-y-2">
          <Label htmlFor="model" className="text-lg font-medium text-slate-700 dark:text-slate-200 border-l-8 border-blue-200/60 pl-3 py-1 relative">
            Model
            <span className="absolute top-1/2 left-full transform -translate-y-1/2 ml-2.5 w-12 h-2 bg-blue-200/60 rounded-full"></span>
          </Label>
          <div className="w-1/2">
            <Select
              value={selectedModel}
              onValueChange={onModelChange}
              disabled={isGenerating}
            >
              <SelectTrigger id="model">
                <SelectValue placeholder="Select model..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wan-local">Wan 2.2</SelectItem>
                <SelectItem value="qwen-image">Qwen.Image</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Conditional LoRA or Style Reference Section */}
      {selectedModel === 'wan-local' ? (
        <LoraSection
          selectedLoras={selectedLoras}
          availableLoras={availableLoras}
          isGenerating={isGenerating}
          onRemoveLora={onRemoveLora}
          onLoraStrengthChange={onLoraStrengthChange}
          onOpenLoraModal={onOpenLoraModal}
          renderLoraHeaderActions={renderLoraHeaderActions}
          onAddTriggerWord={onAddTriggerWord}
        />
      ) : (
        <StyleReferenceSection
          styleReferenceImage={styleReferenceImage}
          styleReferenceStrength={styleReferenceStrength}
          isUploadingStyleReference={isUploadingStyleReference}
          isGenerating={isGenerating}
          onStyleUpload={onStyleUpload}
          onStyleRemove={onStyleRemove}
          onStyleStrengthChange={onStyleStrengthChange}
        />
      )}
    </div>
  );
};
