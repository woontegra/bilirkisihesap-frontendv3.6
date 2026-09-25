import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { wageReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function wageReady(): boolean {
  return wageReadyIn(findTourTarget("kismi-ciplak-brut"));
}

/**
 * Kısmi Süreli / Part Time Kıdem — dönemler kullanıcı onayı ister.
 * Ücret otomatik; ek ödemeler isteğe bağlı.
 */
export const KIDEM_KISMI_TOUR: GuidedTourDefinition = {
  id: "kidem-kismi-sureli",
  version: 1,
  steps: [
    {
      id: "donemler",
      target: "kismi-donemler",
      title: "Çalışma dönemleri",
      body: "Kısmi süreli çalışma dönemlerinin başlangıç ve bitiş tarihlerini girin. Gerekirse toplam gün veya çıkış tarihi geçersiz kılmayı bu bölümde tamamlayın.",
      mode: "optional",
      placement: "bottom",
      optionalHideSkip: true,
      optionalConfirmLabel: "Dönemleri tamamladım",
    },
    {
      id: "brut",
      target: "kismi-ciplak-brut",
      title: "Brüt ücret",
      body: "Hesaba esas son aylık brüt ücreti girin. Süre 360 günlük sisteme göre hesaplanır; tavan gerekiyorsa otomatik uygulanır.",
      mode: "auto",
      placement: "bottom",
      autoAdvance: { isReady: wageReady, delayMs: 500 },
    },
    {
      id: "ekstra",
      target: "kismi-ekstra",
      title: "Ek ödemeler — isteğe bağlı",
      body: "Prim, ikramiye, yemek, yol veya diğer ödemeleri ekleyebilirsiniz. Ek ödeme yoksa doğrudan devam edin.",
      mode: "optional",
      placement: "top",
    },
    {
      id: "onizle-kaydet",
      target: "kismi-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap cetvelini görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};
