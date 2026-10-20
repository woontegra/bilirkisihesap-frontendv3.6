/**
 * Fazla mesai hakkaniyet indirimi oranı.
 * "1/3" kesir olarak saklanır ve tam olarak toplam / 3 uygulanır; yüzdelik seçenekler "%NN" anahtarlarıdır.
 */

export type HakkaniyetOrani = "1/3" | "%20" | "%25" | "%30" | "%35" | "%40" | "%45";

export const VARSAYILAN_HAKKANIYET_ORANI: HakkaniyetOrani = "1/3";

export const HAKKANIYET_ORANLARI: readonly HakkaniyetOrani[] = ["1/3", "%20", "%25", "%30", "%35", "%40", "%45"];

const YUZDE_DEGERLERI: Record<Exclude<HakkaniyetOrani, "1/3">, number> = {
  "%20": 20,
  "%25": 25,
  "%30": 30,
  "%35": 35,
  "%40": 40,
  "%45": 45,
};

export function normalizeHakkaniyetOrani(value: unknown): HakkaniyetOrani {
  return typeof value === "string" && (HAKKANIYET_ORANLARI as readonly string[]).includes(value)
    ? (value as HakkaniyetOrani)
    : VARSAYILAN_HAKKANIYET_ORANI;
}

/** Yuvarlama yapmaz; modüller mevcut yuvarlama davranışlarını kendileri uygular. */
export function hesaplaHakkaniyetIndirimi(toplam: number, oran: unknown): number {
  const o = normalizeHakkaniyetOrani(oran);
  if (o === "1/3") return toplam / 3;
  return (toplam * YUZDE_DEGERLERI[o]) / 100;
}

/** Etiketlerde kullanılan oran metni: "1/3" veya "%20". */
export function hakkaniyetOraniEtiketi(oran: unknown): string {
  return normalizeHakkaniyetOrani(oran);
}
