import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { datesReadyIn, wageReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function ayrimcilikDatesReady(): boolean {
  return datesReadyIn(findTourTarget("ayrimcilik-donem"));
}

function ayrimcilikWageReady(): boolean {
  return wageReadyIn(findTourTarget("ayrimcilik-ucret"));
}

export const AYRIMCILIK_TOUR: GuidedTourDefinition = {
  id: "ayrimcilik",
  version: 1,
  steps: [
    {
      id: "donem",
      target: "ayrimcilik-donem",
      title: "Çalışma dönemi",
      body: "İşe giriş ve işten çıkış tarihlerini girin. Program çalışma süresini otomatik hesaplar.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: ayrimcilikDatesReady, delayMs: 500 },
      advanceBlockedHint: "Devam etmek için işe giriş ve işten çıkış tarihlerini tamamlayın.",
    },
    {
      id: "ucret",
      target: "ayrimcilik-ucret",
      title: "Brüt ücret",
      body: "Ayrımcılık tazminatına esas çıplak brüt ücreti girin. Program 1–4 aylık katsayı tutarlarını otomatik listeler.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: ayrimcilikWageReady, delayMs: 800 },
      advanceBlockedHint: "Devam etmek için sıfırdan büyük geçerli bir brüt ücret girin.",
    },
    {
      id: "onizle-kaydet",
      target: "ayrimcilik-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap sonucunu görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};

export const AYRIMCILIK_TOUR_WELCOME_TITLE =
  "İlk ayrımcılık tazminatı hesabınızı birlikte yapalım mı?";
export const AYRIMCILIK_TOUR_WELCOME_BODY =
  "Tarihleri ve brüt ücreti girerek ayrımcılık tazminatı hesabınızı kısa adımlarla tamamlayın.";
