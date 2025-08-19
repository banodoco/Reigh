import React from "react";

interface PairRegionProps {
  index: number;
  startPercent: number;
  endPercent: number;
  contextStartPercent: number;
  generationStartPercent: number;
  actualFrames: number;
  visibleContextFrames: number;
  isDragging: boolean;
  contextFrames: number;
  numPairs: number;
}

const PairRegion: React.FC<PairRegionProps> = ({
  index,
  startPercent,
  endPercent,
  contextStartPercent,
  generationStartPercent,
  actualFrames,
  visibleContextFrames,
  isDragging,
  contextFrames,
  numPairs,
}) => {
  const pairColorSchemes = [
    { bg: 'bg-blue-50', border: 'border-blue-300', context: 'bg-blue-200/60', text: 'text-blue-700', line: 'bg-blue-400' },
    { bg: 'bg-emerald-50', border: 'border-emerald-300', context: 'bg-emerald-200/60', text: 'text-emerald-700', line: 'bg-emerald-400' },
    { bg: 'bg-purple-50', border: 'border-purple-300', context: 'bg-purple-200/60', text: 'text-purple-700', line: 'bg-purple-400' },
    { bg: 'bg-orange-50', border: 'border-orange-300', context: 'bg-orange-200/60', text: 'text-orange-700', line: 'bg-orange-400' },
    { bg: 'bg-rose-50', border: 'border-rose-300', context: 'bg-rose-200/60', text: 'text-rose-700', line: 'bg-rose-400' },
    { bg: 'bg-teal-50', border: 'border-teal-300', context: 'bg-teal-200/60', text: 'text-teal-700', line: 'bg-teal-400' },
  ];
  const colorScheme = pairColorSchemes[index % pairColorSchemes.length];

  return (
    <React.Fragment key={`pair-${index}`}>
      {/* Main pair region */}
      <div
        className={`absolute top-0 bottom-0 ${colorScheme.bg} ${colorScheme.border} border-l-2 border-r-2 border-solid pointer-events-none`}
        style={{
          left: `${startPercent}%`,
          width: `${endPercent - startPercent}%`,
          transition: isDragging ? 'none' : 'left 0.2s ease-out, width 0.2s ease-out',
        }}
      />

      {/* Context frames region */}
      {contextFrames > 0 && visibleContextFrames > 0 && index < numPairs - 1 && (
        <div
          className={`absolute top-0 bottom-0 ${colorScheme.context} border-r border-dashed ${colorScheme.border.replace('border-', 'border-r-').replace('-300', '-400')} pointer-events-none`}
          style={{
            left: `${contextStartPercent}%`,
            width: `${endPercent - contextStartPercent}%`,
            transition: isDragging ? 'none' : 'left 0.2s ease-out, width 0.2s ease-out',
          }}
        >
          <div className={`absolute bottom-2 left-1/2 transform -translate-x-1/2 text-xs font-light ${colorScheme.text} bg-white/80 px-2 py-0.5 rounded`}>
            Context ({visibleContextFrames}f)
          </div>
        </div>
      )}

      {/* Pair label */}
      <div
        className={`absolute top-1/2 text-sm font-light ${colorScheme.text} bg-white/90 px-3 py-1 rounded-full border ${colorScheme.border} pointer-events-none z-10 shadow-sm`}
        style={{
          left: `${(startPercent + endPercent) / 2}%`,
          transform: 'translate(-50%, -50%)',
          transition: isDragging ? 'none' : 'left 0.2s ease-out',
        }}
      >
        Pair {index + 1} • {actualFrames}f
      </div>

      {/* Generation boundary lines */}
      <div
        className={`absolute top-0 bottom-0 w-[2px] ${colorScheme.line} pointer-events-none z-5`}
        style={{
          left: `${generationStartPercent}%`,
          transform: 'translateX(-50%)',
          transition: isDragging ? 'none' : 'left 0.2s ease-out',
        }}
      />
      <div
        className={`absolute top-0 bottom-0 w-[2px] ${colorScheme.line} pointer-events-none z-5`}
        style={{
          left: `${endPercent}%`,
          transform: 'translateX(-50%)',
          transition: isDragging ? 'none' : 'left 0.2s ease-out',
        }}
      />
    </React.Fragment>
  );
};

export default PairRegion; 