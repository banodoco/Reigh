import React, { useState, useEffect, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { cn } from '@/shared/lib/utils';
import { usePanes } from '@/shared/contexts/PanesContext';
import PaneControlTab from '../PaneControlTab';
import { useBottomOffset } from '@/shared/hooks/useBottomOffset';
import { toolsUIManifest, type ToolUIDefinition } from '@/tools';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { useDarkMode } from '@/shared/hooks/useDarkMode';
import { useClickRipple } from '@/shared/hooks/useClickRipple';
import { Paintbrush, Video, Edit, Clapperboard, Link2, Users, Sparkles, LayoutGrid } from 'lucide-react';
import { AppEnv, type AppEnvValue } from '@/types/env';

// Tool definitions matching ToolSelectorPage
const processTools = [
  {
    id: 'image-generation',
    name: 'Generate Images',
    description: 'Create images using AI',
    tool: toolsUIManifest.find(t => t.id === 'image-generation'),
    icon: Paintbrush,
    gradient: 'from-wes-vintage-gold via-wes-mustard to-wes-yellow',
    darkIconColor: '#a67d2a',
  },
  {
    id: 'travel-between-images',
    name: 'Travel Between Images',
    description: 'Transform images to video',
    tool: toolsUIManifest.find(t => t.id === 'travel-between-images'),
    icon: Video,
    gradient: 'from-wes-mint via-wes-sage to-wes-dusty-blue',
    darkIconColor: '#3d8a62',
  },
];

const assistantTools = [
  {
    id: 'edit-images',
    name: 'Edit Images',
    description: 'Transform images',
    tool: toolsUIManifest.find(t => t.id === 'edit-images'),
    icon: Edit,
    gradient: 'from-wes-mustard via-wes-vintage-gold to-wes-coral',
    darkIconColor: '#a68018',
  },
  {
    id: 'edit-video',
    name: 'Edit Videos',
    description: 'Regenerate portions',
    tool: toolsUIManifest.find(t => t.id === 'edit-video'),
    icon: Clapperboard,
    gradient: 'from-wes-dusty-blue via-wes-lavender to-wes-mint',
    darkIconColor: '#4a7099',
  },
  {
    id: 'join-clips',
    name: 'Join Clips',
    description: 'Connect video clips',
    tool: toolsUIManifest.find(t => t.id === 'join-clips'),
    icon: Link2,
    gradient: 'from-wes-pink via-wes-salmon to-wes-coral',
    darkIconColor: '#e07070',
  },
  {
    id: 'character-animate',
    name: 'Characters',
    description: 'Bring to life',
    tool: toolsUIManifest.find(t => t.id === 'character-animate'),
    icon: Users,
    gradient: 'from-wes-mint via-wes-sage to-wes-dusty-blue',
    darkIconColor: '#3d8a62',
  },
];

interface ToolCardProps {
  item: typeof processTools[0];
  isCurrentTool: boolean;
  isVisible: boolean;
  onNavigate: (path: string) => void;
}

const ToolCard = memo(({ item, isCurrentTool, isVisible, onNavigate }: ToolCardProps) => {
  const { triggerRipple, rippleStyles, isRippleActive } = useClickRipple();
  const { darkMode } = useDarkMode();
  const [isWiggling, setIsWiggling] = useState(false);
  
  const isDisabled = !item.tool;

  const handleClick = (e: React.PointerEvent) => {
    if (isDisabled) {
      e.preventDefault();
      setIsWiggling(true);
      setTimeout(() => setIsWiggling(false), 600);
      return;
    }
    
    if (item.tool?.path) {
      triggerRipple(e);
      onNavigate(item.tool.path);
    }
  };

  if (!isVisible && !isDisabled) return null;

  return (
    <div
      className={cn(
        "relative group cursor-pointer rounded-lg transition-all duration-200",
        "hover:shadow-md",
        isCurrentTool && "ring-2 ring-blue-500 ring-offset-2 ring-offset-zinc-900",
        isDisabled && "opacity-40 cursor-not-allowed",
        isWiggling && "animate-subtle-wiggle"
      )}
      onPointerUp={handleClick}
    >
      <div 
        className={cn(
          "p-3 rounded-lg bg-zinc-800/80 border border-zinc-700 click-ripple",
          isRippleActive && "ripple-active",
          !isDisabled && "hover:bg-zinc-700/80 hover:border-zinc-600"
        )}
        style={rippleStyles}
      >
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div 
            className={cn(
              "w-10 h-10 rounded-md flex items-center justify-center bg-gradient-to-br shadow-sm",
              item.gradient,
              "dark:bg-none dark:border"
            )}
            style={darkMode ? { borderColor: item.darkIconColor, backgroundColor: `${item.darkIconColor}0d` } : undefined}
          >
            <item.icon 
              className="w-5 h-5 drop-shadow-lg dark:drop-shadow-none transition-colors duration-300" 
              style={{ color: darkMode ? item.darkIconColor : 'white' }} 
            />
          </div>
          
          {/* Text */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-zinc-100 truncate">
              {item.name}
            </h3>
            <p className="text-xs text-zinc-400 truncate">
              {item.description}
            </p>
          </div>
          
          {/* Current indicator */}
          {isCurrentTool && (
            <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
          )}
        </div>
      </div>
    </div>
  );
});

ToolCard.displayName = 'ToolCard';

const ToolsPaneComponent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    isShotsPaneLocked,
    setIsShotsPaneLocked,
    shotsPaneWidth,
  } = usePanes();

  // Get current environment
  let env = import.meta.env.VITE_APP_ENV?.toLowerCase() || AppEnv.WEB;
  if (env === 'production' || env === 'prod') env = AppEnv.WEB;
  const currentEnv = env as AppEnvValue;

  // Get generation method preferences for character-animate visibility
  const { value: generationMethods, isLoading: isLoadingGenerationMethods } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  const isCloudGenerationEnabled = generationMethods.inCloud;

  const { isLocked, isOpen, toggleLock, openPane, paneProps, transformClass, handlePaneEnter, handlePaneLeave, showBackdrop, closePane } = useSlidingPane({
    side: 'left',
    isLocked: isShotsPaneLocked,
    onToggleLock: () => setIsShotsPaneLocked(!isShotsPaneLocked),
  });

  // Delay pointer events until animation completes
  const [isPointerEventsEnabled, setIsPointerEventsEnabled] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      const timeoutId = setTimeout(() => {
        setIsPointerEventsEnabled(true);
      }, 300);
      return () => clearTimeout(timeoutId);
    } else {
      setIsPointerEventsEnabled(false);
    }
  }, [isOpen]);

  // Determine current tool from path
  const getCurrentTool = () => {
    const path = location.pathname;
    for (const tool of [...processTools, ...assistantTools]) {
      if (tool.tool?.path && path.startsWith(tool.tool.path)) {
        return tool;
      }
    }
    return null;
  };
  const currentTool = getCurrentTool();
  const currentToolId = currentTool?.id || null;

  // Tool visibility check
  const isToolVisible = (tool: ToolUIDefinition | null | undefined, toolId?: string) => {
    if (!tool) return false;
    
    // Character Animate: check cloud mode
    if (toolId === 'character-animate') {
      const envCheck = tool.environments.includes(currentEnv) || currentEnv === AppEnv.DEV;
      return envCheck && (isLoadingGenerationMethods || isCloudGenerationEnabled);
    }
    
    // For DEV mode, always show
    if (currentEnv === AppEnv.DEV) return true;
    
    return tool.environments.includes(currentEnv);
  };

  const handleNavigate = (path: string) => {
    setIsShotsPaneLocked(false); // Close the pane when navigating
    navigate(path);
  };

  return (
    <>
      {/* Backdrop overlay to capture taps outside the pane on mobile */}
      {showBackdrop && (
        <div
          className="fixed inset-0 z-[59] touch-none"
          onTouchStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closePane();
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closePane();
          }}
          aria-hidden="true"
        />
      )}
      <PaneControlTab
        side="left"
        isLocked={isLocked}
        isOpen={isOpen}
        toggleLock={toggleLock}
        openPane={openPane}
        paneDimension={shotsPaneWidth}
        bottomOffset={useBottomOffset()}
        handlePaneEnter={handlePaneEnter}
        handlePaneLeave={handlePaneLeave}
        paneIcon="tools"
        paneTooltip="See all tools"
        thirdButton={currentTool ? {
          onClick: openPane,
          ariaLabel: `Current tool: ${currentTool.name}`,
          content: <currentTool.icon className="h-4 w-4" />,
          tooltip: `Current tool: ${currentTool.name}`
        } : undefined}
      />
      <div
        className="pointer-events-none"
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${shotsPaneWidth}px`,
          zIndex: 60,
        }}
      >
        <div
          {...paneProps}
          className={cn(
            `pointer-events-auto absolute top-0 left-0 h-full w-full border-2 border-r shadow-xl transform transition-transform duration-300 ease-smooth flex flex-col bg-zinc-900/95 border-zinc-700`,
            transformClass
          )}
        >
          {/* Inner wrapper with delayed pointer events */}
          <div 
            className={cn(
              'flex flex-col h-full',
              isPointerEventsEnabled ? 'pointer-events-auto' : 'pointer-events-none'
            )}
          >
            <div className="p-2 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-5 w-5 text-zinc-400 ml-2" />
                <h2 className="text-xl font-light text-zinc-200">Tools</h2>
              </div>
            </div>
            
            {/* Tools List */}
            <div className="flex flex-col gap-2 p-3 flex-grow overflow-y-auto scrollbar-hide">
              {/* Section: Main Tools */}
              <div className="mb-2">
                <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 px-1">
                  Main Tools
                </h3>
                <div className="flex flex-col gap-2">
                  {processTools.map((tool) => (
                    <ToolCard
                      key={tool.id}
                      item={tool}
                      isCurrentTool={currentToolId === tool.id}
                      isVisible={isToolVisible(tool.tool, tool.id)}
                      onNavigate={handleNavigate}
                    />
                  ))}
                </div>
              </div>
              
              {/* Section: Assistant Tools */}
              <div>
                <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 px-1">
                  Assistant Tools
                </h3>
                <div className="flex flex-col gap-2">
                  {assistantTools.filter(t => isToolVisible(t.tool, t.id) || !t.tool).map((tool) => (
                    <ToolCard
                      key={tool.id}
                      item={tool}
                      isCurrentTool={currentToolId === tool.id}
                      isVisible={isToolVisible(tool.tool, tool.id)}
                      onNavigate={handleNavigate}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export const ToolsPane = React.memo(ToolsPaneComponent);

export default ToolsPane;

