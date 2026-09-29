import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import styles from "./CalculationVideo.module.css";

type Props = {
  title: string;
  embedUrl: string;
  onClose: () => void;
};

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], iframe, [tabindex]:not([tabindex="-1"])';

function readOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function CalculationVideoModal({ title, embedUrl, onClose }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const [online, setOnline] = useState(readOnline);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const html = document.documentElement;
    const body = document.body;
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };
    const scrollbarWidth = window.innerWidth - html.clientWidth;
    // Yalnız kök kilitlenir: body'ye overflow verilirse %100 yükseklikli düzende sayfa en üste atlar.
    html.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    closeRef.current?.focus({ preventScroll: true });

    return () => {
      html.style.overflow = previous.htmlOverflow;
      body.style.paddingRight = previous.bodyPaddingRight;
      if (window.scrollX !== previous.scrollX || window.scrollY !== previous.scrollY) {
        window.scrollTo(previous.scrollX, previous.scrollY);
      }
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  useEffect(() => {
    const update = () => setOnline(readOnline());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const onBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  const focusClose = () => closeRef.current?.focus();

  return createPortal(
    <div className={styles.backdrop} onMouseDown={onBackdropMouseDown} data-calculation-video-backdrop="">
      <span tabIndex={0} className={styles.focusGuard} onFocus={focusClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Videoyu kapat"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className={styles.frame}>
          {online ? (
            <iframe
              className={styles.iframe}
              src={embedUrl}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-presentation"
            />
          ) : (
            <p className={styles.offline} role="status">
              Video yüklenemedi. İnternet bağlantınızı kontrol edip yeniden deneyin.
            </p>
          )}
        </div>
      </div>
      <span tabIndex={0} className={styles.focusGuard} onFocus={focusClose} aria-hidden="true" />
    </div>,
    document.body,
  );
}
