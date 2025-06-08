import React, { useState, useEffect } from "react";
import { Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { toast } from "sonner";

interface SettingsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  currentFalApiKey: string;
  onSaveApiKeys: (falApiKey: string, openaiApiKey: string, replicateApiKey: string) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onOpenChange,
  currentFalApiKey,
  onSaveApiKeys,
}) => {
  const [falApiKey, setFalApiKey] = useState<string>(currentFalApiKey);
  const [openaiApiKey, setOpenaiApiKey] = useState<string>("");
  const [replicateApiKey, setReplicateApiKey] = useState<string>("");
  const [isFalKeyMasked, setIsFalKeyMasked] = useState(false);
  const [isOpenAIKeyMasked, setIsOpenAIKeyMasked] = useState(false);
  const [isReplicateKeyMasked, setIsReplicateKeyMasked] = useState(false);

  // Load API keys from localStorage if they exist
  useEffect(() => {
    setFalApiKey(currentFalApiKey);
    if (currentFalApiKey && currentFalApiKey !== '0b6f1876-0aab-4b56-b821-b384b64768fa:121392c885a381f93de56d701e3d532f') {
      setIsFalKeyMasked(true);
    }
    
    const storedOpenaiKey = localStorage.getItem('openai_api_key') || "";
    if (storedOpenaiKey) {
      setOpenaiApiKey(storedOpenaiKey);
      setIsOpenAIKeyMasked(true);
    }

    const storedReplicateKey = localStorage.getItem('replicate_api_key') || "";
    if (storedReplicateKey) {
      setReplicateApiKey(storedReplicateKey);
      setIsReplicateKeyMasked(true);
    }
  }, [currentFalApiKey, isOpen]);

  const handleSave = () => {
    // Save the API keys and close the modal
    // If masked, don't override with masked value
    const newFalKey = isFalKeyMasked && falApiKey === "••••••••••••••••••••••" 
      ? currentFalApiKey 
      : falApiKey;
      
    const newOpenAIKey = isOpenAIKeyMasked && openaiApiKey === "••••••••••••••••••••••" 
      ? localStorage.getItem('openai_api_key') || "" 
      : openaiApiKey;
    
    const newReplicateKey = isReplicateKeyMasked && replicateApiKey === "••••••••••••••••••••••"
      ? localStorage.getItem('replicate_api_key') || ""
      : replicateApiKey;

    onSaveApiKeys(newFalKey, newOpenAIKey, newReplicateKey);
    onOpenChange(false);
    toast.success("Settings saved successfully");
  };

  const handleFalKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFalApiKey(e.target.value);
    setIsFalKeyMasked(false);
  };

  const handleOpenAIKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOpenaiApiKey(e.target.value);
    setIsOpenAIKeyMasked(false);
  };

  const handleReplicateKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setReplicateApiKey(e.target.value);
    setIsReplicateKeyMasked(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>API Settings</DialogTitle>
          <DialogDescription>
            Configure your API keys for image generation services.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="fal-api-key">Fal.ai API Key</Label>
            <Input
              id="fal-api-key"
              type="text"
              value={isFalKeyMasked ? "••••••••••••••••••••••" : falApiKey}
              onChange={handleFalKeyChange}
              placeholder="Enter your Fal.ai API key"
              className="w-full"
            />
            <p className="text-xs text-gray-500">
              Used for image generation with Fal.ai services.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="openai-api-key">OpenAI API Key (not used yet)</Label>
            <Input
              id="openai-api-key"
              type="text"
              value={isOpenAIKeyMasked ? "••••••••••••••••••••••" : openaiApiKey}
              onChange={handleOpenAIKeyChange}
              placeholder="Enter your OpenAI API key"
              className="w-full"
            />
            <p className="text-xs text-gray-500">
              Will be used for future AI features.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="replicate-api-key">Replicate API Key</Label>
            <Input
              id="replicate-api-key"
              type="text"
              value={isReplicateKeyMasked ? "••••••••••••••••••••••" : replicateApiKey}
              onChange={handleReplicateKeyChange}
              placeholder="Enter your Replicate API key"
              className="w-full"
            />
            <p className="text-xs text-gray-500">
              Used for upscaling images with Replicate.
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave}>Save Settings</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;
