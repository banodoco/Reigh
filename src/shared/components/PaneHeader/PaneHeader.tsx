import React from 'react';

interface PaneHeaderProps {
  title: string;
  children?: React.ReactNode;
}

const PaneHeader: React.FC<PaneHeaderProps> = ({ title, children }) => {
  return (
    <div className="p-2 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
      <h2 className="text-lg font-semibold text-zinc-200 ml-2">{title}</h2>
      <div className="flex items-center space-x-2">
        {children}
      </div>
    </div>
  );
};

export default PaneHeader; 