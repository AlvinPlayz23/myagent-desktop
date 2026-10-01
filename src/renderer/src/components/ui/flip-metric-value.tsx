import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

// Ported from ZCode packages/ui/src/components/ui/flip-metric-value.tsx.
// Renders a metric one character per slot and flips changed digits on a 3D
// X-axis, so a counter (tokens, cost) updates in place instead of the whole
// value flashing. Non-digit characters and reduced-motion users render static.
const FLIP_TRANSITION = {
  duration: 0.16,
  ease: [0.4, 0, 0.2, 1],
} as const;

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => setPrefersReducedMotion(query.matches);
    update();
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    }
    query.addListener(update);
    return () => query.removeListener(update);
  }, []);

  return prefersReducedMotion;
}

function isDigitCharacter(character: string): boolean {
  return /^[0-9]$/.test(character);
}

function getCharacterWidthClass(character: string): string {
  if (isDigitCharacter(character)) return "w-[0.66em]";
  if (character === ":" || character === ".") return "w-[0.34em]";
  return "w-[0.7em]";
}

function MetricCharacter({
  character,
  index,
  reducedMotion,
  animateInitial,
}: {
  character: string;
  index: number;
  reducedMotion: boolean;
  animateInitial: boolean;
}): JSX.Element {
  const widthClass = getCharacterWidthClass(character);

  // Every slot has a fixed height and centers, so digits and separators share
  // a visual midline; only digits ever flip.
  if (!isDigitCharacter(character) || reducedMotion) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-[1.15em] shrink-0 items-center justify-center leading-none",
          widthClass,
        )}
      >
        {character}
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex h-[1.15em] shrink-0 items-center justify-center overflow-hidden leading-none [perspective:8em]",
        widthClass,
      )}
    >
      <AnimatePresence initial={animateInitial}>
        <motion.span
          key={`${index}-${character}`}
          className="absolute inset-0 flex items-center justify-center leading-none"
          initial={{ rotateX: -90, y: "-0.45em", opacity: 0 }}
          animate={{ rotateX: 0, y: 0, opacity: 1 }}
          exit={{ rotateX: 90, y: "0.45em", opacity: 0 }}
          style={{ transformOrigin: "50% 50%" }}
          transition={FLIP_TRANSITION}
        >
          {character}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function FlipMetricValue({
  value,
  className,
  animateInitial = false,
}: {
  value: string;
  className?: string;
  animateInitial?: boolean;
}): JSX.Element {
  const reducedMotion = usePrefersReducedMotion();
  const characters = useMemo(() => Array.from(value), [value]);

  return (
    <span
      aria-label={value}
      data-animate-initial={animateInitial ? "true" : undefined}
      className={cn(
        "inline-flex max-w-full items-center overflow-hidden whitespace-nowrap align-middle leading-none",
        className,
      )}
      role="text"
      title={value}
    >
      {characters.map((character, index) => (
        <MetricCharacter
          key={index}
          character={character}
          index={index}
          reducedMotion={reducedMotion}
          animateInitial={animateInitial}
        />
      ))}
    </span>
  );
}
