export type Rect = { top: number; left: number; width: number; height: number };

export function readTargetRect(el: HTMLElement | null): Rect | null {
  if (!el || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 && r.height <= 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function findTourTarget(target: string): HTMLElement | null {
  if (!target || typeof document === "undefined") return null;
  const escaped =
    typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(target) : target.replace(/"/g, '\\"');
  const el = document.querySelector(`[data-tour="${escaped}"]`);
  return el instanceof HTMLElement ? el : null;
}

const PAD = 8;
const GAP = 12;
const BUBBLE_W = 320;
const BUBBLE_H_EST = 220;

export type Placement = "top" | "bottom" | "left" | "right";

export function pickPlacement(
  rect: Rect,
  preferred: Placement | "auto",
  vw: number,
  vh: number,
): Placement {
  if (preferred !== "auto") return preferred;
  const space = {
    top: rect.top,
    bottom: vh - (rect.top + rect.height),
    left: rect.left,
    right: vw - (rect.left + rect.width),
  };
  const order: Placement[] = ["bottom", "top", "right", "left"];
  let best: Placement = "bottom";
  let bestScore = -1;
  for (const p of order) {
    const need = p === "top" || p === "bottom" ? BUBBLE_H_EST + GAP : BUBBLE_W + GAP;
    const score = space[p] - need;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

export function placeBubble(
  rect: Rect,
  placement: Placement,
  vw: number,
  vh: number,
  bubbleW: number,
  bubbleH: number,
): { top: number; left: number } {
  let top = 0;
  let left = 0;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  switch (placement) {
    case "bottom":
      top = rect.top + rect.height + GAP;
      left = cx - bubbleW / 2;
      break;
    case "top":
      top = rect.top - bubbleH - GAP;
      left = cx - bubbleW / 2;
      break;
    case "right":
      top = cy - bubbleH / 2;
      left = rect.left + rect.width + GAP;
      break;
    case "left":
      top = cy - bubbleH / 2;
      left = rect.left - bubbleW - GAP;
      break;
  }

  left = Math.max(PAD, Math.min(left, vw - bubbleW - PAD));
  top = Math.max(PAD, Math.min(top, vh - bubbleH - PAD));
  return { top, left };
}

/** Scroll target into view if needed; returns a promise that settles after scroll. */
export function scrollTargetIntoView(
  el: HTMLElement,
  mode: "center" | "nearest" | "none" = "center",
): Promise<void> {
  return new Promise((resolve) => {
    if (mode === "none") {
      resolve();
      return;
    }
    const rect = el.getBoundingClientRect();
    const margin = mode === "nearest" ? 24 : 96;
    const vh = window.innerHeight;
    const needs =
      rect.top < margin ||
      rect.bottom > vh - margin ||
      rect.left < 8 ||
      rect.right > window.innerWidth - 8;
    if (!needs) {
      resolve();
      return;
    }
    el.scrollIntoView({
      behavior: "smooth",
      block: mode === "nearest" ? "nearest" : "center",
      inline: "nearest",
    });
    window.setTimeout(resolve, mode === "nearest" ? 220 : 380);
  });
}
