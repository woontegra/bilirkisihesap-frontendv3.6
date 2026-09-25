/**
 * 48 Saat Vardiya — Metin Hesaplaması (V3 bilirkisiDefaultText birebir).
 */

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import styles from "./Vardiya48FmPage.module.css";

export function MetinHesaplamasi({ anchorIsWorkDay }: { anchorIsWorkDay: boolean }) {
  const [open, setOpen] = useState(false);

  const text = [
    "24/48 (48 saat dinlenmeli) — bilirkişi özeti:",
    "• Günlük 11 saatlik üst sınır; vardiyada fiilen kabul edilen çalışma 14 saat → vardiya başına 3 saat FM.",
    "• Her 7 günlük blokta (faz / işe girişe göre) vardiya çalışma günü × 3 saat = blok FM;",
    "  tipik olarak blok başına 2 veya 3 vardiya günü → 6 veya 9 saat.",
    `• 24/48 vardiya fazı işe girişe göre; ilk gün: ${anchorIsWorkDay ? "çalıştı" : "dinlendi"}.`,
    "• Üç günlük vardiya ritmi: bir vardiya çalışma günü, ardından iki tam dinlence günü.",
    "• Geçerli tanık tarih aralığı yoksa hesaplama davacı işe giriş–çıkış dönemi üzerinden yapılır.",
  ].join("\n");

  return (
    <div className={styles.accordion}>
      <button type="button" className={styles.accordionHead} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>Metin Hesaplaması</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open ? (
        <div className={styles.accordionBody}>
          <pre className={styles.metinText} style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>
            {text}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
