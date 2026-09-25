import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import styles from "../PuantajFmPage.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Dialog erişilebilirlik başlığı (aria-labelledby). */
  labelledBy?: string;
  /** Dialog erişilebilirlik etiketi (labelledBy yoksa). */
  ariaLabel?: string;
  /** Modal kartına ek sınıf (ör. offAuditModal). */
  cardClassName?: string;
  children: ReactNode;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Puantaj modülü ortak modal kabuğu.
 * document.body altına portal ile render edilir; viewport ortasında fixed overlay.
 * Scroll-lock + odak tuzağı + Escape; kapanınca scroll ve odak korunur.
 */
export default function PuantajPortalModal({
  open,
  onClose,
  labelledBy,
  ariaLabel,
  cardClassName,
  children,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const scrollYRef = useRef(0);
  const onCloseRef = useRef(onClose);
  const titleFallbackId = useId();

  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    scrollYRef.current = window.scrollY;
    const { body, documentElement } = document;
    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;
    const prevPosition = body.style.position;
    const prevTop = body.style.top;
    const prevWidth = body.style.width;
    const scrollbarGap = window.innerWidth - documentElement.clientWidth;

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollYRef.current}px`;
    body.style.width = "100%";
    if (scrollbarGap > 0) body.style.paddingRight = `${scrollbarGap}px`;

    const focusTimer = window.setTimeout(() => {
      const focusables = cardRef.current
        ? Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        : [];
      (focusables[0] ?? cardRef.current)?.focus();
    }, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !cardRef.current) return;
      const nodes = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) {
        e.preventDefault();
        cardRef.current.focus();
        return;
      }
      const firstEl = nodes[0];
      const lastEl = nodes[nodes.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === firstEl || document.activeElement === cardRef.current) {
          e.preventDefault();
          lastEl.focus();
        }
      } else if (document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
      body.style.position = prevPosition;
      body.style.top = prevTop;
      body.style.width = prevWidth;
      window.scrollTo(0, scrollYRef.current);
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const stopCardClick = (e: ReactMouseEvent) => e.stopPropagation();
  const onCardKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Enter" && e.target === cardRef.current) e.preventDefault();
  };

  return createPortal(
    <div className={styles.modalBackdrop} role="presentation" onClick={() => onCloseRef.current()}>
      <div
        ref={cardRef}
        className={cardClassName ? `${styles.modalCard} ${cardClassName}` : styles.modalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? (!ariaLabel ? titleFallbackId : undefined)}
        aria-label={ariaLabel}
        tabIndex={-1}
        onClick={stopCardClick}
        onKeyDown={onCardKeyDown}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
