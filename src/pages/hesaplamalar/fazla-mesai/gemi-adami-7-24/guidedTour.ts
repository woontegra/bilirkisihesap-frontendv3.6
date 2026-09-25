import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { datesReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function fmGemi724DatesReady(): boolean {
  return datesReadyIn(findTourTarget("fm-gemi-724-donem"));
}

/**
 * Gemi Adamı 7/24 Fazla Mesai — 4 adım.
 * Davacı saat girişi yok (sabit 35 saat FM). Tanık isteğe bağlı, yalnız tarih.
 */
export const FM_GEMI_724_TOUR: GuidedTourDefinition = {
  id: "fm-gemi-724",
  version: 1,
  steps: [
    {
      id: "donem",
      target: "fm-gemi-724-donem",
      title: "Davacının çalışma dönemi",
      body: "Davacının işe giriş ve işten çıkış tarihlerini girin. Haftalık fazla mesai saati bu hesap türünde sabittir; ayrı saat girişi gerekmez.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: fmGemi724DatesReady, delayMs: 500 },
      advanceBlockedHint: "Devam etmek için davacının işe giriş ve işten çıkış tarihlerini tamamlayın.",
    },
    {
      id: "taniklar",
      target: "fm-gemi-724-taniklar",
      title: "Tanık dönemleri — isteğe bağlı",
      body: "Tanık varsa adını ve birlikte çalıştığı tarih aralığını girin (saat alanı yoktur). Tanık yoksa hesaplama yalnızca davacı dönemi üzerinden yapılır.",
      mode: "optional",
      optionalSkipLabel: "Tanığım yok",
      optionalConfirmLabel: "Tanıkları tamamladım",
      placement: "top",
    },
    {
      id: "ayarlar",
      target: "fm-gemi-724-ayarlar",
      title: "Düşüm ve ayarlar — isteğe bağlı",
      body: "Yıllık izin, UBGT, çalışılmayan dönem, katsayı, 270 saat ve zamanaşımı gibi özel durumlar varsa buradan ekleyebilirsiniz. Yoksa doğrudan devam edin.",
      mode: "optional",
      optionalSkipLabel: "Özel durum yok",
      optionalConfirmLabel: "Ayarları tamamladım",
      placement: "top",
    },
    {
      id: "onizle-kaydet",
      target: "fm-gemi-724-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap sonucunu görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};

export const FM_GEMI_724_TOUR_WELCOME_TITLE =
  "İlk gemi adamı 7/24 fazla mesai hesabınızı birlikte yapalım mı?";
export const FM_GEMI_724_TOUR_WELCOME_BODY =
  "Davacının çalışma dönemini girerek 7/24 tam mürettebat fazla mesai hesabınızı kısa adımlarla tamamlayın.";
