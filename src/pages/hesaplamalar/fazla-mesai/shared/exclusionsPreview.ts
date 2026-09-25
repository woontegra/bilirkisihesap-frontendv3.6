import type { PreviewSection } from "@/components/calculation-preview";
import { formatIsoDateTR } from "@/utils/dateDisplay";

export type ExclusionPreviewInput = {
  type: string;
  start?: string;
  end?: string;
  days: number;
};

export function buildExclusionsPreviewSection(exclusions: ExclusionPreviewInput[]): PreviewSection | null {
  const rows = exclusions
    .filter((e) => e.type || e.start || e.end || e.days)
    .map((e) => [
      e.type || "—",
      formatIsoDateTR(e.start),
      formatIsoDateTR(e.end),
      String(e.days),
    ]);
  if (rows.length === 0) return null;
  return {
    id: "exclusions",
    title: "Yıllık İzin Düşümü / Dışlanan Günler",
    headers: ["Tür", "Başlangıç", "Bitiş", "Gün"],
    rows,
  };
}

/** Cetvel bölümünden hemen sonra dışlama tablosunu ekler (yoksa sona ekler). */
export function insertExclusionsPreviewSection(
  sections: PreviewSection[],
  exclusions: ExclusionPreviewInput[],
  afterSectionId = "cetvel",
): PreviewSection[] {
  const block = buildExclusionsPreviewSection(exclusions);
  if (!block) return sections;
  const idx = sections.findIndex((s) => s.id === afterSectionId);
  const insertAt = idx >= 0 ? idx + 1 : sections.length;
  return [...sections.slice(0, insertAt), block, ...sections.slice(insertAt)];
}
