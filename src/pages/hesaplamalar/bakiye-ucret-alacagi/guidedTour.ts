import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { wageReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

/** Üç tarih: başlangıç, bitiş, fesih. Yalnızca başlangıç≤bitiş zorunlu (fesih sırası serbest). */
export function bakiyeDatesReady(): boolean {
  const root = findTourTarget("bakiye-ucret-donem");
  if (!root) return false;
  const dates = root.querySelectorAll<HTMLInputElement>('input[type="date"]');
  if (dates.length < 3) return false;
  const values: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const v = (dates[i]?.value ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    values.push(v);
  }
  return values[1]! >= values[0]!;
}

function bakiyeWageReady(): boolean {
  return wageReadyIn(findTourTarget("bakiye-ucret-ucret"));
}

/** Bakiye Hesapla sonrası ay satırları oluşmuş mu (cetvel DOM). */
export function bakiyeHesapReady(): boolean {
  const root = findTourTarget("bakiye-ucret-cetvel");
  if (!root) return false;
  return root.querySelectorAll("tbody tr").length > 0;
}

export const BAKIYE_UCRET_TOUR: GuidedTourDefinition = {
  id: "bakiye-ucret",
  version: 1,
  steps: [
    {
      id: "donem",
      target: "bakiye-ucret-donem",
      title: "Dönem ve fesih tarihleri",
      body: "Çalışma dönemi başlangıç/bitiş ve iş akdinin fesih tarihini girin. Kalan süre bu bilgilere göre hesaplanır.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: bakiyeDatesReady, delayMs: 500 },
      advanceBlockedHint: "Devam etmek için üç tarihi de geçerli şekilde tamamlayın (dönem başlangıcı ≤ bitiş).",
    },
    {
      id: "ucret",
      target: "bakiye-ucret-ucret",
      title: "Ücret bilgisi",
      body: "Çıplak brüt ücreti girin. Aylık toplam, ek kalemlerle birlikte hesaplanır.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: bakiyeWageReady, delayMs: 800 },
      advanceBlockedHint: "Devam etmek için sıfırdan büyük geçerli bir brüt ücret girin.",
    },
    {
      id: "kalemler",
      target: "bakiye-ucret-kalemler",
      title: "Ek ücret kalemleri — isteğe bağlı",
      body: "Prim, ikramiye, yol, yemek veya ek kalem varsa buraya yazın. Yoksa doğrudan devam edin.",
      mode: "optional",
      optionalSkipLabel: "Ek kalem yok",
      optionalConfirmLabel: "Kalemleri tamamladım",
      placement: "bottom",
    },
    {
      id: "hesapla",
      target: "bakiye-ucret-hesapla",
      title: "Bakiye hesabını oluşturun",
      body: "Tarih ve ücret bilgileri hazırsa Bakiye Hesapla’ya basın. Cetvel oluşmadan önizleme ve kayıt açılamaz.",
      mode: "optional",
      optionalHideSkip: true,
      optionalConfirmLabel: "Hesabı oluşturdum",
      optionalConfirmReady: bakiyeHesapReady,
      optionalConfirmBlockedHint: "Devam etmek için önce Bakiye Hesapla’ya basıp cetvelin oluşmasını sağlayın.",
      placement: "top",
    },
    {
      id: "onizle-kaydet",
      target: "bakiye-ucret-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap sonucunu görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};

export const BAKIYE_UCRET_TOUR_WELCOME_TITLE =
  "İlk bakiye ücret alacağı hesabınızı birlikte yapalım mı?";
export const BAKIYE_UCRET_TOUR_WELCOME_BODY =
  "Tarihleri ve brüt ücreti girip Bakiye Hesapla ile cetveli oluşturarak hesabınızı tamamlayın.";
