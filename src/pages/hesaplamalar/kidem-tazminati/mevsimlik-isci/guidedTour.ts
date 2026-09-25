import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { wageReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function wageReady(): boolean {
  return wageReadyIn(findTourTarget("mevsimlik-ciplak-brut"));
}

/**
 * Mevsimlik İşçi Kıdem — dönemler kullanıcı onayı ister (çoklu satır).
 * Ücret otomatik; ek ödemeler isteğe bağlı.
 */
export const KIDEM_MEVSIMLIK_TOUR: GuidedTourDefinition = {
  id: "kidem-mevsimlik",
  version: 1,
  steps: [
    {
      id: "donemler",
      target: "mevsimlik-donemler",
      title: "Çalışma dönemleri",
      body: "Mevsimlik çalışma dönemlerinin başlangıç ve bitiş tarihlerini girin. Birden fazla dönem ekleyebilirsiniz; toplam günler 360’lık payda ile kıdeme yansır.",
      mode: "optional",
      placement: "bottom",
      optionalHideSkip: true,
      optionalConfirmLabel: "Dönemleri tamamladım",
    },
    {
      id: "brut",
      target: "mevsimlik-ciplak-brut",
      title: "Brüt ücret",
      body: "Hesaba esas son aylık brüt ücreti girin. Kıdem tavanı gerekiyorsa otomatik uygulanır.",
      mode: "auto",
      placement: "bottom",
      autoAdvance: { isReady: wageReady, delayMs: 500 },
    },
    {
      id: "ekstra",
      target: "mevsimlik-ekstra",
      title: "Ek ödemeler — isteğe bağlı",
      body: "Prim, ikramiye, yemek, yol veya diğer ödemeleri ekleyebilirsiniz. Ek ödeme yoksa doğrudan devam edin.",
      mode: "optional",
      placement: "top",
    },
    {
      id: "onizle-kaydet",
      target: "mevsimlik-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap cetvelini görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};
