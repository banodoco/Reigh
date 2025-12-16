import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';

interface ToolPageHeaderContextType {
  setHeader: (header: ReactNode) => void;
  clearHeader: () => void;
}

const ToolPageHeaderContext = createContext<ToolPageHeaderContextType | undefined>(undefined);

export const useToolPageHeader = () => {
  const context = useContext(ToolPageHeaderContext);
  if (!context) {
    throw new Error('useToolPageHeader must be used within a ToolPageHeaderProvider');
  }
  return context;
};

interface ToolPageHeaderProviderProps {
  children: ReactNode;
}

export const ToolPageHeaderProvider: React.FC<ToolPageHeaderProviderProps> = ({ children }) => {
  const [header, setHeader] = useState<ReactNode>(null);

  const handleSetHeader = useCallback((newHeader: ReactNode) => setHeader(newHeader), []);
  const handleClearHeader = useCallback(() => setHeader(null), []);

  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo(() => ({
    header,
    setHeader: handleSetHeader,
    clearHeader: handleClearHeader,
  }), [header, handleSetHeader, handleClearHeader]);

  return (
    <ToolPageHeaderContext.Provider value={value}>
      {children}
    </ToolPageHeaderContext.Provider>
  );
};

export const useHeaderState = () => {
    const context = useContext(ToolPageHeaderContext);
    if (!context) {
      throw new Error('useHeaderState must be used within a ToolPageHeaderProvider');
    }
    // This is a bit of a hack to get the header state without exposing setHeader
    // @ts-ignore
    return { header: context.header };
} 