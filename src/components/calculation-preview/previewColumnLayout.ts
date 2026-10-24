import type { PreviewSection } from "./types";

export type ColumnAlign = 0 | 1 | 2;
export type ColumnRole = "text" | "count" | "amount";

const FM_CETVEL_HEADERS = ["Dönem", "Hafta", "Ücret", "Katsayı", "FM Saat", "225", "1,5", "Fazla Mesai"];
const FM_CETVEL_SPANS = [27, 7, 13, 8, 9, 8, 7, 21];
const FM_CETVEL_ALIGN: ColumnAlign[] = [0, 1, 2, 1, 1, 1, 1, 2];

function headerText(header: string): string {
  return header.trim().toLocaleLowerCase("tr");
}

export function columnRole(header: string): ColumnRole {
  const text = headerText(header);
  if (text === "225" || text === "1,5" || text === "1.5") return "count";
  if (/(ücret|ucret|tutar|fazla mesai|brüt|brut|tazminat|prim|mahsup|vergi|damga|alacak)/.test(text)) {
    return "amount";
  }
  if (/(^gün$|gün say|gun say|hafta|katsay|kat sayı|kat sayi|^oran$|adet|fm saat|^saat$|^yıl$|^süre$|^sure$)/.test(text)) {
    return "count";
  }
  return "text";
}

export function isFmCetvel(section: Pick<PreviewSection, "id" | "headers">): boolean {
  return (
    section.id === "cetvel" &&
    section.headers.length === FM_CETVEL_HEADERS.length &&
    FM_CETVEL_HEADERS.every((header, index) => section.headers[index] === header)
  );
}

export function columnAlignFor(header: string, cetvel: boolean, index: number): ColumnAlign {
  if (cetvel) return FM_CETVEL_ALIGN[index] ?? 0;
  const role = columnRole(header);
  if (role === "amount") return 2;
  if (role === "count") return 1;
  return 0;
}

export function columnSpansFor(headers: readonly string[], cetvel: boolean): number[] {
  if (cetvel) return FM_CETVEL_SPANS.slice();
  const weights = headers.map((header) => {
    const role = columnRole(header);
    const text = headerText(header);
    if (role === "amount") return 18;
    if (role === "count") return 9;
    if (/(dönem|donem|tarih|aralığ|açıklama|aciklama|kalem|başlangıç|baslangic|bitiş|bitis|giriş|giris|çıkış|cikis)/.test(text)) return 26;
    return 16;
  });
  const sum = weights.reduce((total, weight) => total + weight, 0) || 1;
  const spans = weights.map((weight) => Math.max(6, Math.round((weight / sum) * 100)));
  const drift = 100 - spans.reduce((total, span) => total + span, 0);
  const last = spans.length - 1;
  if (last >= 0) spans[last] = Math.max(6, (spans[last] ?? 6) + drift);
  return spans;
}

export function tablePointSize(columnCount: number, cetvel: boolean): 9 | 10 {
  if (cetvel || columnCount >= 6) return 9;
  return 10;
}

export function alignClass(align: ColumnAlign): "alignLeft" | "alignCenter" | "alignRight" {
  if (align === 2) return "alignRight";
  if (align === 1) return "alignCenter";
  return "alignLeft";
}
