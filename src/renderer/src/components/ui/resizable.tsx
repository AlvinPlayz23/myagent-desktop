import type * as React from "react";
import { cn } from "@/lib/utils";

// Ported from ZCode packages/ui/src/components/ui/resizable.tsx.
// ZCode builds this on react-resizable-panels; myagent-desktop does not ship
// that dependency, so these are presentation primitives only — the group and
// panel are plain flex containers and the handle is an accessible separator.
// Wire drag behavior at the call site (pointer events + flex-basis) when a
// resizable workspace actually needs it; this keeps the visual language
// (4px transparent hit area, 2px tertiary indicator on hover/focus/drag)
// without adding a package.
export function ResizablePanelGroup({
  className,
  direction = "horizontal",
  ...props
}: React.ComponentProps<"div"> & { direction?: "horizontal" | "vertical" }): React.ReactElement {
  return (
    <div
      data-slot="resizable-panel-group"
      data-direction={direction}
      className={cn(
        "flex h-full w-full data-[direction=vertical]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

export function ResizablePanel({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      data-slot="resizable-panel"
      className={cn("min-h-0 min-w-0 overflow-hidden", className)}
      {...props}
    />
  );
}

export function ResizableHandle({
  className,
  withHandle = false,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & {
  withHandle?: boolean;
  orientation?: "vertical" | "horizontal";
}): React.ReactElement {
  const horizontal = orientation === "vertical"; // a vertical divider sits in a horizontal group
  return (
    <div
      role="separator"
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      data-slot="resizable-handle"
      className={cn(
        "group relative flex shrink-0 items-center justify-center bg-transparent outline-none transition-colors",
        horizontal ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <span
          className={cn(
            "rounded-full bg-foreground-subtlest/50 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[dragging=true]:opacity-100",
            horizontal ? "h-8 w-0.5" : "h-0.5 w-8",
          )}
        />
      )}
    </div>
  );
}
