import { Loading03 } from "@/components/ui/icons";
import type * as React from "react";
import { cn } from "@/lib/utils";

// Aligned with ZCode packages/ui/src/components/ui/spinner.tsx: fixed size-4
// default so spinners line up in rows without per-call sizing.
export function Spinner({
  className,
  ...props
}: React.ComponentProps<typeof Loading03>): React.ReactElement {
  return (
    <Loading03
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      role="status"
      {...props}
    />
  );
}
