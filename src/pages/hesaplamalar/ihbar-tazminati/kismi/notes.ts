/**
 * İhbar Tazminatı — Kısmi Süreli İş Sözleşmesi. Hukuki notlar.
 * Kaynak: FrontendV3/src/calculations/ihbar-tazminati/ihbarKismiNoteItems.ts (IHBAR_KISMI_NOTE_LINES).
 * Not: Belirli Süreli (belirli) varyantı da aynı metni kullanır.
 */

import type { NoteBlock } from "../lib/types";

export const NOTE_BLOCKS: NoteBlock[] = [
  { text: "Süreli fesih", kind: "heading" },
  {
    text: "Madde 17 - Belirsiz süreli iş sözleşmelerinin feshinden önce durumun diğer tarafa bildirilmesi gerekir.",
  },
  { text: "İş sözleşmeleri;", kind: "heading" },
  {
    text: "a) İşi altı aydan az sürmüş olan işçi için, bildirimin diğer tarafa yapılmasından başlayarak iki hafta sonra,",
    kind: "li",
  },
  {
    text: "b) İşi altı aydan birbuçuk yıla kadar sürmüş olan işçi için, bildirimin diğer tarafa yapılmasından başlayarak dört hafta sonra,",
    kind: "li",
  },
  {
    text: "c) İşi birbuçuk yıldan üç yıla kadar sürmüş olan işçi için, bildirimin diğer tarafa yapılmasından başlayarak altı hafta sonra,",
    kind: "li",
  },
  {
    text: "d) İşi üç yıldan fazla sürmüş işçi için, bildirim yapılmasından başlayarak sekiz hafta sonra,",
    kind: "li",
  },
  { text: "feshedilmiş sayılır." },
  { text: "Bu süreler asgari olup sözleşmeler ile artırılabilir." },
  { text: "Bildirim şartına uymayan taraf, bildirim süresine ilişkin ücret tutarında tazminat ödemek zorundadır." },
  { text: "İşveren bildirim süresine ait ücreti peşin vermek suretiyle iş sözleşmesini feshedebilir." },
];
