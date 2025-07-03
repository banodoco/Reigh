import React, { createContext, useState, ReactNode, useCallback, useMemo } from 'react';

interface LastAffectedShotContextType {
  lastAffectedShotId: string | null;
  setLastAffectedShotId: React.Dispatch<React.SetStateAction<string | null>>;
}

export const LastAffectedShotContext = createContext<LastAffectedShotContextType | undefined>(undefined);

export const LastAffectedShotProvider = ({ children }: { children: ReactNode }) => {
  const [lastAffectedShotId, setLastAffectedShotId] = useState<string | null>(null);

  const value = useMemo(
    () => ({ lastAffectedShotId, setLastAffectedShotId }),
    [lastAffectedShotId]
  );

  return (
    <LastAffectedShotContext.Provider value={value}>
      {children}
    </LastAffectedShotContext.Provider>
  );
}; 