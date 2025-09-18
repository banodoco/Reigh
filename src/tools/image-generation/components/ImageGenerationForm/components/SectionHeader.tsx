import React from "react";
import { Label } from "@/shared/components/ui/label";

interface SectionHeaderProps {
  title: string;
  theme?: 'orange' | 'green' | 'blue' | 'purple';
  className?: string;
  htmlFor?: string;
}

const themeStyles: Record<string, string> = {
  orange: 'border-orange-200/60 bg-orange-200/60',
  green: 'border-green-200/60 bg-green-200/60',
  blue: 'border-blue-200/60 bg-blue-200/60',
  purple: 'border-purple-200/60 bg-purple-200/60',
};

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  theme = 'blue',
  className = '',
  htmlFor,
}) => {
  const themeClasses = themeStyles[theme];
  const [borderClass, bgClass] = themeClasses.split(' ');
  
  return (
    <Label 
      htmlFor={htmlFor}
      className={`text-lg font-medium text-slate-700 dark:text-slate-200 border-l-8 ${borderClass} pl-3 py-1 relative ${className}`}
    >
      {title}
      <span className={`absolute top-1/2 left-full transform -translate-y-1/2 ml-2.5 w-12 h-2 ${bgClass} rounded-full`}></span>
    </Label>
  );
};

export default SectionHeader;

