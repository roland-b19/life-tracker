"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Eases from the previously shown value to `value` (ease-out cubic), like the numeric
 * transitions in Apple's apps. With reduced motion it jumps straight to the value.
 * It shows the real value from the first frame; `from` sets another start on first render.
 */
export function useAnimatedNumber(value: number, from = value, duration = 600): number {
  const [shown, setShown] = useState(from);
  const current = useRef(from);

  useEffect(() => {
    const start = current.current;
    if (start === value) return;
    const d = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : duration;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = d ? Math.min(1, (t - t0) / d) : 1;
      const next = start + (value - start) * (1 - Math.pow(1 - k, 3));
      current.current = next;
      setShown(next);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return shown;
}

export function AnimatedNumber({
  value,
  format = (n) => String(Math.round(n)),
  from,
}: {
  value: number;
  format?: (n: number) => string;
  from?: number;
}) {
  // Shows the real value at once, then eases between values.
  return <>{format(useAnimatedNumber(value, from))}</>;
}
