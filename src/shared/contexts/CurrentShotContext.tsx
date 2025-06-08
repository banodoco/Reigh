import React, { createContext, useState, useContext, ReactNode, useMemo } from 'react';

interface CurrentShotContextType {
  currentShotId: string | null;
  setCurrentShotId: (shotId: string | null) => void;
}

const CurrentShotContext = createContext<CurrentShotContextType | undefined>(undefined);

export const CurrentShotProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentShotId, setCurrentShotId] = useState<string | null>(null);

  const value = useMemo(() => ({
    currentShotId,
    setCurrentShotId,
  }), [currentShotId]);

  return (
    <CurrentShotContext.Provider value={value}>
      {children}
    </CurrentShotContext.Provider>
  );
};

export const useCurrentShot = (): CurrentShotContextType => {
  const context = useContext(CurrentShotContext);
  if (context === undefined) {
    throw new Error('useCurrentShot must be used within a CurrentShotProvider');
  }
  return context;
}; 