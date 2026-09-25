/**
 * İhbar Tazminatı — Basın İş Kanunu. Hukuki notlar.
 * Kaynak: FrontendV3/src/calculations/ihbar-tazminati/ihbarBasinNoteItems.ts (BASIN_IHBAR_NOTE_ITEMS, 5953 sayılı Kanun).
 * "HEADING:" önekli satırlar başlık, boş satırlar ayraç olarak atlanır.
 */

import type { NoteBlock } from "../lib/types";

const RAW_LINES: string[] = [
  "HEADING:Feshin ihbarı:",
  "",
  "Madde 5 – Müddeti muayyen olmıyan iş akitlerinde feshin ihbarı bu Kanunda yazılı mühletlere tabidir.",
  "",
  "6 ncı ve 7 nci maddelerde yazılı ihbar mühletlerine tekabül eden ücret miktarındaki tazminatın işveren veya gazeteci tarafından diğer tarafa önceden ödenmesi suretiyle akdin derhal feshi de caizdir.",
  "",
  "HEADING:Akdin işveren tarafından feshi ve kıdem tazminatı:",
  "",
  "Madde 6 – (Değişik: 4/1/1961 - 212/1 md.)",
  "",
  "(İptal fıkra: Anayasa Mahkemesinin 4/5/2023 Tarihli ve E: 2021/62, K: 2023/89 Sayılı Kararı ile.)",
  "",
  "Kıdem hakkı gazetecinin mesleke ilk giriş tarihinden itibaren hesaplanır.",
  "",
  "Akdin feshi halinde gazeteci, bu süreye göre hesaplanacak tazminatı almaya hak kazanır.",
  "",
  "Birinci maddenin şümulüne giren bir işyerinde işverenle arasındaki hizmet münasebeti bir veya müteaddit mukaveleye istinaden fasılasız olarak en az beş yıl sürmüş olan gazetecinin işine son verilmesi yapılacak yazılı ihbardan itibaren üç ay geçtikten sonra muteber olur. Beş seneden az hizmeti olanlar için bu ihbar müddeti bir aydır.",
  "",
  "İhbar müddetinin son günü olan tarih tazminata esas tutulur ve yıllık izinden sayılmaz.",
  "",
  "Gazeteci yıllık iznini kullanmamışsa, işine son verilmesi halinde, izin müddetine ait ücreti kendisine peşin olarak verilir.",
  "",
  "Hizmetine bu madde hükümlerine göre son verilen gazeteciye feshi ihbar edilen mukavelenin taallük ettiği her hizmet yılı veya küsuru için, son aylığı esas ittihaz olunmak suretiyle her yıl için bir aylık ücreti miktarında tazminat verilir. (İptal ikinci cümle: Anayasa Mahkemesinin 4/5/2023 Tarihli ve E: 2021/62, K: 2023/89 Sayılı Kararı ile.) İlk mukavele yılında bu miktar hesaplanmaz.",
  "",
  "Bir defa kıdem tazminatı alan gazetecinin kıdemi, yeni işine girişinden itibaren hesaplanır. Ancak, buna aykırı olarak işverenle gazeteci arasında yapılacak mukavele muteberdir.",
  "",
  "İşverenin maddi imkansızlık sebebiyle gazetecinin tazminatını bir defada ödeyememesi halinde, tediye en çok dört taksitte yapılır ve bu taksitlerin tamamının süresi bir yılı geçemez. Ancak, bu bölünme o iş yerinin mali vergisini tahakkuk ettiren maliye şubesinin, müessesenin zarar etmekte olduğu kararı üzerine yapılabilir.",
  "",
  "(Ek: 9/8/2002-4773/12 md.; Değişik: 22/5/2003-4857/116 md.) İş Kanununun 18, 19, 20, 21 ve 29 uncu maddesi hükümleri kıyas yoluyla uygulanır.",
  "",
  "HEADING:Akdin gazeteci tarafından feshi:",
  "",
  "Madde 7 – Gazeteci en az bir ay evvel işverene yazılı ihbarda bulunmak suretiyle iş akdini her zaman feshedebilir.",
  "",
  "HEADING:Müddetlerin artırılması:",
  "",
  "Madde 8 – Yukarki maddelerde yazılı ihbar mühletleri asgari olup mukavele ile artırılabilir.",
];

export const NOTE_BLOCKS: NoteBlock[] = RAW_LINES.filter((line) => line !== "").map((line) =>
  line.startsWith("HEADING:") ? { text: line.slice("HEADING:".length), kind: "heading" } : { text: line },
);
