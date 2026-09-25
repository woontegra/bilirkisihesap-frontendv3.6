import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { datesReadyIn, wageReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function iseBaslatmamaDatesReady(): boolean {
  return datesReadyIn(findTourTarget("ise-baslatmama-donem"));
}

function iseBaslatmamaWageReady(): boolean {
  return wageReadyIn(findTourTarget("ise-baslatmama-ucret"));
}

/**
 * İşe Başlatmama — hesap `useDeferredFormMemo` ile otomatik;
 * “Hesapla” yalnızca draft alanları forma yazar → ayrı kılavuz adımı yok.
 */
export const ISE_BASLATMAMA_TOUR: GuidedTourDefinition = {
  id: "ise-baslatmama",
  version: 1,
  steps: [
    {
      id: "donem",
      target: "ise-baslatmama-donem",
      title: "Hesaplama bilgileri",
      body: "İşe giriş ve işten çıkış tarihlerini girin. Program çalışma süresini otomatik hesaplar.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: iseBaslatmamaDatesReady, delayMs: 500 },
      advanceBlockedHint: "Devam etmek için işe giriş ve işten çıkış tarihlerini tamamlayın.",
    },
    {
      id: "ucret",
      target: "ise-baslatmama-ucret",
      title: "Ücret ve katsayı",
      body: "Çıplak brüt ücreti girin. Program 4–8 aylık katsayı tutarlarını otomatik listeler.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: iseBaslatmamaWageReady, delayMs: 800 },
      advanceBlockedHint: "Devam etmek için sıfırdan büyük geçerli bir brüt ücret girin.",
    },
    {
      id: "onizle-kaydet",
      target: "ise-baslatmama-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap sonucunu görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};

export const ISE_BASLATMAMA_TOUR_WELCOME_TITLE =
  "İlk işe başlatmama tazminatı hesabınızı birlikte yapalım mı?";
export const ISE_BASLATMAMA_TOUR_WELCOME_BODY =
  "Tarihleri ve brüt ücreti girerek işe başlatmama tazminatı hesabınızı kısa adımlarla tamamlayın.";
