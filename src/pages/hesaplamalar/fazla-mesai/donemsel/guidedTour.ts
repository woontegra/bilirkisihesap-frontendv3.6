import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { datesReadyIn, isValidTimeValue } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function fmDonemselDatesReady(): boolean {
  return datesReadyIn(findTourTarget("fm-donemsel-donem"));
}

/** Yaz ve kış deseninde giriş/çıkış saatleri dolu olmalı (4 time input). */
export function fmDonemselDesenReady(): boolean {
  const root = findTourTarget("fm-donemsel-desen");
  if (!root) return false;
  const times = root.querySelectorAll<HTMLInputElement>('input[type="time"]');
  if (times.length < 4) return false;
  for (let i = 0; i < 4; i += 1) {
    if (!isValidTimeValue((times[i]?.value ?? "").trim())) return false;
  }
  return true;
}

/**
 * Dönemsel Fazla Mesai — 5 adım.
 * Tanık isteğe bağlı: tanık yoksa motor davacı yaz/kış deseniyle hesaplar.
 */
export const FM_DONEMSEL_TOUR: GuidedTourDefinition = {
  id: "fm-donemsel",
  version: 1,
  steps: [
    {
      id: "donem",
      target: "fm-donemsel-donem",
      title: "Çalışma dönemi",
      body: "Davacının işe giriş ve işten çıkış tarihlerini girin. Program hesaplama dönemini bu tarihlere göre oluşturur.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: fmDonemselDatesReady, delayMs: 500 },
      advanceBlockedHint: "Devam etmek için davacının işe giriş ve işten çıkış tarihlerini tamamlayın.",
    },
    {
      id: "desen",
      target: "fm-donemsel-desen",
      title: "Yaz / kış çalışma deseni",
      body: "Yaz ve kış dönemleri için günlük giriş ve çıkış saatlerini girin. Aylar varsayılan olarak ayrılmıştır; gerekirse değiştirebilirsiniz.",
      mode: "optional",
      optionalHideSkip: true,
      optionalConfirmLabel: "Deseni tamamladım",
      optionalConfirmReady: fmDonemselDesenReady,
      optionalConfirmBlockedHint:
        "Devam etmek için yaz ve kış dönemlerinin giriş ve çıkış saatlerini tamamlayın.",
      autoAdvance: { isReady: fmDonemselDesenReady, delayMs: 800 },
      placement: "top",
    },
    {
      id: "taniklar",
      target: "fm-donemsel-taniklar",
      title: "Tanık beyanları — isteğe bağlı",
      body: "Tanık varsa adını, birlikte çalıştığı dönemi ve yaz/kış çalışma saatlerini girin. Tanık yoksa hesaplama yalnızca davacı deseniyle yapılır.",
      mode: "optional",
      optionalSkipLabel: "Tanığım yok",
      optionalConfirmLabel: "Tanıkları tamamladım",
      placement: "top",
    },
    {
      id: "ayarlar",
      target: "fm-donemsel-ayarlar",
      title: "Düşüm ve ayarlar — isteğe bağlı",
      body: "Yıllık izin, UBGT, çalışılmayan dönem, katsayı, 270 saat ve zamanaşımı gibi özel durumlar varsa buradan ekleyebilirsiniz. Yoksa doğrudan devam edin.",
      mode: "optional",
      optionalSkipLabel: "Özel durum yok",
      optionalConfirmLabel: "Ayarları tamamladım",
      placement: "top",
    },
    {
      id: "onizle-kaydet",
      target: "fm-donemsel-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap sonucunu görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};

export const FM_DONEMSEL_TOUR_WELCOME_TITLE =
  "İlk dönemsel fazla mesai hesabınızı birlikte yapalım mı?";
export const FM_DONEMSEL_TOUR_WELCOME_BODY =
  "Çalışma dönemini ve yaz/kış çalışma saatlerini girerek dönemsel fazla mesai hesabınızı kısa adımlarla tamamlayın.";
