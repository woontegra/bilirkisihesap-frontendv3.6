import type { PreviewSection } from "../types";
import { buildPreviewUdf } from "./buildPreviewUdf";

/** İndirme istemcidedir. Önizleme dizisi kopyalanarak okunur, değiştirilmez. */
export async function downloadPreviewUdf(sections: readonly PreviewSection[], fileName: string): Promise<void> {
  if (typeof CompressionStream === "undefined") {
    throw new Error("UDF sıkıştırması bu ortamda yok");
  }
  const bytes = await buildPreviewUdf(sections);
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
