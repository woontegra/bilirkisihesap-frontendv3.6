import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { datesReadyIn, wageReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function haksizDatesReady(): boolean {
  return datesReadyIn(findTourTarget("haksiz-fesih-donem"));
}

function haksizWageReady(): boolean {
  return wageReadyIn(findTourTarget("haksiz-fesih-ucret"));
}

export const HAKSIZ_FESIH_TOUR: GuidedTourDefinition = {
  id: "haksiz-fesih",
  version: 1,
  steps: [
    {
      id: "donem",
      target: "haksiz-fesih-donem",
      title: "Çalışma / fesih tarihleri",
      body: "İşe giriş ve işten çıkış tarihlerini girin. Program çalışma süresini otomatik hesaplar.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: haksizDatesReady, delayMs: 500 },
      advanceBlockedHint: "Devam etmek için işe giriş ve işten çıkış tarihlerini tamamlayın.",
    },
    {
      id: "ucret",
      target: "haksiz-fesih-ucret",
      title: "Brüt ücret",
      body: "Haksız fesih tazminatına esas çıplak brüt ücreti girin, ardından Hesapla’ya basın. Program 1–6 aylık katsayı tutarlarını listeler.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: haksizWageReady, delayMs: 800 },
      advanceBlockedHint: "Devam etmek için sıfırdan büyük geçerli bir brüt ücret girin.",
    },
    {
      id: "mahsup",
      target: "haksiz-fesih-mahsup",
      title: "Mahsup — isteğe bağlı",
      body: "İşçiye daha önce ödenen bir tutar varsa buraya yazın; net tazminattan mahsup edilir. Yoksa doğrudan devam edin.",
      mode: "optional",
      optionalSkipLabel: "Mahsup yok",
      optionalConfirmLabel: "Mahsupu tamamladım",
      placement: "top",
    },
    {
      id: "onizle-kaydet",
      target: "haksiz-fesih-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap sonucunu görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};

export const HAKSIZ_FESIH_TOUR_WELCOME_TITLE =
  "İlk haksız fesih tazminatı hesabınızı birlikte yapalım mı?";
export const HAKSIZ_FESIH_TOUR_WELCOME_BODY =
  "Tarihleri ve brüt ücreti girerek haksız fesih tazminatı hesabınızı kısa adımlarla tamamlayın.";
