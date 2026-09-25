import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { wageReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function bostaWageReady(): boolean {
  return wageReadyIn(findTourTarget("bosta-gecen-sure-ucret"));
}

/** Tarih alanı yok; zorunlu giriş yalnızca çıplak brüt. */
export const BOSTA_GECEN_SURE_TOUR: GuidedTourDefinition = {
  id: "bosta-gecen-sure",
  version: 1,
  steps: [
    {
      id: "ucret",
      target: "bosta-gecen-sure-ucret",
      title: "Ücret bilgisi",
      body: "Aylık çıplak brüt ücreti girin. Program boşta geçen süre ücretini bu brüt üzerinden hesaplar.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: bostaWageReady, delayMs: 800 },
      advanceBlockedHint: "Devam etmek için sıfırdan büyük geçerli bir brüt ücret girin.",
    },
    {
      id: "kalemler",
      target: "bosta-gecen-sure-kalemler",
      title: "Ek ücret kalemleri — isteğe bağlı",
      body: "Prim, ikramiye, yemek veya ek kalem varsa buraya yazın. Yoksa doğrudan devam edin.",
      mode: "optional",
      optionalSkipLabel: "Ek kalem yok",
      optionalConfirmLabel: "Kalemleri tamamladım",
      placement: "bottom",
    },
    {
      id: "onizle-kaydet",
      target: "bosta-gecen-sure-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap sonucunu görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};

export const BOSTA_GECEN_SURE_TOUR_WELCOME_TITLE =
  "İlk boşta geçen süre ücreti hesabınızı birlikte yapalım mı?";
export const BOSTA_GECEN_SURE_TOUR_WELCOME_BODY =
  "Brüt ücreti girerek boşta geçen süre ücreti hesabınızı kısa adımlarla tamamlayın.";
