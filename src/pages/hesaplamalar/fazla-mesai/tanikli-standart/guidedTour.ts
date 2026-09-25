import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { datesReadyIn, isValidDatePair, timesReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function fmTanikliDatesReady(): boolean {
  return datesReadyIn(findTourTarget("fm-tanikli-standart-donem"));
}

function fmTanikliTimesReady(): boolean {
  return timesReadyIn(findTourTarget("fm-tanikli-standart-davaci-saatleri"));
}

/**
 * Sayfa motoru ile aynı tanık geçerliliği (engine `buildWitnessSegmentsForForm` filtresi):
 * geçerli ISO tarih çifti + dolu giriş/çıkış saati + bitiş >= başlangıç.
 * En az bir tanık kartı bu koşulları sağlamalı.
 */
function fmTanikliWitnessesReady(): boolean {
  const root = findTourTarget("fm-tanikli-standart-taniklar");
  if (!root) return false;
  const cards = root.querySelectorAll<HTMLElement>("[class*='witnessCard']");
  for (const card of cards) {
    const dates = card.querySelectorAll<HTMLInputElement>('input[type="date"]');
    const times = card.querySelectorAll<HTMLInputElement>('input[type="time"]');
    if (dates.length < 2 || times.length < 2) continue;
    const dateIn = (dates[0]?.value ?? "").trim();
    const dateOut = (dates[1]?.value ?? "").trim();
    const tin = (times[0]?.value ?? "").trim();
    const tout = (times[1]?.value ?? "").trim();
    if (isValidDatePair(dateIn, dateOut) && tin !== "" && tout !== "") return true;
  }
  return false;
}

/**
 * Tanıklı Standart Fazla Mesai — 5 adımlı kılavuz.
 * Persistence: `bh.guidedTour.fm-tanikli-standart` (Standart/Kıdem/İhbar ile çakışmaz).
 * Dönem, saat ve tanık zorunlu (Atla yok); düşüm/ayarlar isteğe bağlı; cetvel adım değil.
 */
export const FM_TANIKLI_STANDART_TOUR: GuidedTourDefinition = {
  id: "fm-tanikli-standart",
  version: 4,
  steps: [
    {
      id: "donem",
      target: "fm-tanikli-standart-donem",
      title: "Çalışma dönemi",
      body: "Davacının işe giriş ve işten çıkış tarihlerini girin. Program hesaplama dönemini bu tarihlere göre oluşturur.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: fmTanikliDatesReady, delayMs: 500 },
      advanceBlockedHint: "Devam etmek için davacının işe giriş ve işten çıkış tarihlerini tamamlayın.",
    },
    {
      id: "davaci-saatleri",
      target: "fm-tanikli-standart-davaci-saatleri",
      title: "Davacının çalışma saatleri",
      body: "Davacının günlük işe başlama ve işten ayrılma saatlerini girin. Program davacının bildirdiği haftalık fazla mesai süresini otomatik hesaplar.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: fmTanikliTimesReady, delayMs: 800 },
      advanceBlockedHint: "Devam etmek için davacının giriş ve çıkış saatlerini tamamlayın.",
    },
    {
      id: "taniklar",
      target: "fm-tanikli-standart-taniklar",
      title: "Tanık beyanları",
      body: "Tanığın adını, davacıyla birlikte çalıştığı dönemi ve bildirdiği çalışma saatlerini girin. Bu hesaplama için en az bir geçerli tanık beyanı gereklidir. Birden fazla tanık ekleyebilirsiniz.",
      mode: "optional",
      optionalHideSkip: true,
      optionalConfirmLabel: "Tanıkları tamamladım",
      optionalConfirmReady: fmTanikliWitnessesReady,
      optionalConfirmBlockedHint:
        "Devam etmek için en az bir tanığın çalışma dönemi ve saat bilgilerini tamamlayın.",
      placement: "top",
    },
    {
      id: "ayarlar",
      target: "fm-tanikli-standart-ayarlar",
      title: "Düşüm ve ayarlar — isteğe bağlı",
      body: "Yıllık izin, çalışılmayan dönem, UBGT, katsayı ve zamanaşımı gibi özel durumlar varsa buradan ekleyebilirsiniz. Yoksa doğrudan devam edin.",
      mode: "optional",
      optionalSkipLabel: "Özel durum yok",
      optionalConfirmLabel: "Ayarları tamamladım",
      placement: "top",
    },
    {
      id: "onizle-kaydet",
      target: "fm-tanikli-standart-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap cetvelini görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};

export const FM_TANIKLI_STANDART_TOUR_WELCOME_TITLE =
  "İlk tanıklı fazla mesai hesabınızı birlikte yapalım mı?";
export const FM_TANIKLI_STANDART_TOUR_WELCOME_BODY =
  "Davacının çalışma bilgilerini ve varsa tanık beyanlarını girerek fazla mesai hesabınızı kısa adımlarla tamamlayın.";
