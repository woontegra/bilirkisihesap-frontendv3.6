import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { parseTourMoney } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

/** En az bir satırda matrah > 0 ve oran > 0 (engine validatePrimForm ile uyumlu). */
export function primKalemlerReady(): boolean {
  const root = findTourTarget("prim-alacagi-kalemler");
  if (!root) return false;
  const rows = root.querySelectorAll<HTMLElement>("[data-tour-prim-row]");
  for (const row of rows) {
    const inputs = row.querySelectorAll<HTMLInputElement>("input:not([readonly])");
    const principal = parseTourMoney(inputs[0]?.value ?? "");
    const percent = parseTourMoney(inputs[1]?.value ?? "");
    if (principal > 0 && percent > 0) return true;
  }
  return false;
}

export const PRIM_ALACAGI_TOUR: GuidedTourDefinition = {
  id: "prim-alacagi",
  version: 1,
  steps: [
    {
      id: "kalemler",
      target: "prim-alacagi-kalemler",
      title: "Prim bilgileri",
      body: "Her satır için prim matrahını (brüt ücret) ve prim oranını (%) girin. İhtiyacınız kadar satır ekleyebilirsiniz.",
      mode: "optional",
      optionalHideSkip: true,
      optionalConfirmLabel: "Primleri tamamladım",
      optionalConfirmReady: primKalemlerReady,
      optionalConfirmBlockedHint:
        "Devam etmek için en az bir satırda geçerli matrah ve prim oranı girin.",
      placement: "bottom",
    },
    {
      id: "onizle-kaydet",
      target: "prim-alacagi-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap sonucunu görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};

export const PRIM_ALACAGI_TOUR_WELCOME_TITLE = "İlk prim alacağı hesabınızı birlikte yapalım mı?";
export const PRIM_ALACAGI_TOUR_WELCOME_BODY =
  "Prim matrahı ve oranlarını girerek prim alacağı hesabınızı kısa adımlarla tamamlayın.";
