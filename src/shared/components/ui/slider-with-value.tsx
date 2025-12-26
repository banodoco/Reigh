import React, { useState, useEffect } from "react";
import { Slider } from "./slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";
import { ChevronUp, ChevronDown } from "lucide-react";

interface SliderWithValueProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  hideLabel?: boolean;
  formatValue?: (value: number) => string;
  numberInputClassName?: string;
}

const SliderWithValue = ({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  variant = "primary",
  hideLabel = false,
  formatValue,
  numberInputClassName = "w-20",
}: SliderWithValueProps) => {
  // Local state to manage input value for smooth typing (handles "1." vs "1" cases)
  const [inputValue, setInputValue] = useState(
    formatValue ? formatValue(value) : (Number.isInteger(value) ? value.toString() : value.toFixed(2))
  );

  // Sync local state with prop value changes
  useEffect(() => {
    // If using formatValue, always sync
    if (formatValue) {
      setInputValue(formatValue(value));
      return;
    }

    // For numeric inputs: only update if the numeric value actually changed
    // This prevents overwriting "1." (parsed as 1) with "1" (prop) while typing
    const currentNumeric = parseFloat(inputValue);
    // Check if values are effectively different (accounting for potential string parsing differences)
    if (isNaN(currentNumeric) || Math.abs(currentNumeric - value) > Number.EPSILON) {
      setInputValue(Number.isInteger(value) ? value.toString() : value.toFixed(2));
    }
  }, [value, formatValue, inputValue]);

  const handleValueChange = (values: number[]) => {
    onChange(values[0]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValStr = e.target.value;
    setInputValue(newValStr);
    
    const newVal = parseFloat(newValStr);
    if (!isNaN(newVal)) {
      onChange(newVal);
    }
  };

  const sliderContent = (
    <div className="space-y-2">
      {!hideLabel && (
        <div className="flex justify-between items-center">
          <label className="text-sm font-light">{label}</label>
        </div>
      )}
      <div className="flex gap-4">
        {formatValue ? (
          <div className={`border rounded ${numberInputClassName} h-10 flex items-center justify-center bg-card dark:bg-gray-800`}>
            {formatValue(value)}
          </div>
        ) : (
          <div className={`flex items-center border border-border rounded ${numberInputClassName} h-10 bg-card dark:bg-gray-800 overflow-hidden`}>
            <input
              type="number"
              className="flex-1 h-full bg-transparent text-center px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none"
              value={inputValue}
              onChange={handleInputChange}
              step={step}
              min={min}
              max={max}
              disabled={disabled}
            />
            <div className="flex flex-col h-full border-l border-border">
              <button
                type="button"
                className="flex-1 px-2 hover:bg-muted/50 active:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => {
                  const newVal = Math.min(max, value + step);
                  onChange(newVal);
                }}
                disabled={disabled || value >= max}
                tabIndex={-1}
              >
                <ChevronUp className="h-3 w-3 text-muted-foreground" />
              </button>
              <button
                type="button"
                className="flex-1 px-2 hover:bg-muted/50 active:bg-muted transition-colors border-t border-border disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => {
                  const newVal = Math.max(min, value - step);
                  onChange(newVal);
                }}
                disabled={disabled || value <= min}
                tabIndex={-1}
              >
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          </div>
        )}
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={handleValueChange}
          className="flex-1"
          disabled={disabled}
          variant={variant}
        />
      </div>
    </div>
  );

  if (hideLabel) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {sliderContent}
          </TooltipTrigger>
          <TooltipContent>
            <p>{label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return sliderContent;
};

export { SliderWithValue };