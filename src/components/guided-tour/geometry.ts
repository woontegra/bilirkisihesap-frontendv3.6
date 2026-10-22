export type Rect = { top: number; left: number; width: number; height: number };

export function readTargetRect(el: HTMLElement | null): Rect | null {
  if (!el || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 && r.height <= 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function tourTargetSelector(target: string): string {
  const escaped =
    typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(target) : target.replace(/"/g, '\\"');
  return `[data-tour="${escaped}"]`;
}

export function findTourTarget(target: string): HTMLElement | null {
  if (!target || typeof document === "undefined") return null;
  const el = document.querySelector(tourTargetSelector(target));
  return el instanceof HTMLElement ? el : null;
}

/** Olay hedefi verilen kılavuz hedefinin içinde mi (hedef yeniden oluşturulmuş olsa da)? */
export function isInsideTourTarget(node: EventTarget | null, target: string): boolean {
  if (!target || !(node instanceof Element)) return false;
  return node.closest(tourTargetSelector(target)) !== null;
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

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

export type BubbleLayout = { top: number; left: number; placement: Placement };

/**
 * Balon konumu: tercih edilen yön → mevcut yön → diğer yönler; hedefle çakışmayan ilk aday seçilir.
 * Hiçbiri sığmıyorsa (hedef ekrandan büyük) ekran köşelerinden hedefin görünen kısmıyla en az çakışan seçilir.
 * Sonuç her zaman ekran içindedir.
 */
export function layoutBubble(
  target: Rect | null,
  preferred: Placement | "auto",
  vw: number,
  vh: number,
  bubbleW: number,
  bubbleH: number,
  current?: Placement,
): BubbleLayout {
  const bw = Math.min(bubbleW, Math.max(0, vw - PAD * 2));
  const bh = Math.min(bubbleH, Math.max(0, vh - PAD * 2));
  if (!target) {
    return { top: Math.max(PAD, (vh - bh) / 2), left: Math.max(PAD, (vw - bw) / 2), placement: current ?? "bottom" };
  }
  const visible: Rect = {
    top: Math.max(0, target.top),
    left: Math.max(0, target.left),
    width: Math.max(0, Math.min(vw, target.left + target.width) - Math.max(0, target.left)),
    height: Math.max(0, Math.min(vh, target.top + target.height) - Math.max(0, target.top)),
  };
  const order: Placement[] = [];
  const push = (p: Placement | undefined) => {
    if (p && !order.includes(p)) order.push(p);
  };
  if (preferred !== "auto") push(preferred);
  push(current);
  for (const p of ["bottom", "top", "right", "left"] as Placement[]) push(p);

  const candidates: BubbleLayout[] = order.map((p) => ({ ...placeBubble(target, p, vw, vh, bw, bh), placement: p }));
  const fitting = candidates.find((c) => overlapArea({ top: c.top, left: c.left, width: bw, height: bh }, visible) === 0);
  if (fitting) return fitting;

  const corners: BubbleLayout[] = [
    { top: vh - bh - PAD, left: vw - bw - PAD, placement: "bottom" },
    { top: PAD, left: vw - bw - PAD, placement: "top" },
    { top: vh - bh - PAD, left: PAD, placement: "bottom" },
    { top: PAD, left: PAD, placement: "top" },
  ];
  let best = candidates[0]!;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const c of [...candidates, ...corners]) {
    const area = overlapArea({ top: c.top, left: c.left, width: bw, height: bh }, visible);
    if (area < bestArea) {
      best = c;
      bestArea = area;
    }
  }
  return best;
}

function sameRect(a: DOMRect, b: DOMRect): boolean {
  return Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5;
}

/** Hedef konumu (yumuşak kaydırma dahil) oturana kadar bekler; en fazla `maxMs`. */
export function waitForStablePosition(el: HTMLElement, maxMs = 900): Promise<void> {
  return new Promise((resolve) => {
    const started = performance.now();
    let last = el.getBoundingClientRect();
    let stableFrames = 0;
    const tick = () => {
      const now = el.getBoundingClientRect();
      stableFrames = sameRect(now, last) ? stableFrames + 1 : 0;
      last = now;
      if (stableFrames >= 4 || performance.now() - started > maxMs) {
        resolve();
        return;
      }
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });
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
    void waitForStablePosition(el, 900).then(resolve);
  });
}
