import React, { useState, useEffect, useMemo, useRef } from "react";
import { Key, Copy, Trash2, AlertCircle, Terminal, Coins, Monitor, LogOut, HelpCircle, ChevronDown, Sun, Moon } from "lucide-react";
import { SegmentedControl, SegmentedControlItem } from "@/shared/components/ui/segmented-control";
import { PrivacyToggle } from "@/shared/components/ui/privacy-toggle";
import { Skeleton } from "@/shared/components/ui/skeleton";
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
import { toast } from "sonner";
import { useApiKeys } from "@/shared/hooks/useApiKeys";
import { useApiTokens } from "@/shared/hooks/useApiTokens";
import usePersistentState from "@/shared/hooks/usePersistentState";
import { useCredits } from "@/shared/hooks/useCredits";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { useLargeModal } from '@/shared/hooks/useModal';
import { useScrollFade } from "@/shared/hooks/useScrollFade";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { DialogFooter } from "@/shared/components/ui/dialog";
import { useUserUIState } from "@/shared/hooks/useUserUIState";
import { useDarkMode } from "@/shared/hooks/useDarkMode";
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
  const isMobile = useIsMobile();
  
  const isIpad = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || navigator.vendor || '';
    const isIpadUA = /\biPad\b/.test(ua);
    const isTouchMac = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
    return isIpadUA || isTouchMac;
  }, []);
  
  // Modal styling and scroll fade
  const modal = useLargeModal();
  const { showFade, scrollRef } = useScrollFade({ 
    isOpen: isOpen,
    debug: false,
    preloadFade: modal.isMobile
  });
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
  
  // GPU type preference (persistent)
  const [gpuType, setGpuType] = usePersistentState<string>("gpu-type", "nvidia-30-40");
  
  // Debug logs preference (persistent)
  const [showDebugLogs, setShowDebugLogs] = usePersistentState<boolean>("show-debug-logs", false);
  
  // Memory profile preference (persistent)
  const [memoryProfile, setMemoryProfile] = usePersistentState<string>("memory-profile", "4");
  
  // Settings section toggle (Generation vs Transactions vs Preferences)
  const [settingsSection, setSettingsSection] = useState<'app' | 'transactions' | 'preferences'>('app');
  
  // Lock modal height based on first section content
  const [lockedHeight, setLockedHeight] = useState<number | null>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);
  
  // Lock height immediately on open (avoid "skeleton -> real data" resize)
  const setDialogContentNode = React.useCallback((node: HTMLDivElement | null) => {
    dialogContentRef.current = node;
    if (!node) return;
    if (!isOpen) return;
    if (lockedHeight !== null) return;
    if (settingsSection !== 'app') return;
    setLockedHeight(node.offsetHeight);
  }, [isOpen, lockedHeight, settingsSection]);
  
  // Reset locked height when modal closes
  useEffect(() => {
    if (!isOpen) {
      setLockedHeight(null);
    }
  }, [isOpen]);
  
  // Dark mode
  const { darkMode, setDarkMode } = useDarkMode();

  // Generation method preferences (database-backed)
  const { 
    value: generationMethods, 
    update: updateGenerationMethods, 
    isLoading: isLoadingGenerationMethods 
  } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });

  // Privacy defaults preferences (database-backed)
  const { 
    value: privacyDefaults, 
    update: updatePrivacyDefaults, 
    isLoading: isLoadingPrivacyDefaults 
  } = useUserUIState('privacyDefaults', { resourcesPublic: true, generationsPublic: false });

  // Enhanced update function that notifies other components
  const updateGenerationMethodsWithNotification = (patch: Partial<typeof generationMethods>) => {
    updateGenerationMethods(patch);
    
    // Notify other components immediately
    window.dispatchEvent(new CustomEvent('generation-settings-changed'));
    
    // For cross-tab communication
    localStorage.setItem('generation-settings-updated', Date.now().toString());
    localStorage.removeItem('generation-settings-updated');
  };
  
  const onComputerChecked = generationMethods.onComputer;
  const inCloudChecked = generationMethods.inCloud;

  // Copy command feedback states
  const [copiedInstallCommand, setCopiedInstallCommand] = useState(false);
  const [copiedRunCommand, setCopiedRunCommand] = useState(false);
  const [copiedAIInstructions, setCopiedAIInstructions] = useState(false);

  // Show / hide full command previews
  const [showFullInstallCommand, setShowFullInstallCommand] = useState(false);
  const [showFullRunCommand, setShowFullRunCommand] = useState(false);
  const [showPrerequisites, setShowPrerequisites] = useState(false);
  
  // Refs for scrolling to commands
  const installCommandRef = React.useRef<HTMLDivElement>(null);
  const runCommandRef = React.useRef<HTMLDivElement>(null);
  
  // Functions to reveal commands and scroll to them
  const handleRevealInstallCommand = () => {
    setShowFullInstallCommand(true);
    // Scroll to command after state update, showing content below too
    setTimeout(() => {
      installCommandRef.current?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }, 100);
  };
  
  const handleRevealRunCommand = () => {
    setShowFullRunCommand(true);
    // Scroll to command after state update, showing content below too
    setTimeout(() => {
      runCommandRef.current?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }, 100);
  };
  
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
  const safeCopy = async (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch (e) {
      return false;
    }
  };

  const handleCopyInstallCommand = async () => {
    const ok = await safeCopy(getInstallationCommand());
    if (ok) {
      setCopiedInstallCommand(true);
      setTimeout(() => setCopiedInstallCommand(false), 3000);
    }
  };

  const handleCopyRunCommand = async () => {
    const ok = await safeCopy(getRunCommand());
    if (ok) {
      setCopiedRunCommand(true);
      setTimeout(() => setCopiedRunCommand(false), 3000);
    }
  };

  const generateAIInstructions = () => {
    const token = generatedToken || getActiveToken()?.token || 'your-api-token';
    const isWindows = computerType === "windows";
    const isInstalling = activeInstallTab === "need-install";
    
    const prerequisites = isWindows ? `

PREREQUISITES (Windows only - install these first):
1. NVIDIA GPU with CUDA 6.0+ and 8GB+ VRAM
   - Check with: nvidia-smi
   - AMD/Intel GPUs will NOT work for local processing

2. Latest NVIDIA drivers from nvidia.com/drivers
   - Download and install latest drivers
   - Restart computer after installation
   - Verify with: nvidia-smi

3. Python 3.10+ from python.org (NOT Microsoft Store)
   - During install, check "Add Python to PATH"
   - Verify with: python --version

4. Git from git-scm.com/download/win
   - Use default settings during installation
   - Verify with: git --version

5. FFmpeg from ffmpeg.org/download.html
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
- NVIDIA GPU with CUDA Compute Capability 6.0+ (AMD/Intel GPUs will NOT work)
- Minimum 8GB VRAM (graphics card memory) for local AI processing
- Latest NVIDIA drivers and CUDA Toolkit
- Windows 10/11, Linux, or Mac (though Mac isn't currently supported for local processing)
- Git, Python 3.10+, FFmpeg installed
- PyTorch with CUDA support (critical - CPU-only PyTorch will NOT work)${prerequisites}

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

  const handleCopyAIInstructions = async () => {
    const ok = await safeCopy(generateAIInstructions());
    if (ok) {
      setCopiedAIInstructions(true);
      setTimeout(() => setCopiedAIInstructions(false), 3000);
    }
  };

  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjenlzcXp4bHdkbmRneGl0cnZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1MDI4NjgsImV4cCI6MjA2NzA3ODg2OH0.r-4RyHZiDibUjgdgDDM2Vo6x3YpgIO5-BTwfkB2qyYA";

  const getInstallationCommand = () => {
    // Use the actual token from database or freshly generated one
    const token = generatedToken || getActiveToken()?.token || 'your-api-token';
    const debugFlag = showDebugLogs ? ' --debug' : '';
    const profileFlag = ` --wgp-profile ${memoryProfile}`;
    
    // Determine PyTorch version based on GPU type
    const pytorchVersion = gpuType === "nvidia-50" ? "2.7.0" : "2.6.0";
    const pytorchIndexUrl = "https://download.pytorch.org/whl/cu124";
    
    if (computerType === "windows") {
      const torchInstall = gpuType === "nvidia-50" 
        ? `pip install --no-cache-dir torch==${pytorchVersion} torchvision torchaudio --index-url ${pytorchIndexUrl}`
        : `pip install --no-cache-dir torch torchvision torchaudio --index-url ${pytorchIndexUrl}`;
        
      return `git clone https://github.com/peteromallet/Headless-Wan2GP.git
cd Headless-Wan2GP
python -m venv venv
venv\\Scripts\\activate.bat
${torchInstall}
pip install --no-cache-dir -r Wan2GP/requirements.txt
pip install --no-cache-dir -r requirements.txt
echo Checking CUDA availability...
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}'); print(f'CUDA devices: {torch.cuda.device_count()}'); print(f'CUDA device: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"None\"}')"
python worker.py --supabase-url https://wczysqzxlwdndgxitrvc.supabase.co --supabase-anon-key ${SUPABASE_ANON_KEY} --supabase-access-token ${token}${debugFlag}${profileFlag}`;
    } else {
      // Linux command (existing)
      return `git clone https://github.com/peteromallet/Headless-Wan2GP && \\
cd Headless-Wan2GP && \\
apt-get update && apt-get install -y python3.10-venv ffmpeg && \\
python3.10 -m venv venv && \\
source venv/bin/activate && \\
pip install --no-cache-dir torch==${pytorchVersion} torchvision torchaudio -f ${pytorchIndexUrl} && \\
pip install --no-cache-dir -r Wan2GP/requirements.txt && \\
pip install --no-cache-dir -r requirements.txt && \\
python worker.py --supabase-url https://wczysqzxlwdndgxitrvc.supabase.co \\
  --supabase-anon-key ${SUPABASE_ANON_KEY} \\
  --supabase-access-token ${token}${debugFlag}${profileFlag}`;
    }
  };

  const getRunCommand = () => {
    // Use the actual token from database or freshly generated one
    const token = generatedToken || getActiveToken()?.token || 'your-api-token';
    const debugFlag = showDebugLogs ? ' --debug' : '';
    const profileFlag = ` --wgp-profile ${memoryProfile}`;
    
    if (computerType === "windows") {
      return `git pull
venv\\Scripts\\activate.bat
python worker.py --supabase-url https://wczysqzxlwdndgxitrvc.supabase.co --supabase-anon-key ${SUPABASE_ANON_KEY} --supabase-access-token ${token}${debugFlag}${profileFlag}`;
    } else {
      // Linux / Mac command
      return `git pull && \\
source venv/bin/activate && \\
python worker.py --supabase-url https://wczysqzxlwdndgxitrvc.supabase.co \\
  --supabase-anon-key ${SUPABASE_ANON_KEY} \\
  --supabase-access-token ${token}${debugFlag}${profileFlag}`;
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    onOpenChange(false); // Close the modal after signing out
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        ref={setDialogContentNode}
        className={modal.className}
        style={{ 
          ...modal.style, 
          ...(lockedHeight !== null ? { height: lockedHeight, maxHeight: '90vh', overflow: 'hidden' } : { maxHeight: '90vh' })
        }}
        {...modal.props}
      >
        
        <div className={modal.headerClass}>
          <DialogHeader className={`${modal.isMobile ? 'px-2 pt-1 pb-1' : 'px-2 pt-1 pb-1'} flex-shrink-0 relative`}>
            <div className={`flex ${isMobile ? 'flex-col items-center gap-3' : 'items-center gap-4'}`}>
              <DialogTitle className={`text-2xl ${isMobile ? 'mb-1' : 'md:mt-[11px]'}`}>
                App Settings
              </DialogTitle>
              <div className="relative inline-flex items-center bg-gray-200 dark:bg-gray-700 rounded-full p-0.5 shadow-inner md:mt-[11px] w-fit">
                <button
                  onClick={() => setSettingsSection('app')}
                  className={`${isMobile ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'} font-medium rounded-full transition-all duration-200 focus:outline-none ${
                    settingsSection === 'app'
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  Generation
                </button>
                <button
                  onClick={() => setSettingsSection('transactions')}
                  className={`${isMobile ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'} font-medium rounded-full transition-all duration-200 focus:outline-none ${
                    settingsSection === 'transactions'
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  Transactions
                </button>
                <button
                  onClick={() => setSettingsSection('preferences')}
                  className={`${isMobile ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'} font-medium rounded-full transition-all duration-200 focus:outline-none ${
                    settingsSection === 'preferences'
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  Preferences
                </button>
              </div>
            </div>
          </DialogHeader>
        </div>
        
        {/* Scrollable content container */}
        <div 
          ref={scrollRef}
          className={`${modal.scrollClass} ${modal.isMobile ? 'px-2' : 'px-2'} overflow-x-hidden [scrollbar-gutter:stable_both-edges] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:[&::-webkit-scrollbar]:block sm:[-ms-overflow-style:auto] sm:[scrollbar-width:auto] sm:pr-4`}
        >
          {/* Transactions Section */}
          {settingsSection === 'transactions' && (
            <div className="space-y-4">
              <CreditsManagement mode="transactions" />
            </div>
          )}

          {/* Preferences Section */}
          {settingsSection === 'preferences' && (
            <div className="space-y-6">
              {/* Appearance Subsection */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Appearance</h3>
                <div className={`${isMobile ? 'p-3' : 'p-4'} bg-muted/30 rounded-lg space-y-2`}>
                  <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'}`}>
                    <span className="font-medium">Theme</span>
                    <div className="flex items-center gap-0">
                      <button
                        onClick={() => setDarkMode(false)}
                        className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} rounded-l-full transition-all ${
                          !darkMode
                            ? 'bg-amber-400 text-white'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        <Sun className={`${isMobile ? 'h-3 w-3' : 'h-3.5 w-3.5'} inline mr-1`} />
                        Light
                      </button>
                      <button
                        onClick={() => setDarkMode(true)}
                        className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} rounded-r-full transition-all ${
                          darkMode
                            ? 'bg-indigo-600 text-white'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        <Moon className={`${isMobile ? 'h-3 w-3' : 'h-3.5 w-3.5'} inline mr-1`} />
                        Dark
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Switch between light and dark color schemes
                  </p>
                </div>
              </div>

              {/* Privacy Subsection */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Privacy</h3>
                {isLoadingPrivacyDefaults ? (
                  <div className="space-y-4">
                    {/* Resources Toggle skeleton */}
                    <div className={`${isMobile ? 'p-3' : 'p-4'} bg-gray-50 dark:bg-gray-900/50 rounded-lg space-y-2`}>
                      <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'}`}>
                        <Skeleton className="h-5 w-20" />
                        <Skeleton className="h-8 w-40 rounded-full" />
                      </div>
                      <Skeleton className="h-4 w-64" />
                    </div>
                    {/* Generations Toggle skeleton */}
                    <div className={`${isMobile ? 'p-3' : 'p-4'} bg-gray-50 dark:bg-gray-900/50 rounded-lg space-y-2`}>
                      <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'}`}>
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-8 w-40 rounded-full" />
                      </div>
                      <Skeleton className="h-4 w-72" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Resources Toggle */}
                    <div className={`${isMobile ? 'p-3' : 'p-4'} bg-gray-50 dark:bg-gray-900/50 rounded-lg space-y-2`}>
                      <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'}`}>
                        <span className="font-medium">Resources</span>
                        <PrivacyToggle
                          isPublic={privacyDefaults.resourcesPublic}
                          onValueChange={(isPublic) => updatePrivacyDefaults({ resourcesPublic: isPublic })}
                          size={isMobile ? "sm" : "default"}
                          className={isMobile ? "w-full" : "w-auto"}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        LoRAs, presets, and reference images you create
                      </p>
                    </div>

                    {/* Generations Toggle */}
                    <div className={`${isMobile ? 'p-3' : 'p-4'} bg-gray-50 dark:bg-gray-900/50 rounded-lg space-y-2`}>
                      <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'}`}>
                        <span className="font-medium">Generations</span>
                        <PrivacyToggle
                          isPublic={privacyDefaults.generationsPublic}
                          onValueChange={(isPublic) => updatePrivacyDefaults({ generationsPublic: isPublic })}
                          size={isMobile ? "sm" : "default"}
                          className={isMobile ? "w-full" : "w-auto"}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Images and videos you generate
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* App Settings Section */}
          {settingsSection === 'app' && (
          <>
          {/* Generation Method Selection */}
          <div className={`${isMobile ? 'mb-3' : 'mb-5'}`}>
          {/* Mobile header */}
          {isMobile && (
            <div className="mb-2">
              <h3 className="font-light">How would you like to generate?</h3>
            </div>
          )}
          
          <div className={`${isMobile ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-6'} items-start`}>
            {/* Left column: options */}
            <div className="space-y-2 sm:space-y-4">
              {!isMobile && (
                <h3 className="font-light">How would you like to generate?</h3>
              )}
              
              {isLoadingGenerationMethods ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-64 rounded-full" />
                </div>
              ) : (
                <div className="flex items-center justify-start">
                  <SegmentedControl
                    value={inCloudChecked && !onComputerChecked ? 'cloud' : onComputerChecked && !inCloudChecked ? 'local' : ''}
                    onValueChange={(value) => {
                      if (value === 'cloud') {
                        updateGenerationMethodsWithNotification({ inCloud: true, onComputer: false });
                      } else if (value === 'local') {
                        updateGenerationMethodsWithNotification({ onComputer: true, inCloud: false });
                      }
                    }}
                    variant="pill"
                  >
                    <SegmentedControlItem value="cloud" colorScheme="blue">
                      In the cloud
                    </SegmentedControlItem>
                    <SegmentedControlItem value="local" colorScheme="emerald">
                      On my computer
                    </SegmentedControlItem>
                  </SegmentedControl>
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

        <div className={`space-y-6 sm:space-y-8 ${isMobile ? 'pb-2' : 'pb-2'}`}>
          {/* Loading state for generation sections */}
          {isLoadingGenerationMethods && (
            <div className="space-y-6">
              {/* Credits section skeleton */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-8 w-24 rounded-md" />
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-5 w-28" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                  <Skeleton className="h-4 w-48" />
                </div>
              </div>
              {/* Settings section skeleton */}
              <div className="space-y-4">
                <Skeleton className="h-6 w-40" />
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full rounded-md" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              </div>
            </div>
          )}

          {/* Credits Management Section */}
          {!isLoadingGenerationMethods && inCloudChecked && (
            <div className="space-y-3 sm:space-y-4">
              <CreditsManagement initialTab={creditsTab} mode="add-credits" />
            </div>
          )}

          {/* Local Generation Section */}
          {!isLoadingGenerationMethods && onComputerChecked && (
            <div className="space-y-3 sm:space-y-4">
              {!hasValidToken ? (
                <div className="space-y-3 sm:space-y-4">
                  <div className="p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Key className="h-5 w-5 text-blue-600" />
                      <h4 className="font-light text-blue-900">To generate locally, you need an API key.</h4>
                    </div>
                    <Button 
                      onClick={handleGenerateToken} 
                      disabled={isGenerating}
                      className="w-full"
                    >
                      {isGenerating ? "Generating..." : "Generate Key & Show Instructions"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">


                  {/* Installation section */}
                  <div className="space-y-3">
                    {/* System Configuration Row */}
                    <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-4'} gap-2`}>
                      {/* Computer Type */}
                      <div>
                        <Label className="text-xs text-blue-600 dark:text-blue-400 mb-1 block">Computer</Label>
                        <Select value={computerType} onValueChange={setComputerType}>
                          <SelectTrigger variant="retro" size="sm" colorScheme="blue" className="w-full h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent variant="retro">
                            <SelectItem variant="retro" value="linux">Linux</SelectItem>
                            <SelectItem variant="retro" value="windows">Windows</SelectItem>
                            <SelectItem variant="retro" value="mac">Mac</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* GPU Type */}
                      <div>
                        <Label className="text-xs text-violet-600 dark:text-violet-400 mb-1 block">GPU</Label>
                        <Select value={gpuType} onValueChange={setGpuType} disabled={computerType === "mac"}>
                          <SelectTrigger variant="retro" size="sm" colorScheme="violet" className="w-full h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent variant="retro">
                            <SelectItem variant="retro" value="nvidia-30-40">NVIDIA ≤40 series</SelectItem>
                            <SelectItem variant="retro" value="nvidia-50">NVIDIA 50 series</SelectItem>
                            <SelectItem variant="retro" value="non-nvidia">Non-NVIDIA</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Memory Profile */}
                      <div>
                        <Label className="text-xs text-emerald-600 dark:text-emerald-400 mb-1 block">Memory</Label>
                        <Select value={memoryProfile} onValueChange={setMemoryProfile}>
                          <SelectTrigger variant="retro" size="sm" colorScheme="emerald" className="w-full h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent variant="retro">
                            <TooltipProvider>
                              <Tooltip delayDuration={0}>
                                <TooltipTrigger asChild>
                                  <SelectItem variant="retro" value="1" className="cursor-pointer">Max Performance</SelectItem>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-md" sideOffset={5}>
                                  <p className="text-sm">64GB+ RAM, 24GB VRAM. Fastest.</p>
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip delayDuration={0}>
                                <TooltipTrigger asChild>
                                  <SelectItem variant="retro" value="2" className="cursor-pointer">High RAM</SelectItem>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-md" sideOffset={5}>
                                  <p className="text-sm">64GB+ RAM, 12GB VRAM. Long videos.</p>
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip delayDuration={0}>
                                <TooltipTrigger asChild>
                                  <SelectItem variant="retro" value="3" className="cursor-pointer">Balanced</SelectItem>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-md" sideOffset={5}>
                                  <p className="text-sm">32GB RAM, 24GB VRAM. Recommended for 3090/4090.</p>
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip delayDuration={0}>
                                <TooltipTrigger asChild>
                                  <SelectItem variant="retro" value="4" className="cursor-pointer">Conservative</SelectItem>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-md" sideOffset={5}>
                                  <p className="text-sm">32GB RAM, 12GB VRAM. Works everywhere.</p>
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip delayDuration={0}>
                                <TooltipTrigger asChild>
                                  <SelectItem variant="retro" value="5" className="cursor-pointer">Minimum</SelectItem>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-md" sideOffset={5}>
                                  <p className="text-sm">24GB RAM, 10GB VRAM. Slowest.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Debug Logs Toggle */}
                      <div>
                        <Label className="text-xs text-amber-600 dark:text-amber-400 mb-1 block">Debug</Label>
                        <button
                          onClick={() => setShowDebugLogs(!showDebugLogs)}
                          className={`w-full h-9 px-3 text-sm rounded-md border transition-colors flex items-center justify-between ${
                            showDebugLogs
                              ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
                              : 'bg-amber-50/50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <Terminal className="h-3.5 w-3.5" />
                            Logs
                          </span>
                          <span className={`text-xs ${showDebugLogs ? 'text-blue-600' : 'text-gray-400'}`}>
                            {showDebugLogs ? 'ON' : 'OFF'}
                          </span>
                        </button>
                      </div>
                    </div>
                    
                    {/* Mac Notice */}
                    {computerType === "mac" && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-sm text-amber-800">
                          Mac isn't supported yet.{" "}
                          <button
                            className="text-blue-600 hover:text-blue-700 underline"
                            onClick={() => updateGenerationMethodsWithNotification({ onComputer: false, inCloud: true })}
                          >
                            Process in the cloud
                          </button>
                        </p>
                      </div>
                    )}
                    
                    {/* Non-NVIDIA GPU Notice */}
                    {(computerType === "windows" || computerType === "linux") && gpuType === "non-nvidia" && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-sm text-amber-800">
                          Non-NVIDIA GPUs aren't supported.{" "}
                          <button
                            className="text-blue-600 hover:text-blue-700 underline"
                            onClick={() => updateGenerationMethodsWithNotification({ onComputer: false, inCloud: true })}
                          >
                            Process in the cloud
                          </button>
                        </p>
                      </div>
                    )}

                    {computerType !== "mac" && gpuType !== "non-nvidia" && (
                      <Tabs value={activeInstallTab} onValueChange={setActiveInstallTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mb-3 h-9 p-1">
                          <TabsTrigger
                            value="need-install"
                            className="data-[state=active]:bg-card data-[state=active]:dark:bg-gray-700 data-[state=active]:shadow-sm data-[state=active]:text-foreground text-sm py-0 h-full leading-none"
                          >
                            Install
                          </TabsTrigger>
                          <TabsTrigger
                            value="already-installed"
                            className="data-[state=active]:bg-card data-[state=active]:dark:bg-gray-700 data-[state=active]:shadow-sm data-[state=active]:text-foreground text-sm py-0 h-full leading-none"
                          >
                            Run
                          </TabsTrigger>
                        </TabsList>

                      <TabsContent value="need-install" className="space-y-4">
                        <div className="space-y-4">
                          {/* Windows Prerequisites */}
                          {computerType === "windows" && (
                            <div className="border border-gray-200 rounded-lg">
                              <button
                                onClick={() => setShowPrerequisites(!showPrerequisites)}
                                className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                              >
                                <span className="text-sm text-gray-700">
                                  Prerequisites (install manually if not already installed):
                                </span>
                                <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${showPrerequisites ? 'rotate-180' : ''}`} />
                              </button>
                              {showPrerequisites && (
                                <ul className="list-disc pl-8 pr-4 pb-3 text-sm space-y-1.5 text-gray-600">
                                  <li>
                                    NVIDIA GPU with CUDA 6.0+ (8GB+ VRAM required)
                                  </li>
                                  <li>
                                    Latest NVIDIA drivers from{" "}
                                    <a href="https://nvidia.com/drivers" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                                      nvidia.com/drivers
                                    </a>
                                  </li>
                                  <li>
                                    Python 3.10+ from{" "}
                                    <a href="https://python.org" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                                      python.org
                                    </a>
                                  </li>
                                  <li>
                                    Git from{" "}
                                    <a href="https://git-scm.com/download/win" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                                      git-scm.com/download/win
                                    </a>
                                  </li>
                                  <li>
                                    FFmpeg from{" "}
                                    <a href="https://ffmpeg.org/download.html" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                                      ffmpeg.org/download.html
                                    </a>
                                    {" "}(add to PATH)
                                  </li>
                                </ul>
                              )}
                            </div>
                          )}
                          
                          <div>
                            <p className="text-sm text-muted-foreground mb-4">
                              Run this command to install and start the local worker:
                            </p>
                          </div>

                          <div className="relative" ref={installCommandRef}>
                            <div 
                              className={`bg-gray-900 text-green-400 p-3 pb-12 rounded-lg font-mono text-xs sm:text-sm overflow-hidden ${
                                showFullInstallCommand ? 'overflow-x-auto' : ''
                              }`}
                              style={{
                                height: showFullInstallCommand ? 'auto' : '100px'
                              }}
                            >
                              <pre className="whitespace-pre-wrap break-all text-xs sm:text-sm leading-relaxed">
                                {getInstallationCommand()}
                              </pre>
                            </div>
                            
                            {/* Gradient fade behind buttons */}
                            {!showFullInstallCommand && (
                              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-gray-900 via-gray-900/90 to-transparent pointer-events-none rounded-b-lg" />
                            )}
                            
                            {/* Fixed buttons at bottom of command block - centered */}
                            <div className="absolute bottom-2 left-3 right-3 flex items-center justify-center gap-2 z-10">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleCopyInstallCommand}
                                className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white border-blue-500"
                              >
                                {copiedInstallCommand ? "Copied!" : (
                                  <>
                                    <Copy className="h-3 w-3 mr-1" />
                                    Copy
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={showFullInstallCommand ? () => setShowFullInstallCommand(false) : handleRevealInstallCommand}
                                className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600"
                              >
                                {showFullInstallCommand ? 'Hide' : 'Reveal'}
                              </Button>
                            </div>
                          </div>
                           
                           <div className="flex justify-center mt-1">
                             {isMobile ? (
                               <Popover>
                                 <PopoverTrigger asChild>
                                   <Button variant="link" className="text-xs text-blue-600 hover:text-blue-800 p-1 h-auto touch-manipulation">
                                     <HelpCircle className="h-3 w-3 mr-1" />
                                     Need help?
                                   </Button>
                                 </PopoverTrigger>
                                 <PopoverContent className="max-w-sm">
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
                                         className="text-xs min-h-[40px] touch-manipulation"
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
                                 </PopoverContent>
                               </Popover>
                             ) : (
                               <Popover>
                                 <PopoverTrigger asChild>
                                   <Button variant="link" className="text-xs text-blue-600 hover:text-blue-800 p-1 h-auto touch-manipulation">
                                     <HelpCircle className="h-3 w-3 mr-1" />
                                     Need help?
                                   </Button>
                                 </PopoverTrigger>
                                 <PopoverContent className="max-w-sm">
                                   <div className="py-2 space-y-2">
                                     <p className="font-light text-sm">Troubleshooting steps:</p>
                                     <ol className="text-xs space-y-1 list-decimal list-inside">
                                       <li>Try running each line one-at-a-time</li>
                                       <li>Feed errors into ChatGPT or your LLM</li>
                                       <li>Join the <a href="https://discord.gg/WXrdkbkj" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">Reigh discord</a></li>
                                     </ol>
                                     <div className="flex justify-center pt-2">
                                       <Button
                                         variant="outline"
                                         size="sm"
                                         onClick={handleCopyAIInstructions}
                                         className="text-xs"
                                       >
                                         {copiedAIInstructions ? "Copied!" : (
                                           <>
                                             <Copy className="h-3 w-3 mr-1" />
                                             Copy prompt for AI help
                                           </>
                                         )}
                                       </Button>
                                     </div>
                                   </div>
                                 </PopoverContent>
                               </Popover>
                             )}
                           </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="already-installed" className="space-y-4">
                        <div className="space-y-4">
                          <div>                              
<p className="text-sm text-muted-foreground mb-4">
                              Use this command to start your local worker:
                            </p>
                          </div>

                          <div className="relative" ref={runCommandRef}>
                            <div
                              className={`bg-gray-900 text-green-400 p-3 pb-12 rounded-lg font-mono text-xs sm:text-sm overflow-hidden ${
                                showFullRunCommand ? 'overflow-x-auto' : ''
                              }`}
                              style={{
                                height: showFullRunCommand ? 'auto' : '100px'
                              }}
                            >
                              <pre className="whitespace-pre-wrap break-all text-xs sm:text-sm leading-relaxed">
                                {getRunCommand()}
                              </pre>
                            </div>

                            {/* Gradient fade behind buttons */}
                            {!showFullRunCommand && (
                              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-gray-900 via-gray-900/90 to-transparent pointer-events-none rounded-b-lg" />
                            )}

                            {/* Fixed buttons at bottom of command block - centered */}
                            <div className="absolute bottom-2 left-3 right-3 flex items-center justify-center gap-2 z-10">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleCopyRunCommand}
                                className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white border-blue-500"
                              >
                                {copiedRunCommand ? "Copied!" : (
                                  <>
                                    <Copy className="h-3 w-3 mr-1" />
                                    Copy
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={showFullRunCommand ? () => setShowFullRunCommand(false) : handleRevealRunCommand}
                                className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600"
                              >
                                {showFullRunCommand ? 'Hide' : 'Reveal'}
                              </Button>
                            </div>
                          </div>
                           
                           <div className="flex justify-center mt-1">
                             <Popover>
                               <PopoverTrigger asChild>
                                 <Button variant="link" className="text-xs text-blue-600 hover:text-blue-800 p-1 h-auto touch-manipulation">
                                   <HelpCircle className="h-3 w-3 mr-1" />
                                   Need help?
                                 </Button>
                               </PopoverTrigger>
                               <PopoverContent className="max-w-sm">
                                 <div className="py-2 space-y-2">
                                   <p className="font-light text-sm">Troubleshooting steps:</p>
                                   <ol className="text-xs space-y-1 list-decimal list-inside">
                                     <li>Try running each line one-at-a-time</li>
                                     <li>Feed errors into ChatGPT or your LLM</li>
                                     <li>Join the <a href="https://discord.gg/WXrdkbkj" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">Reigh discord</a></li>
                                   </ol>
                                   <div className="flex justify-center pt-2">
                                     <Button
                                       variant="outline"
                                       size="sm"
                                       onClick={handleCopyAIInstructions}
                                       className="text-xs"
                                     >
                                       {copiedAIInstructions ? "Copied!" : (
                                         <>
                                           <Copy className="h-3 w-3 mr-1" />
                                           Copy prompt for AI help
                                         </>
                                       )}
                                     </Button>
                                   </div>
                                 </div>
                               </PopoverContent>
                             </Popover>
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
          </>
          )}
        </div>
        
        {/* Footer */}
        <div className={`${modal.footerClass} relative`}>
          {/* Fade overlay */}
          {showFade && (
            <div 
              className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
              style={{ transform: 'translateY(-64px)' }}
            >
              <div className="h-full bg-gradient-to-t from-white via-white/95 to-transparent dark:from-gray-950 dark:via-gray-950/95 dark:to-transparent" />
            </div>
          )}
          
          <DialogFooter className={`${modal.isMobile ? 'px-2 pt-6 pb-3 flex-row justify-between' : 'px-2 pt-7 pb-3'} border-t relative z-20`}>
            <div className="flex gap-2 mr-auto">
              <Button variant="retro-secondary" size="retro-sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </Button>
            </div>
            <Button variant="retro" size="retro-sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;
