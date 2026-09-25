import type { CodeMap, IzinKodKey, StandardRow } from "./model";
import { OFF_HOURS_PER_DAY } from "./model";
import { normalizeText } from "./utils";

/**
 * İzin / tatil / rapor açıklamalarının koda eşlenmesi.
 * Sistem otomatik tahmin yapar; kullanıcı doğrular. Tanınmayan açıklamalar
 * "BILINMIYOR" döner ve kullanıcıya sorulur; cevap şablona (CodeMap) kaydedilir.
 *
 * Çoklu etiket: aynı satırda Mesai Açıklama ve İzin Açıklama bağımsız
 * sınıflandırılıp `durumKodlari` dizisinde birleştirilir (OFF + RAPOR gibi).
 */

const DEFAULT_KEYWORDS: { key: IzinKodKey; words: string[] }[] = [
  {
    key: "OFF",
    words: [
      "off",
      "fm izni",
      "fazla mesai izni",
      "fazla calisma izni",
      "fazla mesai karsiligi izin",
      "fazla calisma karsiligi izin",
    ],
  },
  { key: "HAFTA_TATILI", words: ["hafta tatili", "haftalik tatil", "ht", "pazar", "hafta ici tatil"] },
  { key: "YILLIK_IZIN", words: ["yillik izin", "yillik", "yi", "senelik izin", "yıllık"] },
  { key: "RAPOR", words: ["rapor", "istirahat", "hastalik", "saglik raporu", "isgoremezlik"] },
  { key: "UBGT", words: ["ubgt", "resmi tatil", "bayram", "genel tatil", "milli bayram", "dini bayram"] },
  {
    key: "IZIN",
    words: ["izin", "mazeret", "ucretsiz izin", "idari izin", "olum izni", "dogum izni", "evlilik izni"],
  },
  { key: "CALISMADI", words: ["calismadi", "devamsiz", "gelmedi", "yok", "eksik", "ise gelmedi", "x"] },
  { key: "CALISTI", words: ["calisti", "mesai", "tam gun", "normal", "geldi", "var"] },
];

/** Gösterim/birincil kod önceliği (çoklu etiketten tek alan türetirken). */
const PRIMARY_PRIORITY: IzinKodKey[] = [
  "OFF",
  "RAPOR",
  "YILLIK_IZIN",
  "HAFTA_TATILI",
  "UBGT",
  "IZIN",
  "CALISMADI",
  "BILINMIYOR",
  "CALISTI",
];

export { OFF_HOURS_PER_DAY };

/** Ham OFF adayı metnini normalize eder (Unicode boşluk, yıldız varyasyonları). */
export function normalizeOffProbe(raw: string): string {
  const stripped = (raw ?? "")
    .toString()
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, " ")
    .replace(/^[\s*·•∗＊✱\u2217]+/u, "")
    .replace(/[\s*·•∗＊✱\u2217]+$/u, "")
    .trim();
  return normalizeText(stripped);
}

/** Metin OFF adayı mı? (şablon eşlemesi ve eş anlamlılar dahil). */
export function isOffCandidateText(raw: string, codeMap?: CodeMap): boolean {
  const text = (raw ?? "").toString();
  if (!text.trim()) return false;
  if (matchIzinKod(text, codeMap) === "OFF") return true;
  const probed = normalizeOffProbe(text);
  if (probed && matchIzinKod(probed, codeMap) === "OFF") return true;
  // "*OFF Rapor" gibi birleşik metinlerde OFF parçası
  if (/\boff\b/i.test(probed) || probed.split(/\s+/).includes("off")) return true;
  return false;
}

export function isOffCode(kod: IzinKodKey): boolean {
  return kod === "OFF";
}

/** Tek bir ham açıklamayı, önce şablon CodeMap'e sonra varsayılan sözlüğe bakarak eşler. */
export function matchIzinKod(raw: string, codeMap?: CodeMap): IzinKodKey {
  const text = (raw ?? "").toString().trim();
  if (!text) return "CALISTI";

  const norm = normalizeText(text);
  if (!norm) return "CALISTI";

  if (codeMap) {
    if (codeMap[text]) return codeMap[text];
    if (codeMap[norm]) return codeMap[norm];
  }

  if (norm === "off") return "OFF";

  for (const group of DEFAULT_KEYWORDS) {
    for (const w of group.words) {
      const nw = normalizeText(w);
      if (!nw) continue;
      if (norm === nw || norm.includes(nw)) {
        return group.key;
      }
    }
  }
  return "BILINMIYOR";
}

/**
 * Tek metinden birden fazla sınıflandırma kodu çıkarır.
 * Örn. "*OFF Rapor" → [OFF, RAPOR]; "Rapor" → [RAPOR].
 */
export function extractIzinKodlari(raw: string, codeMap?: CodeMap): IzinKodKey[] {
  const text = (raw ?? "").toString().trim();
  if (!text) return [];

  const found: IzinKodKey[] = [];
  const add = (k: IzinKodKey) => {
    if (!k || k === "CALISTI") return;
    if (!found.includes(k)) found.push(k);
  };

  if (codeMap) {
    if (codeMap[text]) add(codeMap[text]);
    const n = normalizeText(text);
    if (n && codeMap[n]) add(codeMap[n]);
  }

  const probed = normalizeOffProbe(text);
  const norm = normalizeText(text);

  if (isOffCandidateText(text, codeMap)) add("OFF");

  for (const group of DEFAULT_KEYWORDS) {
    if (group.key === "CALISTI") continue;
    for (const w of group.words) {
      const nw = normalizeText(w);
      if (!nw || nw.length < 2) continue;
      // Tek harfli/çok genel kelimeler ("yi", "ht", "x") yalnızca tam eşleşmede
      const shortExact = nw.length <= 2;
      if (shortExact) {
        if (probed === nw || norm === nw) {
          add(group.key);
          break;
        }
        continue;
      }
      if (probed === nw || probed.includes(nw) || norm === nw || norm.includes(nw)) {
        add(group.key);
        break;
      }
    }
  }

  // "izin" genel grubu OFF/yıllık/fazla mesai izni zaten yakalandıysa ekleme — yukarıda sırayla eklendi.
  // IZIN kelimesi "fazla mesai izni" içinde de geçer; OFF zaten eklendiyse IZIN'i düşür.
  if (found.includes("OFF") && found.includes("IZIN")) {
    const withoutGeneric = found.filter((k) => k !== "IZIN");
    found.length = 0;
    found.push(...withoutGeneric);
  }

  if (found.length === 0) {
    const single = matchIzinKod(text, codeMap);
    if (single === "BILINMIYOR") return ["BILINMIYOR"];
    if (single !== "CALISTI") return [single];
    return [];
  }

  return found.filter((k) => k !== "BILINMIYOR" || found.length === 1);
}

/** Birden fazla kaynaktan etiketleri benzersiz birleştirir. */
export function mergeDurumKodlari(...lists: IzinKodKey[][]): IzinKodKey[] {
  const out: IzinKodKey[] = [];
  for (const list of lists) {
    for (const k of list) {
      if (!k || k === "CALISTI") continue;
      if (!out.includes(k)) out.push(k);
    }
  }
  return out;
}

/** Çoklu etiketten geriye uyumlu tek gösterim kodu. */
export function primaryIzinKod(kodlar: IzinKodKey[]): IzinKodKey {
  if (!kodlar || kodlar.length === 0) return "CALISTI";
  for (const p of PRIMARY_PRIORITY) {
    if (kodlar.includes(p)) return p;
  }
  return kodlar[0] ?? "CALISTI";
}

/** Eski tekil kodlu satırı çoklu etiket dizisine yükseltir. */
export function ensureDurumKodlari(row: Pick<StandardRow, "durumKodlari" | "izinTatilKodu">): IzinKodKey[] {
  if (Array.isArray(row.durumKodlari) && row.durumKodlari.length > 0) {
    return [...row.durumKodlari];
  }
  const k = row.izinTatilKodu;
  if (!k || k === "CALISTI") return [];
  return [k];
}

/** Satırda OFF etiketi var mı? (çoklu etiket + eski tekil kod). */
export function rowHasOff(row: Pick<StandardRow, "durumKodlari" | "izinTatilKodu">): boolean {
  return ensureDurumKodlari(row).includes("OFF");
}

/** Etiketlerden herhangi biri çalışma dışı mı? */
export function isNonWorkingDurum(kodlar: IzinKodKey[]): boolean {
  return kodlar.some((k) => isNonWorkingCode(k));
}

/** Belirli koda ait gün, hesaplamada çalışma günü sayılmaz (fazla mesai üretmez). */
export function isNonWorkingCode(kod: IzinKodKey): boolean {
  return (
    kod === "HAFTA_TATILI" ||
    kod === "IZIN" ||
    kod === "YILLIK_IZIN" ||
    kod === "RAPOR" ||
    kod === "UBGT" ||
    kod === "OFF" ||
    kod === "CALISMADI"
  );
}

/** Ham açıklamalar içinden benzersiz (tanınmayan dahil) kod önerisi listesi. */
export function collectUnknownDescriptions(rawList: string[], codeMap?: CodeMap): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rawList) {
    const text = (raw ?? "").toString().trim();
    if (!text) continue;
    const codes = extractIzinKodlari(text, codeMap);
    if (codes.length > 0 && !codes.includes("BILINMIYOR")) continue;
    if (matchIzinKod(text, codeMap) !== "BILINMIYOR") continue;
    const norm = normalizeText(text);
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(text);
  }
  return out;
}

/** Etiketleri kullanıcıya gösterilebilir kısa metne çevirir. */
export function formatDurumKodlari(kodlar: IzinKodKey[]): string {
  if (!kodlar || kodlar.length === 0) return "";
  return kodlar.join(" · ");
}
