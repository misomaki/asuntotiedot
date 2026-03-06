"use client";

import {
  forwardRef,
  useCallback,
  useRef,
  type InputHTMLAttributes,
} from "react";
import { cn } from "@/app/lib/utils";

interface SliderProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "onChange" | "value" | "type"
  > {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  label?: string;
  showValue?: boolean;
  formatValue?: (value: number) => string;
}

const Slider = forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      min,
      max,
      value,
      onChange,
      step = 1,
      label,
      showValue = false,
      formatValue,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const trackRef = useRef<HTMLDivElement>(null);

    // Calculate fill percentage
    const percentage = ((value - min) / (max - min)) * 100;

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(Number(e.target.value));
      },
      [onChange]
    );

    const displayValue = formatValue ? formatValue(value) : String(value);

    return (
      <div className={cn("w-full", className)}>
        {/* Label and value */}
        {(label || showValue) && (
          <div className="flex items-center justify-between mb-2">
            {label && (
              <label className="text-sm font-medium text-muted-foreground">
                {label}
              </label>
            )}
            {showValue && (
              <span className="text-sm font-mono text-foreground">
                {displayValue}
              </span>
            )}
          </div>
        )}

        {/* Slider track */}
        <div className="relative" ref={trackRef}>
          {/* Background track */}
          <div
            className={cn(
              "h-2 w-full rounded-full",
              disabled ? "bg-muted/30" : "bg-muted"
            )}
          />

          {/* Fill track */}
          <div
            className={cn(
              "absolute top-0 left-0 h-2 rounded-full transition-all duration-75",
              disabled ? "bg-accent/30" : "bg-accent"
            )}
            style={{ width: `${percentage}%` }}
          />

          {/* Native range input overlay */}
          <input
            ref={ref}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={handleInputChange}
            disabled={disabled}
            className={cn(
              "absolute top-0 left-0 w-full h-2 opacity-0 cursor-pointer",
              "disabled:cursor-not-allowed",
              // Custom thumb styles using appearance
              "[&::-webkit-slider-thumb]:appearance-none",
              "[&::-webkit-slider-thumb]:h-5",
              "[&::-webkit-slider-thumb]:w-5",
              "[&::-webkit-slider-thumb]:rounded-full",
              "[&::-webkit-slider-thumb]:bg-accent",
              "[&::-webkit-slider-thumb]:border-2",
              "[&::-webkit-slider-thumb]:border-bg-primary",
              "[&::-webkit-slider-thumb]:shadow-glow-sm",
              "[&::-webkit-slider-thumb]:cursor-pointer",
              "[&::-moz-range-thumb]:h-5",
              "[&::-moz-range-thumb]:w-5",
              "[&::-moz-range-thumb]:rounded-full",
              "[&::-moz-range-thumb]:bg-accent",
              "[&::-moz-range-thumb]:border-2",
              "[&::-moz-range-thumb]:border-bg-primary",
              "[&::-moz-range-thumb]:cursor-pointer"
            )}
            {...props}
          />

          {/* Visual thumb */}
          <div
            className={cn(
              "absolute top-1/2 -translate-y-1/2 -translate-x-1/2",
              "h-5 w-5 rounded-full pointer-events-none",
              "border-2 border-bg-primary shadow-glow-sm transition-all duration-75",
              disabled
                ? "bg-muted-foreground/50"
                : "bg-accent hover:bg-accent-hover"
            )}
            style={{ left: `${percentage}%` }}
          />
        </div>
      </div>
    );
  }
);

Slider.displayName = "Slider";

export { Slider };
export type { SliderProps };
