import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// text-ui-* tokens express a FONT SIZE, but Tailwind's default `text-*` group
// treats `text-ui-sm` as an unknown color and drops it when another text color
// class is present. Register them under font-size so `cn('text-ui-base',
// 'text-foreground')` keeps both. Mirrors ZCode's component/lib/utils.ts.
const mergeUiClasses = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        "text-ui-2xs",
        "text-ui-xs",
        "text-ui-sm",
        "text-ui-caption",
        "text-ui-base",
        "text-ui-lg",
        "text-ui-xl",
        "text-mobile-input-safe",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return mergeUiClasses(clsx(inputs));
}
