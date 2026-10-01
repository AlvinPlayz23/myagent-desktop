import { Loader2Icon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

// Aligned with ZCode packages/ui/src/components/ui/spinner.tsx: fixed size-4
// default so spinners line up in rows without per-call sizing.
export function Spinner({
  className,
  ...props
}: React.ComponentProps<typeof Loader2Icon>): React.ReactElement {
  return (
    <Loader2Icon
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      role="status"
      {...props}
    />
  );
}
