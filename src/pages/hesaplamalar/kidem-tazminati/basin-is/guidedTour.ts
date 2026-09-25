import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { isValidDatePair, wageReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

/** İşe giriş + işten çıkış zorunlu; mesleğe başlangıç doluysa geçerli ve girişten önce/eşit olmalı. */
function basinDatesReady(): boolean {
  const root = findTourTarget("basin-tarihler");
  if (!root) return false;
  const dates = root.querySelectorAll<HTMLInputElement>('input[type="date"]');
  const meslege = (dates[0]?.value ?? "").trim();
  const start = (dates[1]?.value ?? "").trim();
  const end = (dates[2]?.value ?? "").trim();
  if (!isValidDatePair(start, end)) return false;
  if (meslege) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meslege)) return false;
    if (meslege > start) return false;
  }
  return true;
}

function wageReady(): boolean {
  return wageReadyIn(findTourTarget("basin-ciplak-brut"));
}

/** Basın İş Kıdem — 5 adım (tarihler, ücret, deneme, ek ödemeler, önizleme). */
export const KIDEM_BASIN_TOUR: GuidedTourDefinition = {
  id: "kidem-basin",
  version: 1,
  steps: [
    {
      id: "tarihler",
      target: "basin-tarihler",
      title: "Çalışma dönemi",
      body: "Mesleğe başlangıç (varsa), işe giriş ve işten çıkış tarihlerini girin. Kıdem süresi ve 5 yıllık hak kontrolü bu tarihlere göre hesaplanır.",
      mode: "auto",
      placement: "bottom",
      autoAdvance: { isReady: basinDatesReady, delayMs: 500 },
    },
    {
      id: "brut",
      target: "basin-ciplak-brut",
      title: "Brüt ücret",
      body: "Hesaba esas son aylık brüt ücreti girin. Basın iş kıdeminde gün payı 365’e göre hesaplanır; tavan gerekiyorsa otomatik uygulanır.",
      mode: "auto",
      placement: "bottom",
      autoAdvance: { isReady: wageReady, delayMs: 500 },
    },
    {
      id: "deneme",
      target: "basin-deneme",
      title: "Deneme süresi — isteğe bağlı",
      body: "Varsa deneme süresini gün olarak girin; süre mesleğe başlangıçtan düşülür. Yoksa bu adımı atlayabilirsiniz.",
      mode: "optional",
      placement: "bottom",
      optionalSkipLabel: "Deneme süresi yok",
      optionalConfirmLabel: "Deneme süresini tamamladım",
    },
    {
      id: "ekstra",
      target: "basin-ekstra",
      title: "Ek ödemeler — isteğe bağlı",
      body: "Prim, ikramiye, yemek, yol veya diğer kalemleri ekleyebilirsiniz. Ek ödeme yoksa doğrudan devam edin.",
      mode: "optional",
      placement: "top",
    },
    {
      id: "onizle-kaydet",
      target: "basin-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap cetvelini görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};
