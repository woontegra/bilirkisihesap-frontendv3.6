/**
 * 12 aylık eklenti hesaplama penceresi — Kıdem Tazminatı'ndaki pencereyle aynı görünüm.
 * Durum `useEklentiPenceresi` taslağından gelir; ay girdisinin biçimi ve sonucun yazımı sayfaya aittir.
 */

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { EklentiGunEsasiSecimi } from "./EklentiGunEsasiSecimi";
import type { EklentiGunEsasi } from "./eklentiGunEsasi";
import styles from "./EklentiHesaplamaModal.module.css";

export function EklentiHesaplamaModal({
  aylar,
  gunEsasi,
  sonucMetni,
  onAyDegistir,
  onGunEsasiDegistir,
  onKapat,
  onUygula,
}: {
  aylar: string[];
  gunEsasi: EklentiGunEsasi;
  sonucMetni: string;
  onAyDegistir: (index: number, value: string) => void;
  onGunEsasiDegistir: (value: EklentiGunEsasi) => void;
  onKapat: () => void;
  onUygula: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = window.setTimeout(() => cardRef.current?.querySelector<HTMLElement>("input, button")?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onKapat();
        return;
      }
      if (event.key !== "Tab" || !cardRef.current) return;
      const focusable = Array.from(
        cardRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)"),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      returnFocus?.focus();
    };
  }, [onKapat]);

  return (
    <div className={styles.overlay} role="presentation" onClick={onKapat}>
      <div
        ref={cardRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.title}>Eklenti hesaplama</h2>
        <p className={styles.desc}>Son 12 aylık bordro tutarlarını girin.</p>
        <div className={styles.monthGrid}>
          {aylar.map((value, index) => (
            <label key={index} className={styles.monthField}>
              <span>{index + 1}. ay</span>
              <input
                inputMode="decimal"
                value={value}
                onChange={(e) => onAyDegistir(index, e.target.value)}
                placeholder="1.250,00"
              />
            </label>
          ))}
        </div>
        <EklentiGunEsasiSecimi value={gunEsasi} onChange={onGunEsasiDegistir} />
        <p className={styles.formulaText}>Formül: (12 aylık toplam / {gunEsasi}) × 30</p>
        <p className={styles.formulaResult}>
          Sonuç: <strong>{sonucMetni}</strong>
        </p>
        <div className={styles.actions}>
          <Button variant="soft" onClick={onKapat}>
            İptal
          </Button>
          <Button variant="primary" onClick={onUygula}>
            Uygula
          </Button>
        </div>
      </div>
    </div>
  );
}
