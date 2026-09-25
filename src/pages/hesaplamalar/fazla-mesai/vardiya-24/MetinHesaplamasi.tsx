/**
 * 24 Saat Vardiya — Metin Hesaplaması (V3 formatı birebir).
 */

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import styles from "./Vardiya24FmPage.module.css";

export function MetinHesaplamasi({ anchorIsWorkDay }: { anchorIsWorkDay: boolean }) {
  const [open, setOpen] = useState(false);

  const text = [
    "24/24 Hesap Motoru (izole):",
    "1) Önce çalışma günleri üretilir (gün aşırı sistem).",
    `   Başlangıç fazı: ${anchorIsWorkDay ? "İlk gün çalıştı" : "İlk gün dinlendi"}.`,
    "2) UBGT / yıllık izin sadece çalışma günlerinden düşülür.",
    "   Dinlenme gününe gelen dışlama düşüm oluşturmaz.",
    "3) Haftalık özet çıkarılır:",
    "   - 3 çalışma günü -> 9 saat",
    "   - 4 çalışma günü -> 12 saat",
    "4) Sonuç satırları haftalık olarak cetvele yazılır.",
    "5) Geçerli tanık tarih aralığı yoksa hesaplama davacı işe giriş–çıkış dönemi üzerinden yapılır.",
  ].join("\n");

  return (
    <div className={styles.accordion}>
      <button type="button" className={styles.accordionHead} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>Metin Hesaplaması</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {!open ? <p className={styles.panelHint}>Metin üzerinden hesaplama yapmak için tıklayın</p> : null}
      {open ? (
        <div className={styles.accordionBody}>
          <pre className={styles.metinText} style={{ whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace", margin: 0 }}>
            {text}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
