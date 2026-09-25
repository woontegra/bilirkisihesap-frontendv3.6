import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { datesReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function fmVardiya24DatesReady(): boolean {
  return datesReadyIn(findTourTarget("fm-vardiya-24-donem"));
}

/**
 * 24 Saat Vardiya Fazla Mesai — 4 adım.
 * Tanık isteğe bağlı (yalnız tarih); geçerli tanık yoksa motor davacı dönemi kullanır.
 * 270 saat UI yok. Anchor varsayılanı “İlk gün çalıştı” geçerlidir.
 */
export const FM_VARDIYA_24_TOUR: GuidedTourDefinition = {
  id: "fm-vardiya-24",
  version: 1,
  steps: [
    {
      id: "donem",
      target: "fm-vardiya-24-donem",
      title: "Dava dönemi ve vardiya başlangıcı",
      body: "İşe giriş ve işten çıkış tarihlerini girin. Başlangıç vardiya günü varsayılan olarak “İlk gün çalıştı”dır; gerekirse “İlk gün dinlendi” seçin. Program 24 saatlik çalışma–dinlenme düzenini bu bilgilere göre kurar.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: fmVardiya24DatesReady, delayMs: 500 },
      advanceBlockedHint: "Devam etmek için işe giriş ve işten çıkış tarihlerini tamamlayın.",
    },
    {
      id: "taniklar",
      target: "fm-vardiya-24-taniklar",
      title: "Tanık dönemleri — isteğe bağlı",
      body: "Tanık varsa adını ve birlikte çalıştığı tarih aralığını girin (saat istenmez). Tanık yoksa hesaplama yalnızca davacı dönemine göre yapılır.",
      mode: "optional",
      optionalSkipLabel: "Tanığım yok",
      optionalConfirmLabel: "Tanıkları tamamladım",
      placement: "top",
    },
    {
      id: "ayarlar",
      target: "fm-vardiya-24-ayarlar",
      title: "Düşüm ve ayarlar — isteğe bağlı",
      body: "Yıllık izin, UBGT, çalışılmayan dönem, katsayı ve zamanaşımı gibi özel durumlar varsa buradan ekleyebilirsiniz. Yoksa doğrudan devam edin.",
      mode: "optional",
      optionalSkipLabel: "Özel durum yok",
      optionalConfirmLabel: "Ayarları tamamladım",
      placement: "top",
    },
    {
      id: "onizle-kaydet",
      target: "fm-vardiya-24-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap sonucunu görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};

export const FM_VARDIYA_24_TOUR_WELCOME_TITLE =
  "İlk 24 saat vardiya fazla mesai hesabınızı birlikte yapalım mı?";
export const FM_VARDIYA_24_TOUR_WELCOME_BODY =
  "Dava dönemini ve başlangıç vardiya gününü girerek 24 saatlik vardiya hesabınızı kısa adımlarla tamamlayın.";
