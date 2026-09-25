/**
 * İhbar Tazminatı — Gemi Adamları. Hukuki notlar.
 * Kaynak: FrontendV3/src/calculations/ihbar-tazminati/IhbarGemiPage.tsx (GEMI_NOTE_PARAS).
 */

import type { NoteBlock } from "../lib/types";

export const NOTE_BLOCKS: NoteBlock[] = [
  {
    text: 'Deniz İş Kanunun "Aktin çözülmesinde bildirim" başlıklı 16. Maddesi uyarınca; Madde 16 – A) Süresi belirsiz hizmet akti, 14 üncü maddede yazılı durumlar dışında gemiadamının işe alınmasından itibaren altı ay geçmedikçe bozulamaz.',
  },
  { text: "B) Süresi belirsiz hizmet akitlerinin çözülmesinden önce durumun diğer tarafa bildirilmesi gerekir." },
  { text: "Hizmet akti:", kind: "heading" },
  {
    text: "a) İşi altı ay sürmüş olan gemiadamı için, bildirimin diğer tarafa yapılmasından başlıyarak iki hafta sonra,",
    kind: "li",
  },
  {
    text: "b) İşi altı aydan birbuçuk yıla kadar sürmüş olan gemiadamı için, bildirimin diğer tarafa yapılmasından başlıyarak dört hafta sonra,",
    kind: "li",
  },
  {
    text: "c) İşi birbuçuk yıldan üç yıla kadar sürmüş olan gemiadamı için bildirimin diğer tarafa yapılmasından başlıyarak altı hafta sonra,",
    kind: "li",
  },
  {
    text: "ç) İşi üç yıldan fazla sürmüş olan gemiadamı için, bildirimin diğer tarafa yapılmasından başlıyarak sekiz hafta sonra,",
    kind: "li",
  },
  { text: "Bozulmuş olur." },
  { text: "C) Öneller asgari olup toplu iş sözleşmesiyle veya hizmet akti ile artırılabilir." },
  {
    text: "D) Bildirme şartına uymıyan taraf, yukarıda yazılı önellere uygun ücret tutarında tazminat ödemek zorundadır.",
  },
  {
    text: 'Gemiadamının sendikaya üye olması, şikayete başvurması gibi sebeplerle işinden çıkarılması hallerinde ve genel olarak hizmet aktini bozma hakkının kötüye kullanıldığını gösteren diğer durumlarda "B" bendinde yazılı önellere ait ücretlerin üç katı tutarı tazminat olarak ödenir. Tarafların ayrıca tazminat isteme hakkı saklıdır.',
  },
];
