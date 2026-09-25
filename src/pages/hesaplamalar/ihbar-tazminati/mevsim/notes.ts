/**
 * İhbar Tazminatı — Mevsimlik İşçi. Hukuki notlar.
 * Kaynak: FrontendV3/src/calculations/ihbar-tazminati/IhbarMevsimPage.tsx (MEVSIM_NOTE_PARAS).
 */

import type { NoteBlock } from "../lib/types";

export const NOTE_BLOCKS: NoteBlock[] = [
  { text: "Mevsimlik İşlerde:", kind: "heading" },
  {
    text: "İşin belirli bir mevsim devam ettiği ve bir mevsim için işe alınan işçinin iş sözleşmesi belirli süreli bir iş sözleşmesi olacağından, sözleşmenin ihbar öneli tanınarak sona erdirilmesi veya ihbar tazminatı ödenmesi söz konusu olmayacaktır.",
  },
  { text: "Ancak;", kind: "heading" },
  {
    text: "Mevsimlik çalışmada iş ilişkisinin belirli süreli sözleşmelere konu olması, mevsimlik çalışmalarda çalışan işçilerin tamamının belirli süreli sözleşme ile çalıştığı anlamına gelmemektedir. Bazı iş kolları ve işyerlerinde, işverenler her mevsim çalıştırmak istediği çalışanlarla iş ilişkisinin başından itibaren belirsiz süreli sözleşme yapmayı tercih edebilmektedir veyahut da kimi zaman sözleşmeler sonradan belirsiz süreli iş ilişkisine dönmektedir.",
  },
  {
    text: "Eğer işveren işin başında belirsiz süreli iş sözleşmesi yapmayı tercih ettiyse mevsim (sezon) sonunda iş sözleşmesi askıya alınmış olur. Çalışan bir sonraki sezon tekrar işe başladığında sözleşme kaldığı yerden devam eder.",
  },
  {
    text: "İş sözleşmesi belirli süreli yapılır ve çalışan takip eden yıl veya yıllarda tekrar işe başlatılırsa, iş sözleşmesinin baştan belirsiz süreli olup olmadığına bakılmaksızın, belirsiz süreli kabul edilir.",
  },
  { text: "Bu izahatlar ışığında; belirsiz süreli hale gelen mevsimlik iş sözleşmelerinde;", kind: "heading" },
  {
    text: "İhbar süresinin veya ihbar tazminatının belirlenmesinde de fiilen çalışılan süreler hesaplanmak suretiyle; örneğin devam eden iki sezon 6 ay çalışan mevsimlik işçi diğer mevsim başında işe başlatılmazsa, ihbar süresi 6+6 toplam bir yıla göre hesaplanarak ihbar tazminatı dört haftalık ücreti kadar hesaplanabilir.",
  },
  { text: "Süreli fesih", kind: "heading" },
  {
    text: "Madde 17 - Belirsiz süreli iş sözleşmelerinin feshinden önce durumun diğer tarafa bildirilmesi gerekir.",
  },
  { text: "İş sözleşmeleri;", kind: "heading" },
  {
    text: "a) İşi altı aydan az sürmüş olan işçi için, bildirimin diğer tarafa yapılmasından başlayarak iki hafta sonra",
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
  { text: "feshedilmiş sayılır.", kind: "li" },
  { text: "Bu süreler asgari olup sözleşmeler ile artırılabilir." },
  { text: "Bildirim şartına uymayan taraf, bildirim süresine ilişkin ücret tutarında tazminat ödemek zorundadır." },
  { text: "İşveren bildirim süresine ait ücreti peşin vermek suretiyle iş sözleşmesini feshedebilir." },
];
