import React from 'react';

interface ToolPageHeaderProps {
  title: string;
}

export const ToolPageHeader: React.FC<ToolPageHeaderProps> = ({ title }) => {
  return (
    <div className="mb-6 sm:mb-8 mt-2 sm:mt-7">
      <h1 className="text-3xl font-light tracking-tight text-foreground sm:text-4xl">
        {title}
      </h1>
    </div>
  );
}; 