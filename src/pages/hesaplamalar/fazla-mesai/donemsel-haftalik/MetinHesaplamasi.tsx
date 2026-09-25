/**
 * Dönemsel Haftalık — Metin Hesaplaması (V3 formatı).
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { buildDonemselFmMetinCards } from "./seasonalHours";
import type { DonemselHaftalikWitness, SeasonalHaftalikPattern } from "./model";
import { MetinHesaplamasiPersonCards } from "../shared/MetinHesaplamasiPersonCards";
import styles from "./DonemselHaftalikFmPage.module.css";

function cardLabelFromText(text: string, fallback: string): string {
  const first = String(text ?? "").split("\n")[0]?.trim() ?? "";
  if (!first) return fallback;
  return first.replace(/:$/, "").trim() || fallback;
}

export function MetinHesaplamasi({
  dateIn,
  dateOut,
  summerPattern,
  winterPattern,
  witnesses,
}: {
  dateIn: string;
  dateOut: string;
  summerPattern: SeasonalHaftalikPattern;
  winterPattern: SeasonalHaftalikPattern;
  witnesses: DonemselHaftalikWitness[];
}) {
  const [open, setOpen] = useState(false);

  const cards = useMemo(() => {
    const raw = buildDonemselFmMetinCards({
      dateIn,
      dateOut,
      summerPattern,
      winterPattern,
      witnesses,
    });
    return raw.map((c, i) => ({
      key: c.key,
      label: cardLabelFromText(c.text, i === 0 ? "DAVACI" : `TANIK ${i}`),
      text: c.text,
    }));
  }, [dateIn, dateOut, summerPattern, winterPattern, witnesses]);

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
            <p className={styles.panelHint}>
              Özet metinler yaz/kış desenine ve cetvelde kullanılan haftalık FM formülüne göredir; asgari ücret
              dönemleri ve tanık kesişimleri cetvel satırlarında ayrıca uygulanır.
            </p>
            <MetinHesaplamasiPersonCards cards={cards} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
