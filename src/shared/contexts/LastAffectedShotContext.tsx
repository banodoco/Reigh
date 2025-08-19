import React, { createContext, useState, ReactNode, useCallback, useMemo } from 'react';

interface LastAffectedShotContextType {
  lastAffectedShotId: string | null;
  setLastAffectedShotId: React.Dispatch<React.SetStateAction<string | null>>;
}

export const LastAffectedShotContext = createContext<LastAffectedShotContextType | undefined>(undefined);

export const LastAffectedShotProvider = ({ children }: { children: ReactNode }) => {
  const [lastAffectedShotId, setLastAffectedShotId] = useState<string | null>(null);

  // Memoize the setter to prevent function recreation
  const memoizedSetLastAffectedShotId = useCallback((shotId: string | null) => {
    setLastAffectedShotId(shotId);
  }, []);

  const value = useMemo(
    () => ({ lastAffectedShotId, setLastAffectedShotId: memoizedSetLastAffectedShotId }),
    [lastAffectedShotId, memoizedSetLastAffectedShotId]
  );

  return (
    <LastAffectedShotContext.Provider value={value}>
      {children}
    </LastAffectedShotContext.Provider>
  );
}; 