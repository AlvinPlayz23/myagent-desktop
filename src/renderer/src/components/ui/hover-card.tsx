"use client";

import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import type * as React from "react";
import { cn } from "@/lib/utils";

// Ported from ZCode packages/ui/src/components/ui/hover-card.tsx.
// Base UI's PreviewCard gives hover/focus previews with the same surface
// language as our popovers: overlay elevation, compact padding, rounded-lg.
export function HoverCard(props: PreviewCardPrimitive.Root.Props): React.ReactElement {
  return <PreviewCardPrimitive.Root data-slot="hover-card" {...props} />;
}

export function HoverCardTrigger({
  ...props
}: PreviewCardPrimitive.Trigger.Props): React.ReactElement {
  return <PreviewCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />;
}

export function HoverCardContent({
  className,
  children,
  align = "center",
  sideOffset = 4,
  ...props
}: PreviewCardPrimitive.Popup.Props & {
  align?: PreviewCardPrimitive.Positioner.Props["align"];
  sideOffset?: PreviewCardPrimitive.Positioner.Props["sideOffset"];
}): React.ReactElement {
  return (
    <PreviewCardPrimitive.Portal>
      <PreviewCardPrimitive.Positioner
        align={align}
        sideOffset={sideOffset}
        className="z-50"
        data-slot="hover-card-positioner"
      >
        <PreviewCardPrimitive.Popup
          data-slot="hover-card-content"
          className={cn(
            "relative w-64 origin-(--transform-origin) rounded-xl border border-popover-border bg-popover p-3 text-ui-base text-popover-foreground shadow-md transition-[scale,opacity] data-ending-style:scale-98 data-starting-style:scale-98 data-ending-style:opacity-0 data-starting-style:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </PreviewCardPrimitive.Popup>
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  );
}
