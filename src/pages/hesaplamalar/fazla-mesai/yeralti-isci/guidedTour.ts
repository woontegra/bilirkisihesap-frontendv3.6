import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { datesReadyIn, timesReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function fmYeraltiDatesReady(): boolean {
  return datesReadyIn(findTourTarget("fm-yeralti-donem"));
}

function fmYeraltiTimesReady(): boolean {
  return timesReadyIn(findTourTarget("fm-yeralti-saatler"));
}

/**
 * Yeraltı İşçileri Fazla Mesai — 5 adım.
 * Tanık isteğe bağlı: tanık yoksa motor davacı beyanı stub’ı kullanır
 * (`createDavaciOnlyWitnessStub` / computeClassicPeriods).
 */
export const FM_YERALTI_TOUR: GuidedTourDefinition = {
  id: "fm-yeralti",
  version: 1,
  steps: [
    {
      id: "donem",
      target: "fm-yeralti-donem",
      title: "Çalışma dönemi",
      body: "Davacının işe giriş ve işten çıkış tarihlerini girin. Program hesaplama dönemini bu tarihlere göre oluşturur.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: fmYeraltiDatesReady, delayMs: 500 },
      advanceBlockedHint: "Devam etmek için davacının işe giriş ve işten çıkış tarihlerini tamamlayın.",
    },
    {
      id: "saatler",
      target: "fm-yeralti-saatler",
      title: "Davacının çalışma saatleri",
      body: "Davacının günlük giriş ve çıkış saatlerini girin. Program yeraltı işçileri için haftalık fazla mesai süresini bu saatlere göre hesaplar.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: fmYeraltiTimesReady, delayMs: 800 },
      advanceBlockedHint: "Devam etmek için davacının giriş ve çıkış saatlerini tamamlayın.",
    },
    {
      id: "taniklar",
      target: "fm-yeralti-taniklar",
      title: "Tanık beyanları — isteğe bağlı",
      body: "Tanık varsa adını, birlikte çalıştığı dönemi ve bildirdiği çalışma saatlerini girin. Tanık yoksa hesaplama yalnızca davacı beyanıyla yapılır.",
      mode: "optional",
      optionalSkipLabel: "Tanığım yok",
      optionalConfirmLabel: "Tanıkları tamamladım",
      placement: "top",
    },
    {
      id: "ayarlar",
      target: "fm-yeralti-ayarlar",
      title: "Düşüm ve ayarlar — isteğe bağlı",
      body: "Yıllık izin, UBGT, çalışılmayan dönem, katsayı, 270 saat ve zamanaşımı gibi özel durumlar varsa buradan ekleyebilirsiniz. Yoksa doğrudan devam edin.",
      mode: "optional",
      optionalSkipLabel: "Özel durum yok",
      optionalConfirmLabel: "Ayarları tamamladım",
      placement: "top",
    },
    {
      id: "onizle-kaydet",
      target: "fm-yeralti-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap sonucunu görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};

export const FM_YERALTI_TOUR_WELCOME_TITLE =
  "İlk yeraltı fazla mesai hesabınızı birlikte yapalım mı?";
export const FM_YERALTI_TOUR_WELCOME_BODY =
  "Davacının çalışma dönemi ve saatlerini girerek yeraltı fazla mesai hesabınızı kısa adımlarla tamamlayın.";
