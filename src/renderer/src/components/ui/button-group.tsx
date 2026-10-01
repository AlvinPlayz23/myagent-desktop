import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

// Ported from ZCode packages/ui/src/components/ui/button-group.tsx.
// Joins adjacent buttons/inputs/selects into one segmented shell: shared edges
// collapse (inner radii removed, inner borders dropped) so the group reads as a
// single control instead of a row of separate ones.
const buttonGroupVariants = cva(
  "flex w-fit items-stretch *:focus-visible:relative *:focus-visible:z-10 has-[>[data-slot=button-group]]:gap-2 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-md [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
  {
    variants: {
      orientation: {
        horizontal:
          "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none [&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-md!",
        vertical:
          "flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none [&>[data-slot]:not(:has(~[data-slot]))]:rounded-b-md!",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  },
);

export function ButtonGroup({
  className,
  orientation,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof buttonGroupVariants>): React.ReactElement {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    />
  );
}

export function ButtonGroupText({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      data-slot="button-group-text"
      className={cn(
        "flex items-center gap-2 rounded-md border bg-muted px-2.5 text-ui-base font-medium [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof Separator>): React.ReactElement {
  return (
    <Separator
      data-slot="button-group-separator"
      orientation={orientation}
      className={cn(
        "relative self-stretch bg-input data-[orientation=horizontal]:mx-px data-[orientation=horizontal]:w-auto data-[orientation=vertical]:my-px data-[orientation=vertical]:h-auto",
        className,
      )}
      {...props}
    />
  );
}

export { buttonGroupVariants };
