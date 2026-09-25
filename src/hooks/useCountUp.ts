import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/useMediaQuery";

type Options = {
  duration?: number;
  decimals?: number;
  enabled?: boolean;
};

export function useCountUp(target: number, options: Options = {}): number {
  const { duration = 700, decimals = 0, enabled = true } = options;
  const reduce = usePrefersReducedMotion();
  const [value, setValue] = useState(reduce || !enabled ? target : 0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (reduce || !enabled) {
      setValue(target);
      return;
    }

    const start = performance.now();
    const from = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (target - from) * eased;
      setValue(Number(next.toFixed(decimals)));
      if (t < 1) {
        frame.current = requestAnimationFrame(tick);
      }
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current != null) {
        cancelAnimationFrame(frame.current);
      }
    };
  }, [target, duration, decimals, enabled, reduce]);

  return value;
}
