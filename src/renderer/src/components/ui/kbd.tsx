import type * as React from "react";
import { cn } from "@/lib/utils";

// Ported from ZCode packages/ui/src/components/ui/kbd.tsx.
// One chip per key, fixed height + minimum square width + centered, so a single
// symbol key (⌘/⇧) matches a letter key. font-sans keeps symbol glyphs from
// falling back to a wider mono face.
export function Kbd({
  className,
  ...props
}: React.ComponentProps<"kbd">): React.ReactElement {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 select-none items-center justify-center gap-1 rounded-sm bg-muted px-1 font-medium font-sans text-ui-xs text-muted-foreground [&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      data-slot="kbd"
      {...props}
    />
  );
}

/** Row of key chips for one chord, e.g. ⌘ + K. */
export function KbdGroup({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn("inline-flex items-center gap-1", className)}
      data-slot="kbd-group"
      {...props}
    />
  );
}
