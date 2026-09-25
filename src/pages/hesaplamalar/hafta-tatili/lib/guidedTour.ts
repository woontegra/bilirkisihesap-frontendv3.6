import type { GuidedTourDefinition, GuidedTourStep } from "@/components/guided-tour/types";
import { periodRowsReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

export type HaftaTatiliTourVariant = "standart" | "gemi-adami" | "basin-is";

type SpecialMode = "none" | "seasonal" | "gece";

type VariantMeta = {
  tourId: string;
  welcomeTitle: string;
  welcomeBody: string;
  special: SpecialMode;
};

const META: Record<HaftaTatiliTourVariant, VariantMeta> = {
  standart: {
    tourId: "hafta-tatili-standart",
    welcomeTitle: "İlk standart hafta tatili hesabınızı birlikte yapalım mı?",
    welcomeBody:
      "Çalışma dönemlerini girerek hafta tatili ücreti hesabınızı kısa adımlarla tamamlayın.",
    special: "seasonal",
  },
  "gemi-adami": {
    tourId: "hafta-tatili-gemi-adami",
    welcomeTitle: "İlk gemi adamı hafta tatili hesabınızı birlikte yapalım mı?",
    welcomeBody:
      "Çalışma dönemlerini girerek Deniz İş Kanunu’na göre hafta tatili hesabınızı tamamlayın.",
    special: "none",
  },
  "basin-is": {
    tourId: "hafta-tatili-basin-is",
    welcomeTitle: "İlk basın iş hafta tatili hesabınızı birlikte yapalım mı?",
    welcomeBody:
      "Çalışma dönemlerini girerek Basın İş Kanunu’na göre hafta tatili hesabınızı tamamlayın.",
    special: "gece",
  },
};

function periodsReady(): boolean {
  return periodRowsReadyIn(findTourTarget("hafta-tatili-donem"));
}

function specialStep(special: SpecialMode): GuidedTourStep | null {
  if (special === "seasonal") {
    return {
      id: "ozel",
      target: "hafta-tatili-ozel-bilgiler",
      title: "Hafta tatili kullanım bilgisi — isteğe bağlı",
      body: "Hafta tatilinin kullanıldığı dönem aralığını (gg.aa) ve gün sayısını girebilirsiniz. Kullanım bilgisi yoksa geçebilirsiniz.",
      mode: "optional",
      optionalSkipLabel: "Bilgi girmedim",
      optionalConfirmLabel: "Bilgileri tamamladım",
      placement: "bottom",
    };
  }
  if (special === "gece") {
    return {
      id: "ozel",
      target: "hafta-tatili-ozel-bilgiler",
      title: "Gece çalışanı — isteğe bağlı",
      body: "Görevi sürekli gece çalışmasını gerektiriyorsa işaretleyin; hafta tatili ücreti iki günlük esasa göre hesaplanır. Değilse geçebilirsiniz.",
      mode: "optional",
      optionalSkipLabel: "Değişiklik yok",
      optionalConfirmLabel: "Bilgileri tamamladım",
      placement: "bottom",
    };
  }
  return null;
}

/**
 * Hafta Tatili — ortak shell + variant adımları.
 * Ücret tabloda oluşur → ayrı ücret adımı yok.
 * Cetvel/brütten nete/hakkaniyet sonucu adım değil.
 */
export function createHaftaTatiliGuidedTour(variant: HaftaTatiliTourVariant): GuidedTourDefinition {
  const meta = META[variant];
  const ozel = specialStep(meta.special);

  const steps: GuidedTourStep[] = [
    {
      id: "donem",
      target: "hafta-tatili-donem",
      title: "Çalışma dönemleri",
      body: "Hafta tatili hesabına alınacak çalışma dönemlerini başlangıç ve bitiş tarihleriyle ekleyin.",
      mode: "optional",
      optionalHideSkip: true,
      optionalConfirmLabel: "Dönemleri tamamladım",
      optionalConfirmReady: periodsReady,
      optionalConfirmBlockedHint: "Devam etmek için en az bir geçerli çalışma dönemi girin.",
      placement: "bottom",
    },
    ...(ozel ? [ozel] : []),
    {
      id: "dislamalar",
      target: "hafta-tatili-dislamalar",
      title: "Dışlanacak günler — isteğe bağlı",
      body: "Çalışılmayan veya hesaplamadan düşülmesi gereken günler varsa buraya ekleyebilirsiniz. Yoksa doğrudan devam edin.",
      mode: "optional",
      optionalSkipLabel: "Dışlanacak gün yok",
      optionalConfirmLabel: "Dışlamaları tamamladım",
      placement: "top",
    },
    {
      id: "ayarlar",
      target: "hafta-tatili-ayarlar",
      title: "Diğer ayarlar — isteğe bağlı",
      body: "Zamanaşımı başlangıcı, katsayı veya manuel brüt uygulama gibi özel ayarlar varsa buradan düzenleyebilirsiniz. Yoksa doğrudan devam edin.",
      mode: "optional",
      optionalSkipLabel: "Değişiklik yok",
      optionalConfirmLabel: "Ayarları tamamladım",
      placement: "top",
    },
    {
      id: "onizle-kaydet",
      target: "hafta-tatili-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap sonucunu görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ];

  return { id: meta.tourId, version: 1, steps };
}

export function haftaTatiliWelcomeCopy(variant: HaftaTatiliTourVariant): {
  title: string;
  body: string;
} {
  const meta = META[variant];
  return { title: meta.welcomeTitle, body: meta.welcomeBody };
}
