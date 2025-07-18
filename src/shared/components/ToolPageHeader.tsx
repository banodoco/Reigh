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
    <header className={`sticky top-0 z-40 mb-2 mt-2 ${className}`}>
      <div className="container mx-auto flex justify-between items-center py-4 mb-0">
        <div className="flex items-center gap-3">
          <Link to={backTo} className="text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold">
            {title}
          </h1>
        </div>
        {children && (
          <div>
            {children}
          </div>
        )}
      </div>
    </header>
  );
}; 