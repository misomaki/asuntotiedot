"use client";

import { type ReactNode, type HTMLAttributes } from "react";
import { cn } from "@/app/lib/utils";

/* ------------------------------------------------
   CSS-only Tooltip
   Shows on hover with absolute positioning.
   ------------------------------------------------ */

type TooltipSide = "top" | "bottom" | "left" | "right";

interface TooltipProps extends Omit<HTMLAttributes<HTMLDivElement>, "content"> {
  content: ReactNode;
  side?: TooltipSide;
  children: ReactNode;
}

const sideStyles: Record<TooltipSide, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

function Tooltip({
  content,
  side = "top",
  className,
  children,
  ...props
}: TooltipProps) {
  return (
    <div className={cn("relative inline-flex group", className)} {...props}>
      {children}
      <div
        role="tooltip"
        className={cn(
          "absolute z-50 pointer-events-none",
          "opacity-0 group-hover:opacity-100",
          "transition-opacity duration-200",
          "px-3 py-1.5 text-xs font-medium",
          "rounded-md shadow-glass-sm whitespace-nowrap",
          "bg-bg-secondary text-foreground border border-border",
          sideStyles[side]
        )}
      >
        {content}
      </div>
    </div>
  );
}

export { Tooltip };
export type { TooltipProps, TooltipSide };
