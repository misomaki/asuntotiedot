"use client";

import { type HTMLAttributes } from "react";
import { cn } from "@/app/lib/utils";

function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-md bg-gradient-to-r from-[#f0ede8] via-[#e6e2dc] via-50% to-[#f0ede8] bg-[length:200%_100%] animate-shimmer",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
