import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { wageReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function davaciWageReady(): boolean {
  return wageReadyIn(findTourTarget("davaci-ucreti-ucret"));
}

export const DAVACI_UCRETI_TOUR: GuidedTourDefinition = {
  id: "davaci-ucreti",
  version: 1,
  steps: [
    {
      id: "donem",
      target: "davaci-ucreti-donem",
      title: "Yıl ve dönem",
      body: "Vergi kurallarının uygulanacağı yılı seçin. Çift asgari ücret dönemli yıllarda Oca–Haz veya Tem–Ara dönemini de belirleyebilirsiniz.",
      mode: "optional",
      optionalSkipLabel: "Varsayılan yılı kullan",
      optionalConfirmLabel: "Yıl ve dönemi tamamladım",
      placement: "bottom",
    },
    {
      id: "ucret",
      target: "davaci-ucreti-ucret",
      title: "Brüt ücret",
      body: "Davacının çıplak brüt ücretini girin. Program seçilen yıla göre vergi çevirilerini otomatik hesaplar.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: davaciWageReady, delayMs: 800 },
      advanceBlockedHint: "Devam etmek için sıfırdan büyük geçerli bir brüt ücret girin.",
    },
    {
      id: "ekstra",
      target: "davaci-ucreti-kalemler",
      title: "Ek ödemeler — isteğe bağlı",
      body: "Prim, ikramiye ve benzeri ek kalemleri ekleyebilirsiniz. Yoksa doğrudan devam edin.",
      mode: "optional",
      optionalSkipLabel: "Ek ödemem yok",
      optionalConfirmLabel: "Ek ödemeleri tamamladım",
      placement: "top",
    },
    {
      id: "onizle-kaydet",
      target: "davaci-ucreti-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap sonucunu görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};

export const DAVACI_UCRETI_TOUR_WELCOME_TITLE = "İlk davacı ücreti hesabınızı birlikte yapalım mı?";
export const DAVACI_UCRETI_TOUR_WELCOME_BODY =
  "Yıl, brüt ücret ve isteğe bağlı ek kalemlerle giydirilmiş brüt hesabınızı kısa adımlarla tamamlayın.";
