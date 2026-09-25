import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { datesReadyIn, wageReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function kotuNiyetDatesReady(): boolean {
  return datesReadyIn(findTourTarget("kotu-niyet-donem"));
}

function kotuNiyetWageReady(): boolean {
  return wageReadyIn(findTourTarget("kotu-niyet-ucret"));
}

export const KOTU_NIYET_TOUR: GuidedTourDefinition = {
  id: "kotu-niyet",
  version: 1,
  steps: [
    {
      id: "donem",
      target: "kotu-niyet-donem",
      title: "Çalışma / fesih dönemi",
      body: "İşe giriş ve işten çıkış tarihlerini girin. Program çalışma süresini ve ihbar haftasını buna göre belirler.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: kotuNiyetDatesReady, delayMs: 500 },
      advanceBlockedHint: "Devam etmek için işe giriş ve işten çıkış tarihlerini tamamlayın.",
    },
    {
      id: "ucret",
      target: "kotu-niyet-ucret",
      title: "Brüt ücret",
      body: "Kötü niyet tazminatına esas çıplak brüt ücreti girin.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: kotuNiyetWageReady, delayMs: 800 },
      advanceBlockedHint: "Devam etmek için sıfırdan büyük geçerli bir brüt ücret girin.",
    },
    {
      id: "kalemler",
      target: "kotu-niyet-kalemler",
      title: "Ek ödemeler — isteğe bağlı",
      body: "Prim, ikramiye, yol, yemek veya ek kalem varsa buraya yazın. Yoksa doğrudan devam edin.",
      mode: "optional",
      optionalSkipLabel: "Ek ödeme yok",
      optionalConfirmLabel: "Kalemleri tamamladım",
      placement: "bottom",
    },
    {
      id: "onizle-kaydet",
      target: "kotu-niyet-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap sonucunu görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};

export const KOTU_NIYET_TOUR_WELCOME_TITLE =
  "İlk kötü niyet tazminatı hesabınızı birlikte yapalım mı?";
export const KOTU_NIYET_TOUR_WELCOME_BODY =
  "Tarihleri ve brüt ücreti girerek kötü niyet tazminatı hesabınızı kısa adımlarla tamamlayın.";
