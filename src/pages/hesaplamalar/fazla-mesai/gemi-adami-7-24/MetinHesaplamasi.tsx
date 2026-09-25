/**
 * Gemi Adamı 7×24 — Metin Hesaplaması (V3 GEMI_724_METIN_SABLON birebir).
 */

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { GEMI_724_METIN_SABLON } from "./engine";
import styles from "./Gemi724FmPage.module.css";

export function MetinHesaplamasi() {
  const [open, setOpen] = useState(false);

  return (
    <section className={styles.card} style={{ animationDelay: "90ms" }}>
      <div className={styles.accordion}>
        <button
          type="button"
          className={styles.accordionHead}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span>
            <span>Metin Hesaplaması</span>
            <span className={styles.panelHint}>Metin üzerinden hesaplama yapmak için tıklayın</span>
          </span>
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {open ? (
          <div className={styles.accordionBody}>
            <pre className={styles.metinText}>{GEMI_724_METIN_SABLON}</pre>
          </div>
        ) : null}
      </div>
    </section>
  );
}
