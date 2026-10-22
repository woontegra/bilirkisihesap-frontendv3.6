import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

/** Kılavuzun portal kökü; katman taramalarında kılavuzun kendi öğeleri hariç tutulur. */
export const TOUR_ROOT_ATTR = "data-guided-tour-root";

/**
 * Kılavuzu duraklatan katmanlar: sayfa modalları (aria-modal), yerel <dialog> ve
 * modal olmayan açılır paneller için açık işaret (`data-tour-pause`).
 */
const FOREIGN_LAYER_SELECTOR = '[aria-modal="true"], dialog[open], [data-tour-pause]';

export function hasForeignLayer(doc: Document = document): boolean {
  for (const el of doc.querySelectorAll<HTMLElement>(FOREIGN_LAYER_SELECTOR)) {
    if (el.closest(`[${TOUR_ROOT_ATTR}]`)) continue;
    if (el.getAttribute("data-tour-pause") === "false") continue;
    if (el.getClientRects().length === 0) continue;
    return true;
  }
  return false;
}

/**
 * Kılavuz dışı bir modal/panel açık mı? Durum eşzamanlı uygulanır: sayfaların odak tuzakları
 * (son `[role="dialog"]`) modal açıldığı anda kılavuz balonunu değil modalı bulur.
 */
export function useForeignLayerOpen(enabled: boolean): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled || typeof MutationObserver === "undefined") {
      setOpen(false);
      return;
    }
    let current = hasForeignLayer();
    setOpen(current);
    const observer = new MutationObserver(() => {
      const next = hasForeignLayer();
      if (next === current) return;
      current = next;
      flushSync(() => setOpen(next));
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-modal", "open", "data-tour-pause", "hidden"],
    });
    return () => observer.disconnect();
  }, [enabled]);

  return enabled && open;
}
