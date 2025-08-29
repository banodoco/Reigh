import React from "react";
import { Slider } from "./slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

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
}: SliderWithValueProps) => {
  const handleValueChange = (values: number[]) => {
    onChange(values[0]);
  };

  const sliderContent = (
    <div className="space-y-2">
      {!hideLabel && (
        <div className="flex justify-between items-center">
          <label className="text-sm font-light">{label}</label>
        </div>
      )}
      <div className="flex gap-4">
        <div className="border rounded w-16 h-10 flex items-center justify-center bg-white">
          {Number.isInteger(value) ? value : value.toFixed(2)}
        </div>
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