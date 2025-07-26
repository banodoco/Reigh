import React from 'react';

interface ToolPageHeaderProps {
  title: string;
}

export const ToolPageHeader: React.FC<ToolPageHeaderProps> = ({ title }) => {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h1>
    </div>
  );
}; 