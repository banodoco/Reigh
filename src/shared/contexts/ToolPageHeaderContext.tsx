import React, { createContext, useContext, useState, ReactNode } from 'react';

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

  const value = {
    header,
    setHeader: (newHeader: ReactNode) => setHeader(newHeader),
    clearHeader: () => setHeader(null),
  };

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