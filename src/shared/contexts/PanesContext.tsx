import React, { createContext, useContext, useState, ReactNode } from 'react';

interface PanesContextType {
  isGenerationsPaneLocked: boolean;
  setIsGenerationsPaneLocked: (isLocked: boolean) => void;
  generationsPaneHeight: number;
  setGenerationsPaneHeight: (height: number) => void;

  isShotsPaneLocked: boolean;
  setIsShotsPaneLocked: (isLocked: boolean) => void;
  shotsPaneWidth: number;
  setShotsPaneWidth: (width: number) => void;

  isTasksPaneLocked: boolean;
  setIsTasksPaneLocked: (isLocked: boolean) => void;
  tasksPaneWidth: number;
  setTasksPaneWidth: (width: number) => void;
}

const PanesContext = createContext<PanesContextType | undefined>(undefined);

export const PanesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isGenerationsPaneLocked, setIsGenerationsPaneLocked] = useState(false);
  const [generationsPaneHeight, setGenerationsPaneHeight] = useState(350); 
  
  const [isShotsPaneLocked, setIsShotsPaneLocked] = useState(false);
  const [shotsPaneWidth, setShotsPaneWidth] = useState(300);

  const [isTasksPaneLocked, setIsTasksPaneLocked] = useState(false);
  const [tasksPaneWidth, setTasksPaneWidth] = useState(350);

  const value = {
    isGenerationsPaneLocked,
    setIsGenerationsPaneLocked,
    generationsPaneHeight,
    setGenerationsPaneHeight,
    isShotsPaneLocked,
    setIsShotsPaneLocked,
    shotsPaneWidth,
    setShotsPaneWidth,
    isTasksPaneLocked,
    setIsTasksPaneLocked,
    tasksPaneWidth,
    setTasksPaneWidth,
  };

  return <PanesContext.Provider value={value}>{children}</PanesContext.Provider>;
};

export const usePanes = () => {
  const context = useContext(PanesContext);
  if (context === undefined) {
    throw new Error('usePanes must be used within a PanesProvider');
  }
  return context;
}; 