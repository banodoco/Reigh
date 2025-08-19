import React, { createContext, useState, useContext, ReactNode, useMemo, useEffect, useCallback } from 'react';

interface CurrentShotContextType {
  currentShotId: string | null;
  setCurrentShotId: (shotId: string | null) => void;
}

const CurrentShotContext = createContext<CurrentShotContextType | undefined>(undefined);

export const CurrentShotProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentShotId, setCurrentShotId] = useState<string | null>(null);

  // Debug: Log when currentShotId changes (only in development)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[ShotFilterAutoSelectIssue] currentShotId changed:', currentShotId);
    }
  }, [currentShotId]);

  // Memoize setCurrentShotId to prevent recreating the function
  const memoizedSetCurrentShotId = useCallback((shotId: string | null) => {
    setCurrentShotId(shotId);
  }, []);

  const value = useMemo(() => ({
    currentShotId,
    setCurrentShotId: memoizedSetCurrentShotId,
  }), [currentShotId, memoizedSetCurrentShotId]);

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