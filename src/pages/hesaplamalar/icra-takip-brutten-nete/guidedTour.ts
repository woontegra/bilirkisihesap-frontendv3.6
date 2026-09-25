import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { datesReadyCountIn, wageReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";
import type { IcraVariant } from "./model";

/** Variant → persistence tourId (`bh.guidedTour.<id>`). */
export const ICRA_TOUR_IDS: Record<IcraVariant, string> = {
  damga: "icra-damga-vergisi",
  "gelir-damga": "icra-gelir-damga",
  "istisnali-full": "icra-istisnali-full",
  "istisnasiz-full": "icra-istisnasiz-full",
};

const WELCOME: Record<
  IcraVariant,
  { title: string; body: string }
> = {
  damga: {
    title: "İlk damga vergisi kesintili icra hesabınızı birlikte yapalım mı?",
    body: "Brüt tutarı ve faiz bilgilerini girerek net anapara ile takip toplamını kısa adımlarla tamamlayın.",
  },
  "gelir-damga": {
    title: "İlk gelir ve damga vergisi kesintili icra hesabınızı birlikte yapalım mı?",
    body: "Brüt tutar, vergi yılı ve faiz bilgilerini girerek icra takip hesabınızı kısa adımlarla tamamlayın.",
  },
  "istisnali-full": {
    title: "İlk istisnalı full kesintili icra hesabınızı birlikte yapalım mı?",
    body: "Brüt ücret, vergi yılı ve faiz bilgilerini girerek icra takip hesabınızı kısa adımlarla tamamlayın.",
  },
  "istisnasiz-full": {
    title: "İlk istisnasız full kesintili icra hesabınızı birlikte yapalım mı?",
    body: "Brüt tutar, vergi yılı ve faiz bilgilerini girerek icra takip hesabınızı kısa adımlarla tamamlayın.",
  },
};

function icraWageReady(): boolean {
  return wageReadyIn(findTourTarget("icra-ucret"));
}

function icraFaizReady(): boolean {
  return datesReadyCountIn(findTourTarget("icra-faiz"), 2);
}

/**
 * İcra Takip Brütten Nete — ortak adımlar, variant’a göre tourId ve koşullu yıl/dönem.
 * Ortak DOM hedefleri: icra-ucret | icra-donem | icra-faiz | icra-kaydet-actions
 */
export function createIcraGuidedTour(variant: IcraVariant): GuidedTourDefinition {
  const showYearPeriod = variant !== "damga";

  return {
    id: ICRA_TOUR_IDS[variant],
    version: 1,
    steps: [
      {
        id: "ucret",
        target: "icra-ucret",
        title: "Brüt tutar",
        body: "İcra takibine konu brüt alacak tutarını girin. Program seçilen kesinti kurallarına göre net anaparayı otomatik hesaplar.",
        mode: "manual",
        skippable: false,
        placement: "bottom",
        autoAdvance: { isReady: icraWageReady, delayMs: 800 },
        advanceBlockedHint: "Devam etmek için sıfırdan büyük geçerli bir brüt tutar girin.",
      },
      ...(showYearPeriod
        ? [
            {
              id: "donem",
              target: "icra-donem",
              title: "Gelir vergisi yılı",
              body: "Gelir vergisi dilimleri için yılı seçin. Çift asgari ücret dönemli yıllarda Oca–Haz veya Tem–Ara dönemini de belirleyebilirsiniz. Varsayılan yılı kullanabilirsiniz.",
              mode: "optional" as const,
              optionalSkipLabel: "Varsayılan yılı kullan",
              optionalConfirmLabel: "Yıl ve dönemi tamamladım",
              placement: "bottom" as const,
            },
          ]
        : []),
      {
        id: "faiz",
        target: "icra-faiz",
        title: "Faiz bilgileri",
        body: "Faiz başlangıç ve icra takip tarihlerini girin. İsterseniz faiz türünü yasal faiz veya en yüksek mevduat faizi olarak değiştirin.",
        mode: "manual",
        skippable: false,
        placement: "top",
        autoAdvance: { isReady: icraFaizReady, delayMs: 500 },
        advanceBlockedHint:
          "Devam etmek için faiz başlangıç ve icra takip tarihlerini geçerli ve sıralı girin.",
      },
      {
        id: "onizle-kaydet",
        target: "icra-kaydet-actions",
        title: "Önizleyin ve kaydedin",
        body: "Hesap sonucunu görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
        mode: "finish",
        placement: "top",
        scroll: "none",
      },
    ],
  };
}

export function icraWelcomeCopy(variant: IcraVariant): { title: string; body: string } {
  return WELCOME[variant];
}
