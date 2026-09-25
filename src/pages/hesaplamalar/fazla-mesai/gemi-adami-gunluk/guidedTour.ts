import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { datesReadyIn, timesReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function fmGemiGunlukDatesReady(): boolean {
  return datesReadyIn(findTourTarget("fm-gemi-gunluk-donem"));
}

function fmGemiGunlukTimesReady(): boolean {
  return timesReadyIn(findTourTarget("fm-gemi-gunluk-saatler"));
}

/**
 * Gemi Adamı Günlük Fazla Mesai — 5 adım.
 * Tanık isteğe bağlı (tarih+saat); boşsa motor davacı dönemi ve saatlerini kullanır.
 */
export const FM_GEMI_GUNLUK_TOUR: GuidedTourDefinition = {
  id: "fm-gemi-gunluk",
  version: 1,
  steps: [
    {
      id: "donem",
      target: "fm-gemi-gunluk-donem",
      title: "Çalışma dönemi",
      body: "Davacının işe giriş ve işten çıkış tarihlerini girin. Program hesaplama dönemini bu tarihlere göre oluşturur.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: fmGemiGunlukDatesReady, delayMs: 500 },
      advanceBlockedHint: "Devam etmek için davacının işe giriş ve işten çıkış tarihlerini tamamlayın.",
    },
    {
      id: "saatler",
      target: "fm-gemi-gunluk-saatler",
      title: "Davacının günlük çalışma saatleri",
      body: "Davacının günlük giriş ve çıkış saatlerini girin. Program gemi adamı günlük çalışma için fazla mesai süresini bu saatlere göre hesaplar.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: fmGemiGunlukTimesReady, delayMs: 800 },
      advanceBlockedHint: "Devam etmek için davacının giriş ve çıkış saatlerini tamamlayın.",
    },
    {
      id: "taniklar",
      target: "fm-gemi-gunluk-taniklar",
      title: "Tanık beyanları — isteğe bağlı",
      body: "Tanık varsa adını, birlikte çalıştığı dönemi ve bildirdiği giriş/çıkış saatlerini girin. Tanık yoksa hesaplama davacı dönemi ve saatleriyle yapılır.",
      mode: "optional",
      optionalSkipLabel: "Tanığım yok",
      optionalConfirmLabel: "Tanıkları tamamladım",
      placement: "top",
    },
    {
      id: "ayarlar",
      target: "fm-gemi-gunluk-ayarlar",
      title: "Düşüm ve ayarlar — isteğe bağlı",
      body: "Yıllık izin, UBGT, çalışılmayan dönem, katsayı, 270 saat ve zamanaşımı gibi özel durumlar varsa buradan ekleyebilirsiniz. Yoksa doğrudan devam edin.",
      mode: "optional",
      optionalSkipLabel: "Özel durum yok",
      optionalConfirmLabel: "Ayarları tamamladım",
      placement: "top",
    },
    {
      id: "onizle-kaydet",
      target: "fm-gemi-gunluk-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap sonucunu görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};

export const FM_GEMI_GUNLUK_TOUR_WELCOME_TITLE =
  "İlk gemi adamı günlük fazla mesai hesabınızı birlikte yapalım mı?";
export const FM_GEMI_GUNLUK_TOUR_WELCOME_BODY =
  "Davacının çalışma dönemi ve günlük saatlerini girerek gemi adamı fazla mesai hesabınızı kısa adımlarla tamamlayın.";
