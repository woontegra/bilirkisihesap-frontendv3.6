/**
 * Zamanaşımı uygulandığında cetvelin hemen üstünde gösterilen uyarı şeridi (V3 paritesi).
 */

import { formatTrIsoDate } from "./zamanasimiCore";
import styles from "./ZamanasimiCetvelBanner.module.css";

export function ZamanasimiCetvelBanner({
  nihaiBaslangic,
}: {
  nihaiBaslangic: string | null | undefined;
}) {
  const raw = (nihaiBaslangic ?? "").trim().slice(0, 10);
  if (!raw) return null;
  const label = formatTrIsoDate(raw);
  if (label === "—") return null;

  return (
    <div className={styles.banner} role="status">
      Zamanaşımı <strong className={styles.date}>{label}</strong> tarihi itibarıyla uygulanmıştır; cetvel bu nihai
      başlangıç tarihine göre düzenlenmiştir.
    </div>
  );
}
