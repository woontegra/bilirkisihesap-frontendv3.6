import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { datesReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function ucretAlacagiDatesReady(): boolean {
  return datesReadyIn(findTourTarget("ucret-alacagi-donem"));
}

/** Dönem sonrası otomatik ay satırları oluşmuş mu. */
export function ucretAlacagiKalemlerReady(): boolean {
  const root = findTourTarget("ucret-alacagi-kalemler");
  if (!root) return false;
  return root.querySelectorAll("tbody tr").length > 0;
}

export const UCRET_ALACAGI_TOUR: GuidedTourDefinition = {
  id: "ucret-alacagi",
  version: 1,
  steps: [
    {
      id: "donem",
      target: "ucret-alacagi-donem",
      title: "Hesaplama dönemi",
      body: "Çalışma dönemi başlangıç ve bitiş tarihlerini girin. Program aylık cetveli bu aralıkta otomatik oluşturur.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: ucretAlacagiDatesReady, delayMs: 500 },
      advanceBlockedHint: "Devam etmek için çalışma dönemi başlangıç ve bitiş tarihlerini tamamlayın.",
    },
    {
      id: "hesap-turu",
      target: "ucret-alacagi-hesap-turu",
      title: "Brüt / Net hesaplama",
      body: "Brütten veya Netten hesaplama sekmesini seçin. Varsayılan Brütten Hesaplama’dır; değiştirmek zorunda değilsiniz.",
      mode: "optional",
      optionalSkipLabel: "Değişiklik yok",
      optionalConfirmLabel: "Seçimi tamamladım",
      placement: "bottom",
    },
    {
      id: "kalemler",
      target: "ucret-alacagi-kalemler",
      title: "Ücret alacağı bilgileri",
      body: "Cetvel satırlarında ücret/net ve ödenen tutarları gözden geçirin veya düzenleyin. Asgari ücret satırları dönemden otomatik gelir.",
      mode: "optional",
      optionalHideSkip: true,
      optionalConfirmLabel: "Ücret bilgilerini tamamladım",
      optionalConfirmReady: ucretAlacagiKalemlerReady,
      optionalConfirmBlockedHint: "Devam etmek için önce tarihleri girerek cetvel satırlarının oluşmasını sağlayın.",
      placement: "bottom",
    },
    {
      id: "ayarlar",
      target: "ucret-alacagi-ayarlar",
      title: "Diğer ayarlar — isteğe bağlı",
      body: "Gerekirse Kat Sayı Hesapla ile katsayı uygulayın veya manuel brüt şablonu kullanın. Değişiklik yoksa devam edin.",
      mode: "optional",
      optionalSkipLabel: "Değişiklik yok",
      optionalConfirmLabel: "Ayarları tamamladım",
      placement: "bottom",
    },
    {
      id: "onizle-kaydet",
      target: "ucret-alacagi-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap sonucunu görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};

export const UCRET_ALACAGI_TOUR_WELCOME_TITLE =
  "İlk ücret alacağı hesabınızı birlikte yapalım mı?";
export const UCRET_ALACAGI_TOUR_WELCOME_BODY =
  "Dönemi girip cetveli düzenleyerek ücret alacağı hesabınızı kısa adımlarla tamamlayın.";
