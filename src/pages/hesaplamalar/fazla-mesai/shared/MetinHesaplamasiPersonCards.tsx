import type { CSSProperties } from "react";
import styles from "./MetinHesaplamasiPersonCards.module.css";

export type MetinHesaplamasiPersonCard = {
  key: string;
  /** Kart başlığı (DAVACI, TANIK 1, …) */
  label: string;
  /** Kişiye ait hesaplama metni; başlık satırı metinde varsa otomatik soyulur */
  text: string;
};

function normalizeLabel(s: string): string {
  return String(s ?? "")
    .trim()
    .replace(/:$/, "")
    .toLocaleUpperCase("tr");
}

/** Metin başındaki "DAVACI:" / "TANIK 1:" satırını (ve hemen ardından boş satırı) kaldırır. */
export function stripLeadingPersonLabel(text: string, label: string): string {
  const raw = String(text ?? "");
  if (!raw || !label) return raw;
  const lines = raw.split("\n");
  if (lines.length === 0) return raw;
  if (normalizeLabel(lines[0] ?? "") !== normalizeLabel(label)) return raw;
  let i = 1;
  while (i < lines.length && lines[i].trim() === "") i += 1;
  return lines.slice(i).join("\n");
}

/**
 * Tanıklı Metin Hesaplaması — kişi kartlarını yan yana (responsive) gösteren ortak yerleşim.
 * Hesaplama üretmez; yalnızca sunum.
 */
export function MetinHesaplamasiPersonCards({
  cards,
  emptyMessage,
  className,
}: {
  cards: MetinHesaplamasiPersonCard[];
  emptyMessage?: string;
  className?: string;
}) {
  if (!cards.length) {
    return emptyMessage ? <p className={styles.empty}>{emptyMessage}</p> : null;
  }

  const cols = Math.min(Math.max(cards.length, 1), 4);
  const style = { ["--metin-person-cols" as string]: String(cols) } as CSSProperties;

  return (
    <div
      className={[styles.grid, className].filter(Boolean).join(" ")}
      style={style}
      data-count={cols}
    >
      {cards.map((card) => {
        const body = stripLeadingPersonLabel(card.text, card.label);
        return (
          <article key={card.key} className={styles.card}>
            <h3 className={styles.label}>{card.label}</h3>
            <pre className={styles.text}>{body}</pre>
          </article>
        );
      })}
    </div>
  );
}
