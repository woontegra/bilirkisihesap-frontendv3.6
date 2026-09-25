/**
 * Dönemsel — Metin Hesaplaması (V3 format, simple variant).
 */

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { buildDonemselFmMetinCards } from "./seasonalHours";
import type { DonemselFormSnapshot } from "./model";
import { MetinHesaplamasiPersonCards } from "../shared/MetinHesaplamasiPersonCards";
import styles from "./DonemselFmPage.module.css";

function cardLabelFromText(text: string, fallback: string): string {
  const first = String(text ?? "").split("\n")[0]?.trim() ?? "";
  if (!first) return fallback;
  return first.replace(/:$/, "").trim() || fallback;
}

export function MetinHesaplamasi({ form }: { form: DonemselFormSnapshot }) {
  const [open, setOpen] = useState(false);
  const cards = useMemo(() => {
    const raw = buildDonemselFmMetinCards({
      dateIn: form.dateIn,
      dateOut: form.dateOut,
      summerPattern: form.summerPattern,
      winterPattern: form.winterPattern,
      witnesses: form.witnessesSeasons,
    });
    return raw.map((c, i) => ({
      key: c.key,
      label: cardLabelFromText(c.text, i === 0 ? "DAVACI" : `TANIK ${i}`),
      text: c.text,
    }));
  }, [form.dateIn, form.dateOut, form.summerPattern, form.winterPattern, form.witnessesSeasons]);

  return (
    <section className={styles.card} style={{ animationDelay: "110ms" }}>
      <button
        type="button"
        className={styles.metinToggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>
          <strong>Metin Hesaplaması</strong>
          <span className={styles.metinHint}>Metin üzerinden hesaplama yapmak için tıklayın</span>
        </span>
        <ChevronDown size={16} className={open ? styles.metinChevronOpen : undefined} />
      </button>
      {open ? (
        <div className={styles.metinBody}>
          <p className={styles.panelHint}>
            Özet metinler yaz/kış desenine ve cetvelde kullanılan haftalık FM formülüne göredir; asgari ücret
            dönemleri ve tanık kesişimleri cetvel satırlarında ayrıca uygulanır.
          </p>
          <MetinHesaplamasiPersonCards cards={cards} />
        </div>
      ) : null}
    </section>
  );
}
