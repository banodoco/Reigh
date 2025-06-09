import React, { createContext, useState, ReactNode } from 'react';

interface LastAffectedShotContextType {
  lastAffectedShotId: string | null;
  setLastAffectedShotId: React.Dispatch<React.SetStateAction<string | null>>;
}

export const LastAffectedShotContext = createContext<LastAffectedShotContextType | undefined>(undefined);

export const LastAffectedShotProvider = ({ children }: { children: ReactNode }) => {
  const [lastAffectedShotId, setLastAffectedShotId] = useState<string | null>(null);

  return (
    <LastAffectedShotContext.Provider value={{ lastAffectedShotId, setLastAffectedShotId }}>
      {children}
    </LastAffectedShotContext.Provider>
  );
}; 