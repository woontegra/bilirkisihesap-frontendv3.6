import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { datesReadyIn, timesReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function fmStandartDatesReady(): boolean {
  return datesReadyIn(findTourTarget("fm-standart-donem"));
}

function fmStandartTimesReady(): boolean {
  return timesReadyIn(findTourTarget("fm-standart-saatler"));
}

/**
 * Standart Fazla Mesai — 4 adımlı kılavuz.
 * Persistence: `bh.guidedTour.fm-standart` (Kıdem/İhbar anahtarlarıyla çakışmaz).
 * Dönem ve saat zorunlu (Atla yok); düşüm/ayarlar isteğe bağlı; cetvel adım değil.
 */
export const FM_STANDART_TOUR: GuidedTourDefinition = {
  id: "fm-standart",
  version: 3,
  steps: [
    {
      id: "donem",
      target: "fm-standart-donem",
      title: "Çalışma dönemi",
      body: "İşe giriş ve işten çıkış tarihlerini girin. Haftada çalışılan gün sayısını ve gerekiyorsa hafta tatili gününü düzenleyin.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: fmStandartDatesReady, delayMs: 500 },
      advanceBlockedHint: "Devam etmek için davacının işe giriş ve işten çıkış tarihlerini tamamlayın.",
    },
    {
      id: "saatler",
      target: "fm-standart-saatler",
      title: "Günlük çalışma saatleri",
      body: "Çalışanın günlük işe başlama ve işten ayrılma saatlerini girin. Program haftalık çalışma ile fazla mesai süresini otomatik hesaplar.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: fmStandartTimesReady, delayMs: 800 },
      advanceBlockedHint: "Devam etmek için davacının giriş ve çıkış saatlerini tamamlayın.",
    },
    {
      id: "ayarlar",
      target: "fm-standart-ayarlar",
      title: "Düşüm ve ayarlar — isteğe bağlı",
      body: "Yıllık izin, çalışılmayan dönem, UBGT, katsayı ve zamanaşımı gibi özel durumlar varsa buradan ekleyebilirsiniz. Yoksa doğrudan devam edin.",
      mode: "optional",
      optionalSkipLabel: "Özel durum yok",
      optionalConfirmLabel: "Ayarları tamamladım",
      placement: "top",
    },
    {
      id: "onizle-kaydet",
      target: "fm-standart-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap cetvelini görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};

export const FM_STANDART_TOUR_WELCOME_TITLE = "İlk standart fazla mesai hesabınızı birlikte yapalım mı?";
export const FM_STANDART_TOUR_WELCOME_BODY =
  "Çalışma dönemini ve günlük çalışma saatlerini girerek fazla mesai hesabınızı kısa adımlarla tamamlayın.";
