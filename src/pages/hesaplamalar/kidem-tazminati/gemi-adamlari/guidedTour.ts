import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { datesReadyIn, wageReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function datesReady(): boolean {
  return datesReadyIn(findTourTarget("gemi-tarihler"));
}

function wageReady(): boolean {
  return wageReadyIn(findTourTarget("gemi-ciplak-brut"));
}

/** Gemi Adamları Kıdem — 4 adım (İş Kanunu ile aynı akış, Deniz İş Kanunu metinleri). */
export const KIDEM_GEMI_TOUR: GuidedTourDefinition = {
  id: "kidem-gemi",
  version: 1,
  steps: [
    {
      id: "tarihler",
      target: "gemi-tarihler",
      title: "Çalışma dönemi",
      body: "Gemi adamının işe giriş ve işten çıkış tarihlerini girin. Hizmet süresi ve kıdem tutarı bu tarihlere göre otomatik hesaplanır.",
      mode: "auto",
      placement: "bottom",
      autoAdvance: { isReady: datesReady, delayMs: 500 },
    },
    {
      id: "brut",
      target: "gemi-ciplak-brut",
      title: "Brüt ücret",
      body: "Hesaba esas son aylık brüt ücreti girin. Kıdem tavanı gerekiyorsa otomatik uygulanır.",
      mode: "auto",
      placement: "bottom",
      autoAdvance: { isReady: wageReady, delayMs: 500 },
    },
    {
      id: "ekstra",
      target: "gemi-ekstra",
      title: "Ek ödemeler — isteğe bağlı",
      body: "Prim, ikramiye, yemek, yol veya diğer düzenli ödemeleri ekleyebilirsiniz. Ek ödeme yoksa doğrudan devam edin.",
      mode: "optional",
      placement: "top",
    },
    {
      id: "onizle-kaydet",
      target: "gemi-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap cetvelini görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};
