import { useEffect, useRef } from "react";
import { useToast } from "@/context/ToastContext";
import { isValidCalendarYmd } from "@/utils/calendarYmd";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tüm sayfalarda `<input type="date" />` için tarayıcı geçerliliği (ör. 2026-02-30) —
 * V3 ile aynı: blur / invalid yakalayınca toast (çift tetiklemeyi throttle).
 */
export default function GlobalDateInputValidation() {
  const { error } = useToast();
  const lastDateValidationToastRef = useRef(0);

  useEffect(() => {
    const maybeShowDateError = (target: EventTarget | null) => {
      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== "date") return;
      const v = target.value.trim();
      const invalidNative = !target.validity.valid;
      const invalidYmd = v.length > 0 && YMD_RE.test(v) && !isValidCalendarYmd(v);
      if (!invalidNative && !invalidYmd) return;
      const now = Date.now();
      if (now - lastDateValidationToastRef.current < 1200) return;
      lastDateValidationToastRef.current = now;
      error("Geçersiz tarih. Lütfen geçerli bir tarih girin.");
    };

    const onBlurCapture = (event: FocusEvent) => {
      maybeShowDateError(event.target);
    };

    const onInvalidCapture = (event: Event) => {
      maybeShowDateError(event.target);
    };

    document.addEventListener("blur", onBlurCapture, true);
    document.addEventListener("invalid", onInvalidCapture, true);
    return () => {
      document.removeEventListener("blur", onBlurCapture, true);
      document.removeEventListener("invalid", onInvalidCapture, true);
    };
  }, [error]);

  return null;
}
