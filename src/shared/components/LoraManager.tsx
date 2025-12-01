import React from 'react';
import { Button } from './ui/button';
import { ActiveLoRAsDisplay } from './ActiveLoRAsDisplay';
import { LoraSelectorModal } from './LoraSelectorModal';
import { useLoraManager, UseLoraManagerOptions, UseLoraManagerReturn, LoraModel } from '@/shared/hooks/useLoraManager';

export interface LoraManagerProps extends UseLoraManagerOptions {
  availableLoras: LoraModel[];
  className?: string;
  title?: string;
  addButtonText?: string;
  fullWidth?: boolean;
  /** Optional external loraManager instance. If provided, uses this instead of creating a new one. */
  externalLoraManager?: UseLoraManagerReturn;
}

export const LoraManager: React.FC<LoraManagerProps> = ({
  availableLoras,
  className = "",
  title = "LoRA Models",
  addButtonText = "Add or Manage LoRAs",
  fullWidth = true,
  externalLoraManager,
  ...options
}) => {
  // Use external manager if provided, otherwise create our own
  const internalLoraManager = useLoraManager(availableLoras, options);
  const loraManager = externalLoraManager ?? internalLoraManager;

  return (
    <div className={`space-y-4 ${className}`}>
      <h3 className="font-light text-sm">{title}</h3>
      
      <Button 
        type="button" 
        variant="outline" 
        className={fullWidth ? "w-full" : ""} 
        onClick={() => loraManager.setIsLoraModalOpen(true)}
      >
        {addButtonText}
      </Button>
      
      <ActiveLoRAsDisplay
        selectedLoras={loraManager.selectedLoras}
        onRemoveLora={loraManager.handleRemoveLora}
        onLoraStrengthChange={loraManager.handleLoraStrengthChange}
        availableLoras={availableLoras}
        className="mt-4"
        onAddTriggerWord={loraManager.handleAddTriggerWord}
        renderHeaderActions={loraManager.renderHeaderActions}
      />

      <LoraSelectorModal
        isOpen={loraManager.isLoraModalOpen}
        onClose={() => loraManager.setIsLoraModalOpen(false)}
        loras={availableLoras}
        onAddLora={loraManager.handleAddLora}
        onRemoveLora={loraManager.handleRemoveLora}
        onUpdateLoraStrength={loraManager.handleLoraStrengthChange}
        selectedLoras={loraManager.selectedLoras.map(lora => {
          const fullLora = availableLoras.find(l => l['Model ID'] === lora.id);
          return {
            ...fullLora,
            "Model ID": lora.id,
            Name: lora.name,
            strength: lora.strength,
          } as LoraModel & { strength: number };
        })}
        lora_type="Wan 2.1 14b"
      />
    </div>
  );
};

export default LoraManager; 