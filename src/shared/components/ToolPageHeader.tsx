import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface ToolPageHeaderProps {
  title: string;
  backTo?: string;
  className?: string;
  children?: React.ReactNode;
}

export const ToolPageHeader: React.FC<ToolPageHeaderProps> = ({ 
  title, 
  backTo = "/tools", 
  className = "",
  children 
}) => {
  return (
    <header className={`flex justify-between items-center mb-6 sticky top-0 bg-background py-4 z-40 border-b border-border/50 shadow-sm px-2 sm:px-4 lg:px-6 -mx-2 sm:-mx-4 lg:-mx-6 ${className}`}>
      <div className="flex items-center gap-3 pl-3">
        <Link to={backTo} className="text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">
          {title}
        </h1>
      </div>
      {children && (
        <div className="pr-3">
          {children}
        </div>
      )}
    </header>
  );
}; 