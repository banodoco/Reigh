import React, { useState, useEffect } from "react";
import { Settings, Key, Copy, Trash2, AlertCircle, Terminal } from "lucide-react";
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
import { Separator } from "@/shared/components/ui/separator";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { toast } from "sonner";
import { useApiKeys } from "@/shared/hooks/useApiKeys";
import { useApiTokens } from "@/shared/hooks/useApiTokens";
import usePersistentState from "@/shared/hooks/usePersistentState";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { formatDistanceToNow } from "date-fns";

interface SettingsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onOpenChange,
}) => {
  const { apiKeys, isLoading: isLoadingKeys, saveApiKeys, isUpdating } = useApiKeys();
  const { 
    tokens, 
    isLoading: isLoadingTokens, 
    generateToken, 
    revokeToken, 
    isGenerating,
    generatedToken,
    clearGeneratedToken,
    isRevoking,
    refreshToken,
    isRefreshing,
  } = useApiTokens();
  
  const [falApiKey, setFalApiKey] = useState<string>("");
  const [openaiApiKey, setOpenaiApiKey] = useState<string>("");
  const [replicateApiKey, setReplicateApiKey] = useState<string>("");
  const [isFalKeyMasked, setIsFalKeyMasked] = useState(false);
  const [isOpenAIKeyMasked, setIsOpenAIKeyMasked] = useState(false);
  const [isReplicateKeyMasked, setIsReplicateKeyMasked] = useState(false);
  
  // Main tab state
  const [activeMainTab, setActiveMainTab] = useState<string>("generate-locally");
  
  // Installation tab preference (persistent)
  const [activeInstallTab, setActiveInstallTab] = usePersistentState<string>("settings-install-tab", "need-install");
  
  // Generation method preferences (persistent)
  const [onComputerChecked, setOnComputerChecked] = usePersistentState<boolean>("generation-on-computer", true);
  const [inCloudChecked, setInCloudChecked] = usePersistentState<boolean>("generation-in-cloud", true);

  // Copy command feedback states
  const [copiedInstallCommand, setCopiedInstallCommand] = useState(false);
  const [copiedRunCommand, setCopiedRunCommand] = useState(false);

  // Show / hide full command previews
  const [showFullInstallCommand, setShowFullInstallCommand] = useState(false);
  const [showFullRunCommand, setShowFullRunCommand] = useState(false);
  
  // Load API keys from the database when they change
  useEffect(() => {
    if (apiKeys && isOpen) {
      const falKey = apiKeys.fal_api_key || '';
      const openaiKey = apiKeys.openai_api_key || '';
      const replicateKey = apiKeys.replicate_api_key || '';
      
      setFalApiKey(falKey);
      setOpenaiApiKey(openaiKey);
      setReplicateApiKey(replicateKey);
      
      // Set masking state for existing keys
      setIsFalKeyMasked(!!falKey);
      setIsOpenAIKeyMasked(!!openaiKey);
      setIsReplicateKeyMasked(!!replicateKey);
    }
  }, [apiKeys, isOpen]);

  const handleSaveKeys = () => {
    // Save the API keys to the database
    // If masked, don't override with masked value
    const newFalKey = isFalKeyMasked && falApiKey === "••••••••••••••••••••••" 
      ? apiKeys.fal_api_key || ""
      : falApiKey;
      
    const newOpenAIKey = isOpenAIKeyMasked && openaiApiKey === "••••••••••••••••••••••" 
      ? apiKeys.openai_api_key || ""
      : openaiApiKey;
    
    const newReplicateKey = isReplicateKeyMasked && replicateApiKey === "••••••••••••••••••••••"
      ? apiKeys.replicate_api_key || ""
      : replicateApiKey;

    saveApiKeys({
      fal_api_key: newFalKey,
      openai_api_key: newOpenAIKey,
      replicate_api_key: newReplicateKey,
    });
    
    onOpenChange(false);
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

  const handleGenerateToken = () => {
    // Default label and 6 months expiry
    const defaultLabel = "Local Generator";
    const expiresInDays = 180; // 6 months
    generateToken(defaultLabel, expiresInDays);
  };

  const handleCopyToken = () => {
    if (generatedToken) {
      navigator.clipboard.writeText(generatedToken);
      toast.success("Token copied to clipboard");
    }
  };

  const formatExpiryDate = (expiresAt: string) => {
    const date = new Date(expiresAt);
    return formatDistanceToNow(date, { addSuffix: true });
  };

  const isTokenExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  const hasValidToken = tokens.some(token => !isTokenExpired(token.expires_at));

  const getActiveToken = () => {
    return tokens.find(token => !isTokenExpired(token.expires_at));
  };

  // Handle copying commands and provide inline visual feedback instead of a toast
  const handleCopyInstallCommand = () => {
    navigator.clipboard.writeText(getInstallationCommand());
    setCopiedInstallCommand(true);
    setTimeout(() => setCopiedInstallCommand(false), 3000);
  };

  const handleCopyRunCommand = () => {
    navigator.clipboard.writeText(getRunCommand());
    setCopiedRunCommand(true);
    setTimeout(() => setCopiedRunCommand(false), 3000);
  };

  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjenlzcXp4bHdkbmRneGl0cnZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1MDI4NjgsImV4cCI6MjA2NzA3ODg2OH0.r-4RyHZiDibUjgdgDDM2Vo6x3YpgIO5-BTwfkB2qyYA";

  const getInstallationCommand = () => {
    // Use the actual token from database or freshly generated one
    const token = generatedToken || getActiveToken()?.token || 'your-jwt-token';
    return `git clone https://github.com/peteromallet/Headless-Wan2GP && \\
cd /workspace/Headless-Wan2GP && \\
apt-get update && apt-get install -y python3.10-venv ffmpeg && \\
python3.10 -m venv venv && \\
source venv/bin/activate && \\
pip install --no-cache-dir torch==2.6.0 torchvision torchaudio -f https://download.pytorch.org/whl/cu124 && \\
pip install --no-cache-dir -r Wan2GP/requirements.txt && \\
pip install --no-cache-dir -r requirements.txt && \\
python headless.py --db-type supabase \\
  --supabase-url https://wczysqzxlwdndgxitrvc.supabase.co \\
  --supabase-anon-key ${SUPABASE_ANON_KEY} \
  --supabase-access-token ${token}`;
  };

  const getRunCommand = () => {
    // Use the actual token from database or freshly generated one
    const token = generatedToken || getActiveToken()?.token || 'your-jwt-token';
    return `python headless.py --db-type supabase \\
  --supabase-url https://wczysqzxlwdndgxitrvc.supabase.co \\
  --supabase-anon-key ${SUPABASE_ANON_KEY} \
  --supabase-access-token ${token}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">App Settings</DialogTitle>
          <DialogDescription>
            Configure local generation and manage your API keys.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="generate-locally">Local Generation</TabsTrigger>
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          </TabsList>

                    <TabsContent value="generate-locally" className="space-y-4">
            <div className="space-y-4">
              {/* Generation Method Selection */}
              <div className="grid grid-cols-2 gap-6 items-start">
                {/* Left column: options */}
                <div className="space-y-4">
                  <h3 className="font-semibold">How would you like to generate?</h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="on-computer"
                        checked={onComputerChecked}
                        onCheckedChange={(checked) => setOnComputerChecked(checked === true)}
                      />
                      <label
                        htmlFor="on-computer"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        On my computer {activeInstallTab !== "already-installed" && "(requires setup - below)"}
                      </label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="in-cloud"
                        checked={inCloudChecked}
                        onCheckedChange={(checked) => setInCloudChecked(checked === true)}
                      />
                      <label
                        htmlFor="in-cloud"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        In the cloud{" "}
                        <a href="#" className="text-blue-600 hover:text-blue-800">
                          (requires credits - link)
                        </a>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Right column: GIF */}
                <div className="flex justify-start items-start">
                  {!onComputerChecked && !inCloudChecked && (
                    <img
                      src="https://wczysqzxlwdndgxitrvc.supabase.co/storage/v1/object/public/image_uploads/files/ds.gif"
                      alt="Choose generation method"
                      className="w-[120px] h-[120px] object-contain transform scale-x-[-1]"
                    />
                  )}
                </div>
              </div>

              {/* Local Generation Setup - Only show when "On my computer" is checked */}
              {onComputerChecked && (
                <div className="space-y-4">
                  {!hasValidToken ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Key className="h-5 w-5 text-blue-600" />
                          <h4 className="font-semibold text-blue-900">Generate an API Key</h4>
                        </div>
                        <p className="text-sm text-blue-700 mb-4">
                          You'll need an API key to authenticate your local worker with our servers.
                        </p>
                        <Button 
                          onClick={handleGenerateToken} 
                          disabled={isGenerating}
                          className="w-full"
                        >
                          {isGenerating ? "Generating..." : "Generate API Key"}
                        </Button>
                      </div>

                      {/* Show expired tokens if any */}
                      {tokens.some(token => isTokenExpired(token.expires_at)) && (
                        <Alert className="border-orange-200 bg-orange-50">
                          <AlertCircle className="h-4 w-4 text-orange-600" />
                          <AlertDescription className="text-orange-800">
                            Your API token has expired. Please generate a new one to continue using local generation.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Token Display and Management */}
                      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-semibold text-gray-800">Active API Token</h4>
                            <p className="text-sm text-gray-600">
                              Expires {formatDistanceToNow(new Date(getActiveToken()?.expires_at || 0), { addSuffix: true })}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => refreshToken(getActiveToken()!)}
                              disabled={isRefreshing || isRevoking || !getActiveToken()}
                            >
                              {isRefreshing ? "Refreshing..." : "Refresh"}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => revokeToken(getActiveToken()!.id)}
                              disabled={isRevoking || isRefreshing || !getActiveToken()}
                            >
                              {isRevoking ? "Revoking..." : "Revoke"}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Installation section */}
                      <div className="space-y-4">
                        <h4 className="font-semibold">Run on your computer:</h4>
                        
                        <Tabs value={activeInstallTab} onValueChange={setActiveInstallTab} className="w-full">
                          <TabsList className="grid w-full grid-cols-2 bg-gray-100 border border-gray-200">
                            <TabsTrigger 
                              value="need-install"
                              className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
                            >
                              I need to install
                            </TabsTrigger>
                            <TabsTrigger 
                              value="already-installed"
                              className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
                            >
                              I've already installed
                            </TabsTrigger>
                          </TabsList>

                        <TabsContent value="need-install" className="space-y-4">
                          <div className="space-y-4">
                            <div>
                              
                              <p className="text-sm text-gray-600 mb-4">
                                Run this command to install and start the local worker:
                              </p>
                            </div>

                            <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                              <pre className="whitespace-pre-wrap break-all">
                                {showFullInstallCommand
                                  ? getInstallationCommand()
                                  : `${getInstallationCommand()
                                      .split("\n")
                                      .slice(0, 3)
                                      .join("\n")}\n...`}
                              </pre>
                            </div>

                            {getInstallationCommand().split("\n").length > 3 && (
                              <Button
                                variant="link"
                                size="sm"
                                onClick={() => setShowFullInstallCommand(!showFullInstallCommand)}
                                className="px-0"
                              >
                                {showFullInstallCommand ? "Hide command" : "Reveal full command"}
                              </Button>
                            )}

                            <Button 
                              onClick={handleCopyInstallCommand}
                              variant="wes"
                              size="wes-default"
                              className="w-full"
                            >
                              {copiedInstallCommand ? (
                                "Copied!"
                              ) : (
                                <>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy Installation Command
                                </>
                              )}
                            </Button>
                          </div>
                        </TabsContent>

                        <TabsContent value="already-installed" className="space-y-4">
                          <div className="space-y-4">
                            <div>                              
                              <p className="text-sm text-gray-600 mb-4">
                                Use this command to start your local worker:
                              </p>
                            </div>

                            <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                              <pre className="whitespace-pre-wrap break-all">
                                {showFullRunCommand
                                  ? getRunCommand()
                                  : `${getRunCommand()
                                      .split("\n")
                                      .slice(0, 3)
                                      .join("\n")}\n...`}
                              </pre>
                            </div>

                            {getRunCommand().split("\n").length > 3 && (
                              <Button
                                variant="link"
                                size="sm"
                                onClick={() => setShowFullRunCommand(!showFullRunCommand)}
                                className="px-0"
                              >
                                {showFullRunCommand ? "Hide command" : "Reveal full command"}
                              </Button>
                            )}

                            <Button 
                              onClick={handleCopyRunCommand}
                              variant="wes"
                              size="wes-default"
                              className="w-full"
                            >
                              {copiedRunCommand ? (
                                "Copied!"
                              ) : (
                                <>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy Run Command
                                </>
                              )}
                            </Button>
                          </div>
                        </TabsContent>
                      </Tabs>
                      </div>
                    </div>
                  )}


                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="api-keys" className="space-y-4">
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold mb-2">Service API Keys</h3>
                <p className="text-sm text-gray-500 mb-4">
                  API keys for external services used by the application.
                </p>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fal-api-key">Fal.ai API Key</Label>
                  <Input
                    id="fal-api-key"
                    type="text"
                    value={isFalKeyMasked ? "••••••••••••••••••••••" : falApiKey}
                    onChange={handleFalKeyChange}
                    placeholder="Enter your Fal.ai API key"
                    className="w-full"
                    disabled={isLoadingKeys}
                  />
                  <p className="text-xs text-gray-500">
                    Used for image generation with Fal.ai services.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="openai-api-key">OpenAI API Key</Label>
                  <Input
                    id="openai-api-key"
                    type="text"
                    value={isOpenAIKeyMasked ? "••••••••••••••••••••••" : openaiApiKey}
                    onChange={handleOpenAIKeyChange}
                    placeholder="Enter your OpenAI API key"
                    className="w-full"
                    disabled={isLoadingKeys}
                  />
                  <p className="text-xs text-gray-500">
                    Used for prompt enhancement and AI features.
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
                    disabled={isLoadingKeys}
                  />
                  <p className="text-xs text-gray-500">
                    Used for upscaling images with Replicate.
                  </p>
                </div>
              </div>
              
              <div className="flex justify-end">
                <Button 
                  onClick={handleSaveKeys} 
                  disabled={isLoadingKeys || isUpdating}
                >
                  {isUpdating ? "Saving..." : "Save API Keys"}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;
