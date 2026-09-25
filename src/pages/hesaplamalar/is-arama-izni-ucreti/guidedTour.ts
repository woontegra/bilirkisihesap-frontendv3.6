import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { datesReadyIn, wageReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function isAramaDatesReady(): boolean {
  return datesReadyIn(findTourTarget("is-arama-izni-donem"));
}

function isAramaWageReady(): boolean {
  return wageReadyIn(findTourTarget("is-arama-izni-ucret"));
}

export const IS_ARAMA_IZNI_TOUR: GuidedTourDefinition = {
  id: "is-arama-izni",
  version: 1,
  steps: [
    {
      id: "donem",
      target: "is-arama-izni-donem",
      title: "Çalışma / fesih dönemi",
      body: "İşe giriş ve işten çıkış tarihlerini girin. Program ihbar haftalarını bu dönem üzerinden hesaplar.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: isAramaDatesReady, delayMs: 500 },
      advanceBlockedHint: "Devam etmek için işe giriş ve işten çıkış tarihlerini tamamlayın.",
    },
    {
      id: "ucret",
      target: "is-arama-izni-ucret",
      title: "Brüt ücret ve haftalık çalışma",
      body: "Çıplak brüt ücreti girin. Haftalık çalışma günü varsayılan 5’tir; gerekirse 6 veya 7 olarak değiştirin.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: isAramaWageReady, delayMs: 800 },
      advanceBlockedHint: "Devam etmek için sıfırdan büyük geçerli bir brüt ücret girin.",
    },
    {
      id: "dusumler",
      target: "is-arama-izni-dusumler",
      title: "Düşümler — isteğe bağlı",
      body: "Daha önce kullandırılmış iş arama izni varsa gün veya tarih aralığı olarak buraya ekleyebilirsiniz. Yoksa doğrudan devam edin.",
      mode: "optional",
      optionalSkipLabel: "Düşüm yok",
      optionalConfirmLabel: "Düşümleri tamamladım",
      placement: "bottom",
    },
    {
      id: "onizle-kaydet",
      target: "is-arama-izni-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap sonucunu görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};

export const IS_ARAMA_IZNI_TOUR_WELCOME_TITLE =
  "İlk iş arama izni ücreti hesabınızı birlikte yapalım mı?";
export const IS_ARAMA_IZNI_TOUR_WELCOME_BODY =
  "Tarihleri ve brüt ücreti girerek iş arama izni ücreti hesabınızı kısa adımlarla tamamlayın.";
