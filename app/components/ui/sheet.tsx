"use client";

import { type ReactNode, useEffect } from "react";
import {
  motion,
  AnimatePresence,
  useDragControls,
  useReducedMotion,
  type PanInfo,
} from "framer-motion";
import { cn } from "@/app/lib/utils";

type SheetSide = "left" | "right" | "bottom";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  side?: SheetSide;
  className?: string;
  children: ReactNode;
}

const sideConfig: Record<
  SheetSide,
  {
    position: string;
    initial: Record<string, number>;
    animate: Record<string, number>;
    exit: Record<string, number>;
  }
> = {
  left: {
    position: "inset-y-0 left-0",
    initial: { x: -100 },
    animate: { x: 0 },
    exit: { x: -100 },
  },
  right: {
    position: "inset-y-0 right-0",
    initial: { x: 100 },
    animate: { x: 0 },
    exit: { x: 100 },
  },
  bottom: {
    position: "inset-x-0 bottom-0",
    initial: { y: 100 },
    animate: { y: 0 },
    exit: { y: 100 },
  },
};

const sizeStyles: Record<SheetSide, string> = {
  left: "w-80 max-w-[85vw] h-full",
  right: "w-80 max-w-[85vw] h-full",
  bottom: "w-full max-h-[85vh] rounded-t-2xl",
};

/** Drag-dismiss thresholds for the bottom sheet (swipe down to close). */
const DISMISS_OFFSET_PX = 110;
const DISMISS_VELOCITY = 600;

function Sheet({
  open,
  onClose,
  side = "right",
  className,
  children,
}: SheetProps) {
  const config = sideConfig[side];
  const dragControls = useDragControls();
  const prefersReducedMotion = useReducedMotion();
  const isBottom = side === "bottom";

  function handleDragEnd(_event: unknown, info: PanInfo) {
    if (info.offset.y > DISMISS_OFFSET_PX || info.velocity.y > DISMISS_VELOCITY) {
      onClose();
    }
  }

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close on escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    if (open) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Sheet panel */}
          <motion.div
            className={cn(
              "fixed z-50 flex flex-col",
              "bg-bg-secondary border-border shadow-glass",
              side === "left" && "border-r",
              side === "right" && "border-l",
              side === "bottom" && "border-t",
              config.position,
              sizeStyles[side],
              className
            )}
            initial={{ ...config.initial, opacity: 0 }}
            animate={{ ...config.animate, opacity: 1 }}
            exit={{ ...config.exit, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            drag={isBottom ? "y" : false}
            dragControls={isBottom ? dragControls : undefined}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={isBottom ? { top: 0, bottom: 0.7 } : 0}
            onDragEnd={isBottom ? handleDragEnd : undefined}
          >
            {/* Drag handle for bottom sheet — swipe down to dismiss.
                Only the handle starts the drag, so scrolling the content below
                never triggers a dismiss. */}
            {isBottom && (
              <button
                type="button"
                aria-label="Vedä alas sulkeaksesi"
                onPointerDown={(e) => {
                  if (!prefersReducedMotion) dragControls.start(e);
                }}
                className="flex w-full justify-center pt-3 pb-2 cursor-grab touch-none active:cursor-grabbing focus-visible:outline-none"
              >
                <span className="h-1.5 w-12 rounded-full bg-muted-foreground/40" />
              </button>
            )}

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "absolute top-4 right-4 z-10",
                "h-11 w-11 rounded-md flex items-center justify-center",
                "text-muted-foreground hover:text-foreground",
                "hover:bg-muted/50 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
              aria-label="Sulje"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Content */}
            <div
              className={cn(
                "flex-1 min-h-0 overflow-y-auto px-6 pt-6",
                // Respect the iOS home-indicator / gesture bar on the bottom sheet
                isBottom
                  ? "pb-[max(1.5rem,env(safe-area-inset-bottom))]"
                  : "pb-6"
              )}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export { Sheet };
export type { SheetProps, SheetSide };
