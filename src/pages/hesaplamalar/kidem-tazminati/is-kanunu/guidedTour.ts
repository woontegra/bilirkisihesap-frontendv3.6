import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { datesReadyIn, wageReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function datesReady(): boolean {
  return datesReadyIn(findTourTarget("kidem-tarihler"));
}

function wageReady(): boolean {
  return wageReadyIn(findTourTarget("kidem-ciplak-brut"));
}

/**
 * İş Kanununa Göre Kıdem — 4 adımlı kılavuz.
 * 1–2 otomatik geçiş (blur zorunlu değil), 3 isteğe bağlı, 4 sticky Önizleme/Kaydet.
 */
export const KIDEM_IS_KANUNU_TOUR: GuidedTourDefinition = {
  id: "kidem-is-kanunu",
  version: 4,
  steps: [
    {
      id: "tarihler",
      target: "kidem-tarihler",
      title: "Çalışma dönemi",
      body: "Çalışanın işe giriş ve işten çıkış tarihlerini girin. Hizmet süresi ve kıdem tutarı bu tarihlere göre otomatik hesaplanır.",
      mode: "auto",
      placement: "bottom",
      autoAdvance: { isReady: datesReady, delayMs: 500 },
    },
    {
      id: "brut",
      target: "kidem-ciplak-brut",
      title: "Brüt ücret",
      body: "Hesaba esas son aylık brüt ücreti girin. Kıdem tavanı gerekiyorsa otomatik uygulanır.",
      mode: "auto",
      placement: "bottom",
      autoAdvance: { isReady: wageReady, delayMs: 500 },
    },
    {
      id: "ekstra",
      target: "kidem-ekstra",
      title: "Ek ödemeler — isteğe bağlı",
      body: "Düzenli prim, ikramiye, yemek ve yol yardımlarını ekleyebilirsiniz. Ek ödeme yoksa doğrudan devam edin.",
      mode: "optional",
      placement: "top",
    },
    {
      id: "onizle-kaydet",
      target: "kidem-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap cetvelini görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};
