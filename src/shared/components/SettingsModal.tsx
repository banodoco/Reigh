import React, { useState, useEffect, useMemo } from "react";
import { Settings, Key, Copy, Trash2, AlertCircle, Terminal, Coins, Monitor, LogOut, HelpCircle } from "lucide-react";
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
import { useCredits } from "@/shared/hooks/useCredits";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { useUserUIState } from "@/shared/hooks/useUserUIState";
import CreditsManagement from "./CreditsManagement";

interface SettingsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  initialTab?: string;
  creditsTab?: 'purchase' | 'history' | 'task-log';
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onOpenChange,
  initialTab = "generate-locally",
  creditsTab = "purchase",
}) => {
  // Use a fixed maxHeight so the modal always floats above panes without shrinking.
  const modalStyle = useMemo(() => ({
    // 64px gives a bit of breathing room above and below the viewport
    maxHeight: `calc(100vh - 64px)`,
  }), []);
  const isMobile = useIsMobile();
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
  const { balance, formatCurrency } = useCredits();
  
  const [falApiKey, setFalApiKey] = useState<string>("");
  const [openaiApiKey, setOpenaiApiKey] = useState<string>("");
  const [replicateApiKey, setReplicateApiKey] = useState<string>("");
  const [isFalKeyMasked, setIsFalKeyMasked] = useState(false);
  const [isOpenAIKeyMasked, setIsOpenAIKeyMasked] = useState(false);
  const [isReplicateKeyMasked, setIsReplicateKeyMasked] = useState(false);
  
  // Installation tab preference (persistent)
  const [activeInstallTab, setActiveInstallTab] = usePersistentState<string>("settings-install-tab", "need-install");
  
  // Computer type preference (persistent)
  const [computerType, setComputerType] = usePersistentState<string>("computer-type", "linux");
  
  // Generation method preferences (database-backed)
  const { 
    value: generationMethods, 
    update: updateGenerationMethods, 
    isLoading: isLoadingGenerationMethods 
  } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  
  const onComputerChecked = generationMethods.onComputer;
  const inCloudChecked = generationMethods.inCloud;

  // Copy command feedback states
  const [copiedInstallCommand, setCopiedInstallCommand] = useState(false);
  const [copiedRunCommand, setCopiedRunCommand] = useState(false);
  const [copiedAIInstructions, setCopiedAIInstructions] = useState(false);

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
    // Default label
    const defaultLabel = "Local Generator";
    generateToken(defaultLabel);
  };

  const handleCopyToken = () => {
    if (generatedToken) {
      navigator.clipboard.writeText(generatedToken);

    }
  };

  const hasValidToken = tokens.length > 0;

  const getActiveToken = () => {
    return tokens[0]; // Just return the first token since we no longer have expiry
  };

  const formatTokenAge = (createdAt: string | number) => {
    const now = new Date();
    const created = new Date(createdAt);
    const diffInMs = now.getTime() - created.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInMinutes < 1) {
      return "< 1 min old token";
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} min old token`;
    } else if (diffInHours < 24) {
      return `${diffInHours}h old token`;
    } else {
      return `${diffInDays}d old token`;
    }
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

  const generateAIInstructions = () => {
    const token = generatedToken || getActiveToken()?.token || 'your-api-token';
    const isWindows = computerType === "windows";
    const isInstalling = activeInstallTab === "need-install";
    
    const prerequisites = isWindows ? `

PREREQUISITES (Windows only - install these first):
1. Python 3.10+ from python.org (NOT Microsoft Store)
   - During install, check "Add Python to PATH"
   - Verify with: python --version

2. Git from git-scm.com/download/win
   - Use default settings during installation
   - Verify with: git --version

3. FFmpeg from ffmpeg.org/download.html
   - Download "Windows builds by BtbN" (recommended)
   - Extract to C:\\ffmpeg
   - Add C:\\ffmpeg\\bin to system PATH
   - Verify with: ffmpeg -version
   - Need PATH help? Search "Windows add to PATH" on YouTube
` : '';

    const installCommand = isInstalling ? getInstallationCommand() : getRunCommand();
    const commandType = isInstalling ? "INSTALLATION" : "RUN";
    
    return `I'm trying to set up a local AI worker for Reigh and need help troubleshooting. 

FIRST - Please ask me these questions to understand my setup:
1. What's my operating system and version?
2. What graphics card do I have and how much VRAM? (need at least 8GB for local AI processing)
3. What's my total system RAM?
4. How much free disk space do I have? (AI models can be 10+ GB)
5. Am I using a laptop or desktop computer?
6. Am I getting any specific error messages? If so, what exactly?
7. Have I completed the prerequisites for my system?
8. Do I have experience setting up AI/ML tools before?

SYSTEM REQUIREMENTS:
- Minimum 8GB VRAM (graphics card memory) for local AI processing
- Windows 10/11, Linux, or Mac (though Mac isn't currently supported for local processing)
- Git, Python 3.10+, FFmpeg installed${prerequisites}

MY CURRENT SITUATION:
- Operating System: ${computerType === "windows" ? "Windows" : computerType === "linux" ? "Linux" : "Mac"}
- Task: ${isInstalling ? "Initial installation" : "Running existing installation"}
- Status: Encountering errors

${commandType} COMMAND I'M USING:
\`\`\`
${installCommand}
\`\`\`

WHAT I NEED:
After understanding my system specs, please guide me step-by-step through this process. If I encounter any errors:
1. Help me understand what went wrong
2. Provide the exact commands to fix it
3. Explain how to verify each step worked
4. Tell me what to do next

Please be very specific with file paths, command syntax, and verification steps since I'm on ${computerType === "windows" ? "Windows" : computerType}.`;
  };

  const handleCopyAIInstructions = () => {
    navigator.clipboard.writeText(generateAIInstructions());
    setCopiedAIInstructions(true);
    setTimeout(() => setCopiedAIInstructions(false), 3000);
  };

  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjenlzcXp4bHdkbmRneGl0cnZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1MDI4NjgsImV4cCI6MjA2NzA3ODg2OH0.r-4RyHZiDibUjgdgDDM2Vo6x3YpgIO5-BTwfkB2qyYA";

  const getInstallationCommand = () => {
    // Use the actual token from database or freshly generated one
    const token = generatedToken || getActiveToken()?.token || 'your-api-token';
    
    if (computerType === "windows") {
      return `git clone https://github.com/peteromallet/Headless-Wan2GP.git
cd Headless-Wan2GP
python -m venv venv
venv\\Scripts\\activate.bat
pip install --no-cache-dir torch==2.6.0 torchvision torchaudio -f https://download.pytorch.org/whl/cu124
pip install --no-cache-dir -r Wan2GP/requirements.txt
pip install --no-cache-dir -r requirements.txt
python worker.py --db-type supabase --supabase-url https://wczysqzxlwdndgxitrvc.supabase.co --supabase-anon-key ${SUPABASE_ANON_KEY} --supabase-access-token ${token}`;
    } else {
      // Linux command (existing)
      return `git clone https://github.com/peteromallet/Headless-Wan2GP && \\
cd Headless-Wan2GP && \\
apt-get update && apt-get install -y python3.10-venv ffmpeg && \\
python3.10 -m venv venv && \\
source venv/bin/activate && \\
pip install --no-cache-dir torch==2.6.0 torchvision torchaudio -f https://download.pytorch.org/whl/cu124 && \\
pip install --no-cache-dir -r Wan2GP/requirements.txt && \\
pip install --no-cache-dir -r requirements.txt && \\
python worker.py --db-type supabase \\
  --supabase-url https://wczysqzxlwdndgxitrvc.supabase.co \\
  --supabase-anon-key ${SUPABASE_ANON_KEY} \\
  --supabase-access-token ${token}`;
    }
  };

  const getRunCommand = () => {
    // Use the actual token from database or freshly generated one
    const token = generatedToken || getActiveToken()?.token || 'your-api-token';
    
    if (computerType === "windows") {
      return `git pull
venv\\Scripts\\activate.bat
python worker.py --db-type supabase --supabase-url https://wczysqzxlwdndgxitrvc.supabase.co --supabase-anon-key ${SUPABASE_ANON_KEY} --supabase-access-token ${token}`;
    } else {
      // Linux / Mac command
      return `git pull && \\
source venv/bin/activate && \\
python worker.py --db-type supabase \\
  --supabase-url https://wczysqzxlwdndgxitrvc.supabase.co \\
  --supabase-anon-key ${SUPABASE_ANON_KEY} \\
  --supabase-access-token ${token}`;
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    onOpenChange(false); // Close the modal after signing out
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        style={modalStyle}
        className={`sm:max-w-2xl overflow-y-auto ${
          isMobile ? 'my-5 max-h-[calc(100vh-2.5rem)]' : ''
        }`}
      >
        <DialogHeader className="relative">
          <DialogTitle className="text-2xl">App Settings</DialogTitle>
          {!isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="absolute top-0 right-0 flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          )}
        </DialogHeader>
        
        {/* Generation Method Selection */}
        <div className="mb-6">
          {/* Mobile header with sign out */}
          {isMobile && (
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-light">How would you like to generate?</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-6 items-start">
            {/* Left column: options */}
            <div className="space-y-4">
              {!isMobile && (
                <h3 className="font-light">How would you like to generate?</h3>
              )}
              
              {isLoadingGenerationMethods ? (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 opacity-50">
                    <div className="w-4 h-4 border-2 border-gray-300 rounded"></div>
                    <span className="text-sm text-muted-foreground">Loading preferences...</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="in-cloud"
                      checked={inCloudChecked}
                      onCheckedChange={(checked) => updateGenerationMethods({ inCloud: checked === true })}
                    />
                    <label
                      htmlFor="in-cloud"
                      className="text-sm font-light leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      In the cloud
                    </label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="on-computer"
                      checked={onComputerChecked}
                      onCheckedChange={(checked) => updateGenerationMethods({ onComputer: checked === true })}
                    />
                    <label
                      htmlFor="on-computer"
                      className="text-sm font-light leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      On my computer
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Right column: GIF */}
            <div className="flex justify-start items-start">
              {!isLoadingGenerationMethods && !onComputerChecked && !inCloudChecked && (
                <img
                  src="https://wczysqzxlwdndgxitrvc.supabase.co/storage/v1/object/public/image_uploads/files/ds.gif"
                  alt="Choose generation method"
                  className="w-[120px] h-[120px] object-contain transform scale-x-[-1]"
                />
              )}
            </div>
          </div>
        </div>

        <div className={`space-y-8 ${isMobile ? 'pb-8' : 'pb-4'}`}>
          {/* Loading state for generation sections */}
          {isLoadingGenerationMethods && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading your generation preferences...</p>
            </div>
          )}

          {/* Credits Management Section */}
          {!isLoadingGenerationMethods && inCloudChecked && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Coins className="w-6 h-6 text-blue-600" />
                <h3 className="text-xl font-normal text-gray-800">Credit Management</h3>
              </div>
              <CreditsManagement initialTab={creditsTab} />
            </div>
          )}

          {/* Local Generation Section */}
          {!isLoadingGenerationMethods && onComputerChecked && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Monitor className="w-6 h-6 text-green-600" />
                <h3 className="text-xl font-normal text-gray-800">Local Generation</h3>
              </div>
              
              {!hasValidToken ? (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Key className="h-5 w-5 text-blue-600" />
                      <h4 className="font-light text-blue-900">To process locally, you need an API Key</h4>
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
                </div>
              ) : (
                <div className="space-y-4">


                  {/* Installation section */}
                  <div className="space-y-4">
                    {/* Computer Type Selection and API Token Display */}
                    <div className="grid grid-cols-2 gap-6 items-start">
                      {/* Left: Computer Type Selection */}
                      <div className="space-y-3">
                        <p className="text-sm font-light">What kind of computer do you have?</p>
                        <div className="flex gap-4 flex-wrap">
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              id="linux"
                              name="computer-type"
                              value="linux"
                              checked={computerType === "linux"}
                              onChange={(e) => setComputerType(e.target.value)}
                              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 focus:ring-2"
                            />
                            <label htmlFor="linux" className="text-sm font-light">
                              Linux
                            </label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              id="windows"
                              name="computer-type"
                              value="windows"
                              checked={computerType === "windows"}
                              onChange={(e) => setComputerType(e.target.value)}
                              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 focus:ring-2"
                            />
                            <label htmlFor="windows" className="text-sm font-light">
                              Windows
                            </label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              id="mac"
                              name="computer-type"
                              value="mac"
                              checked={computerType === "mac"}
                              onChange={(e) => setComputerType(e.target.value)}
                              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 focus:ring-2"
                            />
                            <label htmlFor="mac" className="text-sm font-light">
                              Mac
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Right: API Token Display */}
                      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-600">
                              {formatTokenAge(getActiveToken()?.created_at || 0)}
                            </p>
                          </div>
                          <div className="flex flex-col gap-2">
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
                    </div>
                    
                    {/* Mac Notice - Full Width */}
                    {computerType === "mac" && (
                      <div className="p-4 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl shadow-sm">
                        <div className="flex items-start space-x-3">
                          <div className="flex-shrink-0">
                            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-amber-800 leading-relaxed">
                              You can't process tasks locally on a Mac yet.{" "}
                              <button
                                className="text-blue-600 hover:text-blue-700 underline font-light transition-colors duration-200 hover:bg-blue-50 px-1 py-0.5 rounded"
                                onClick={() => {
                                  updateGenerationMethods({ onComputer: false, inCloud: true });
                                }}
                              >
                                Process in the cloud
                              </button>
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    

                    {computerType !== "mac" && (
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
                          {/* Windows Prerequisites */}
                          {computerType === "windows" && (
                            <Alert>
                              <AlertDescription>
                                <p className="text-sm">
                                  Prerequisites (install manually if not already installed):
                                </p>
                                <ul className="list-disc pl-5 mt-2 text-sm space-y-3">
                                  <li className="flex items-center gap-2">
                                    <span>
                                      Python 3.10+ from {""}
                                      <a
                                        href="https://python.org"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline text-blue-600 hover:text-blue-800"
                                      >
                                        python.org
                                      </a>
                                    </span>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <HelpCircle className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-sm">
                                          <div className="py-2 space-y-2">
                                            <p className="font-medium">Python Installation:</p>
                                            <ol className="text-sm space-y-1 list-decimal list-inside">
                                              <li>Download from python.org (not Microsoft Store)</li>
                                              <li>During install, check "Add Python to PATH"</li>
                                              <li>Verify by typing "python --version" in terminal</li>
                                            </ol>
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </li>
                                  <li className="flex items-center gap-2">
                                    <span>
                                      Git from {""}
                                      <a
                                        href="https://git-scm.com/download/win"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline text-blue-600 hover:text-blue-800"
                                      >
                                        git-scm.com/download/win
                                      </a>
                                    </span>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <HelpCircle className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-sm">
                                          <div className="py-2 space-y-2">
                                            <p className="font-medium">Git Installation:</p>
                                            <ol className="text-sm space-y-1 list-decimal list-inside">
                                              <li>Download Git for Windows installer</li>
                                              <li>Use default settings during installation</li>
                                              <li>Verify by typing "git --version" in terminal</li>
                                              <li>Restart terminal/computer if command not found</li>
                                            </ol>
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </li>
                                  <li className="flex items-center gap-2">
                                    <span>
                                      FFmpeg from {""}
                                      <a
                                        href="https://ffmpeg.org/download.html"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline text-blue-600 hover:text-blue-800"
                                      >
                                        ffmpeg.org/download.html
                                      </a>{" "}
                                      (add to PATH)
                                    </span>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <HelpCircle className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-sm">
                                          <div className="py-2 space-y-2">
                                            <p className="font-medium">FFmpeg Installation:</p>
                                            <ol className="text-sm space-y-1 list-decimal list-inside">
                                              <li>Download "Windows builds by BtbN" (recommended)</li>
                                              <li>Extract to C:\ffmpeg</li>
                                              <li>Add C:\ffmpeg\bin to system PATH</li>
                                              <li>Restart terminal and verify with "ffmpeg -version"</li>
                                            </ol>
                                            <p className="text-xs text-gray-600 mt-2">
                                              Need PATH help? Search "Windows add to PATH" on YouTube
                                            </p>
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </li>
                                </ul>
                              </AlertDescription>
                            </Alert>
                          )}
                          
                          <div>
                            <p className="text-sm text-gray-600 mb-4">
                              Run this command to install and start the local worker:
                            </p>
                          </div>

                          <div className="relative">
                            <div 
                              className={`bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-hidden ${
                                showFullInstallCommand ? 'overflow-x-auto' : ''
                              }`}
                              style={{
                                height: showFullInstallCommand ? 'auto' : '100px'
                              }}
                            >
                              <pre className="whitespace-pre-wrap break-all">
                                {getInstallationCommand()}
                              </pre>
                            </div>
                            
                            {!showFullInstallCommand && (
                              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/50 to-transparent pointer-events-none rounded-lg">
                                <div className="absolute bottom-2 left-4 right-4 flex justify-center">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setShowFullInstallCommand(true)}
                                    className="pointer-events-auto text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600"
                                  >
                                    Reveal full command
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>

                          {showFullInstallCommand && (
                            <Button
                              variant="link"
                              size="sm"
                              onClick={() => setShowFullInstallCommand(false)}
                              className="px-0"
                            >
                              Hide command
                            </Button>
                          )}



                                                     <Button 
                             onClick={handleCopyInstallCommand}
                             variant="outline"
                             size="default"
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
                           
                           <div className="flex justify-center">
                             <TooltipProvider>
                               <Tooltip>
                                 <TooltipTrigger asChild>
                                   <Button variant="link" className="text-sm text-blue-600 hover:text-blue-800 p-0 h-auto">
                                     <HelpCircle className="h-4 w-4 mr-1" />
                                     Need help?
                                   </Button>
                                 </TooltipTrigger>
                                 <TooltipContent className="max-w-sm">
                                   <div className="py-3 space-y-3">
                                     <p className="font-light">Troubleshooting steps:</p>
                                     <ol className="text-sm space-y-2 list-decimal list-inside">
                                       <li>Try running each line of the commands one-at-a-time</li>
                                       <li>Feed the command-line log into ChatGPT or your LLM of choice</li>
                                       <li>Drop into the <a href="https://discord.gg/WXrdkbkj" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">help channel</a> of the Reigh discord</li>
                                     </ol>
                                     <div className="flex justify-center pt-2">
                                       <Button
                                         variant="outline"
                                         size="sm"
                                         onClick={handleCopyAIInstructions}
                                         className="text-xs"
                                       >
                                         {copiedAIInstructions ? (
                                           "Copied!"
                                         ) : (
                                           <>
                                             <Copy className="h-3 w-3 mr-1" />
                                             Copy instructions to get help from AI
                                           </>
                                         )}
                                       </Button>
                                     </div>
                                   </div>
                                 </TooltipContent>
                               </Tooltip>
                             </TooltipProvider>
                           </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="already-installed" className="space-y-4">
                        <div className="space-y-4">
                          <div>                              
                            <p className="text-sm text-gray-600 mb-4">
                              Use this command to start your local worker:
                            </p>
                          </div>

                          <div className="relative">
                            <div 
                              className={`bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-hidden ${
                                showFullRunCommand ? 'overflow-x-auto' : ''
                              }`}
                              style={{
                                height: showFullRunCommand ? 'auto' : '100px'
                              }}
                            >
                              <pre className="whitespace-pre-wrap break-all">
                                {getRunCommand()}
                              </pre>
                            </div>
                            
                            {!showFullRunCommand && (
                              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/50 to-transparent pointer-events-none rounded-lg">
                                <div className="absolute bottom-2 left-4 right-4 flex justify-center">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setShowFullRunCommand(true)}
                                    className="pointer-events-auto text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600"
                                  >
                                    Reveal full command
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>

                          {showFullRunCommand && (
                            <Button
                              variant="link"
                              size="sm"
                              onClick={() => setShowFullRunCommand(false)}
                              className="px-0"
                            >
                              Hide command
                            </Button>
                          )}

                          <Button 
                            onClick={handleCopyRunCommand}
                            variant="outline"
                            size="default"
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
                           
                           <div className="flex justify-center">
                             <TooltipProvider>
                               <Tooltip>
                                 <TooltipTrigger asChild>
                                   <Button variant="link" className="text-sm text-blue-600 hover:text-blue-800 p-0 h-auto">
                                     <HelpCircle className="h-4 w-4 mr-1" />
                                     Need help?
                                   </Button>
                                 </TooltipTrigger>
                                 <TooltipContent className="max-w-sm">
                                   <div className="py-3 space-y-3">
                                     <p className="font-light">Troubleshooting steps:</p>
                                     <ol className="text-sm space-y-2 list-decimal list-inside">
                                       <li>Try running each line of the commands one-at-a-time</li>
                                       <li>Feed the command-line log into ChatGPT or your LLM of choice</li>
                                       <li>Drop into the <a href="https://discord.gg/WXrdkbkj" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">help channel</a> of the Reigh discord</li>
                                     </ol>
                                     <div className="flex justify-center pt-2">
                                       <Button
                                         variant="outline"
                                         size="sm"
                                         onClick={handleCopyAIInstructions}
                                         className="text-xs"
                                       >
                                         {copiedAIInstructions ? (
                                           "Copied!"
                                         ) : (
                                           <>
                                             <Copy className="h-3 w-3 mr-1" />
                                             Copy instructions to get help from AI
                                           </>
                                         )}
                                       </Button>
                                     </div>
                                   </div>
                                 </TooltipContent>
                               </Tooltip>
                             </TooltipProvider>
                           </div>
                        </div>
                      </TabsContent>
                    </Tabs>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;
