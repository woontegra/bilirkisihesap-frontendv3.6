import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { datesReadyIn, wageReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function ihbarDatesReady(): boolean {
  return datesReadyIn(findTourTarget("ihbar-tarihler"));
}

function ihbarWageReady(): boolean {
  return wageReadyIn(findTourTarget("ihbar-brut"));
}

/**
 * İhbar Tazminatı — 4 adımlı kılavuz.
 * Persistence `tourId` sayfa bazında ayrıdır (kıdem anahtarlarıyla çakışmaz).
 * Sonuç paneli (otomatik hesap) adım olarak gösterilmez.
 */
export function createIhbarGuidedTour(tourId: string): GuidedTourDefinition {
  return {
    id: tourId,
    version: 2,
    steps: [
      {
        id: "tarihler",
        target: "ihbar-tarihler",
        title: "Çalışma dönemi",
        body: "Çalışanın işe giriş ve işten çıkış tarihlerini girin. Program çalışma süresini hesaplayarak uygulanacak ihbar önelini otomatik belirler.",
        mode: "manual",
        skippable: true,
        placement: "bottom",
        autoAdvance: { isReady: ihbarDatesReady, delayMs: 500 },
      },
      {
        id: "brut",
        target: "ihbar-brut",
        title: "Brüt ücret",
        body: "İhbar tazminatı hesabına esas son brüt ücreti girin. Program günlük ücreti ve çalışma süresine karşılık gelen ihbar süresini otomatik hesaplar.",
        mode: "manual",
        skippable: true,
        placement: "bottom",
        // Kıdem ile aynı wageReadyIn; yazarken debounce (800ms) erken geçişi önler.
        autoAdvance: { isReady: ihbarWageReady, delayMs: 800 },
      },
      {
        id: "ekstra",
        target: "ihbar-ekstra",
        title: "Ek ödemeler — isteğe bağlı",
        body: "Düzenli prim, ikramiye, yemek ve yol yardımlarını ekleyebilirsiniz. Ek ödeme yoksa doğrudan devam edin.",
        mode: "optional",
        placement: "top",
      },
      {
        id: "onizle-kaydet",
        target: "ihbar-kaydet-actions",
        title: "Önizleyin ve kaydedin",
        body: "Hesap cetvelini görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
        mode: "finish",
        placement: "top",
        scroll: "none",
      },
    ],
  };
}

export const IHBAR_TOUR_WELCOME_TITLE = "İlk ihbar tazminatı hesabınızı birlikte yapalım mı?";
export const IHBAR_TOUR_WELCOME_BODY =
  "Kısa adımlarla ihbar tazminatı hesabınızı tamamlayın; çalışma süresine göre ihbar önelini ve hesaplanan tutarı birlikte görelim.";
