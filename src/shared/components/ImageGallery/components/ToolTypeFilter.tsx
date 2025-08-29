import React from "react";

export interface ToolTypeFilterProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  toolTypeName: string;
  whiteText?: boolean;
}

export const ToolTypeFilter: React.FC<ToolTypeFilterProps> = ({
  enabled,
  onToggle,
  toolTypeName,
  whiteText = false,
}) => {
  return (
    <div className="flex items-center justify-center">
      <div className={`relative inline-flex items-center rounded-md p-1 shadow-inner ${
        whiteText ? 'bg-zinc-700' : 'bg-gray-200'
      }`}>
        {/* Toggle track */}
        <div className="flex">
          {/* Show specific tool button */}
          <button
            onClick={() => onToggle(true)}
            className={`px-3 py-1 font-light rounded-sm transition-all duration-200 text-xs whitespace-nowrap ${
              whiteText 
                ? 'text-zinc-300 hover:text-white'
                : 'text-gray-600 hover:text-gray-800'
            } ${
              enabled
                ? whiteText 
                  ? 'bg-zinc-600 shadow-sm'
                  : 'bg-white shadow-sm'
                : ''
            }`}
          >
            {toolTypeName}
          </button>
          
          {/* Show all button */}
          <button
            onClick={() => onToggle(false)}
            className={`px-3 py-1 font-light rounded-sm transition-all duration-200 text-xs whitespace-nowrap ${
              whiteText 
                ? 'text-zinc-300 hover:text-white'
                : 'text-gray-600 hover:text-gray-800'
            } ${
              !enabled
                ? whiteText 
                  ? 'bg-zinc-600 shadow-sm'
                  : 'bg-white shadow-sm'
                : ''
            }`}
          >
            All tools
          </button>
        </div>
      </div>
    </div>
  );
};
