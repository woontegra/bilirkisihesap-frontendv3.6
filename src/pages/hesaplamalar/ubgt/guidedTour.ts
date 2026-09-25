import type { GuidedTourDefinition, GuidedTourStep } from "@/components/guided-tour/types";
import { periodRowsReadyIn } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

export type UbgtTourVariant = "standart" | "bilirkisi";

type VariantMeta = {
  tourId: string;
  prefix: string;
  welcomeTitle: string;
  welcomeBody: string;
};

const META: Record<UbgtTourVariant, VariantMeta> = {
  standart: {
    tourId: "ubgt-alacagi",
    prefix: "ubgt-alacagi",
    welcomeTitle: "İlk standart UBGT hesabınızı birlikte yapalım mı?",
    welcomeBody:
      "Çalışma dönemlerini ve tatilleri seçerek UBGT alacağı hesabınızı kısa adımlarla tamamlayın.",
  },
  bilirkisi: {
    tourId: "ubgt-bilirkisi",
    prefix: "ubgt-bilirkisi",
    welcomeTitle: "İlk bilirkişi UBGT hesabınızı birlikte yapalım mı?",
    welcomeBody:
      "Davacı dönemini ve tanık beyanlarını girerek bilirkişi UBGT hesabınızı kısa adımlarla tamamlayın.",
  },
};

function periodsReady(target: string): boolean {
  return periodRowsReadyIn(findTourTarget(target));
}

/** En az bir tanık satırında geçerli tarih çifti. */
function bilirkisiTanikReady(): boolean {
  return periodRowsReadyIn(findTourTarget("ubgt-bilirkisi-taniklar"));
}

/**
 * UBGT — ortak shell + mode’a göre adımlar.
 * Cetvel / gün listesi / brütten nete / mahsup sonucu / notlar adım değil.
 * Ücret asgari tablodan gelir → ayrı ücret adımı yok.
 */
export function createUbgtGuidedTour(variant: UbgtTourVariant): GuidedTourDefinition {
  const meta = META[variant];
  const p = meta.prefix;
  const steps: GuidedTourStep[] = [];

  if (variant === "standart") {
    steps.push(
      {
        id: "donem",
        target: `${p}-donem`,
        title: "Çalışma dönemleri",
        body: "UBGT hesabına alınacak çalışma dönemlerini başlangıç ve bitiş tarihleriyle ekleyin.",
        mode: "optional",
        optionalHideSkip: true,
        optionalConfirmLabel: "Dönemleri tamamladım",
        optionalConfirmReady: () => periodsReady(`${p}-donem`),
        optionalConfirmBlockedHint: "Devam etmek için en az bir geçerli çalışma dönemi girin.",
        placement: "bottom",
      },
      {
        id: "tatiller",
        target: `${p}-tatiller`,
        title: "Tatil seçimi — isteğe bağlı",
        body: "Hesaba dahil edilecek resmi tatilleri işaretleyin. Gerekirse belirli hafta günlerine denk gelen tatilleri dışlayabilirsiniz. Seçim yoksa geçebilirsiniz.",
        mode: "optional",
        optionalSkipLabel: "Tatil seçmedim",
        optionalConfirmLabel: "Seçimi tamamladım",
        placement: "bottom",
      },
      {
        id: "dislamalar",
        target: `${p}-dislamalar`,
        title: "Dışlanacak günler — isteğe bağlı",
        body: "Yıllık izin veya raporlu günler varsa buraya ekleyebilirsiniz. Yoksa doğrudan devam edin.",
        mode: "optional",
        optionalSkipLabel: "Dışlama yok",
        optionalConfirmLabel: "Dışlamaları tamamladım",
        placement: "top",
      },
      {
        id: "ayarlar",
        target: `${p}-ayarlar`,
        title: "Diğer ayarlar — isteğe bağlı",
        body: "Gerekirse zamanaşımı itirazı veya katsayı uygulayın. Değişiklik yoksa devam edin.",
        mode: "optional",
        optionalSkipLabel: "Değişiklik yok",
        optionalConfirmLabel: "Ayarları tamamladım",
        placement: "top",
      },
    );
  } else {
    steps.push(
      {
        id: "davaci",
        target: `${p}-davaci`,
        title: "Davacı çalışma dönemi",
        body: "Davacının işe giriş ve işten çıkış tarihlerini girin. Gerekirse bu dönem için davacı tatillerini işaretleyin. Tanık tarihleri bu aralığa göre kısıtlanır.",
        mode: "optional",
        optionalHideSkip: true,
        optionalConfirmLabel: "Dönemi tamamladım",
        optionalConfirmReady: () => periodsReady(`${p}-davaci`),
        optionalConfirmBlockedHint: "Devam etmek için en az bir geçerli davacı dönemi girin.",
        placement: "bottom",
      },
      {
        id: "taniklar",
        target: `${p}-taniklar`,
        title: "Tanık beyanları",
        body: "Her tanık için çalışıldığı iddia edilen dönemi girin. Gerekirse davacının seçtiği tatiller içinden kanıtlanan tatilleri işaretleyin. Hesaplama için en az bir geçerli tanık dönemi gerekir.",
        mode: "optional",
        optionalHideSkip: true,
        optionalConfirmLabel: "Tanıkları tamamladım",
        optionalConfirmReady: bilirkisiTanikReady,
        optionalConfirmBlockedHint:
          "Devam etmek için en az bir tanığın başlangıç ve bitiş tarihlerini tamamlayın.",
        placement: "top",
      },
      {
        id: "dislamalar",
        target: `${p}-dislamalar`,
        title: "Dışlamalar — isteğe bağlı",
        body: "Hafta günü dışlama, yıllık izin veya raporlu günler varsa buradan ekleyebilirsiniz. Yoksa doğrudan devam edin.",
        mode: "optional",
        optionalSkipLabel: "Dışlama yok",
        optionalConfirmLabel: "Dışlamaları tamamladım",
        placement: "top",
      },
      {
        id: "ayarlar",
        target: `${p}-ayarlar`,
        title: "Diğer ayarlar — isteğe bağlı",
        body: "Gerekirse zamanaşımı itirazı veya katsayı uygulayın. Değişiklik yoksa devam edin.",
        mode: "optional",
        optionalSkipLabel: "Değişiklik yok",
        optionalConfirmLabel: "Ayarları tamamladım",
        placement: "top",
      },
    );
  }

  steps.push({
    id: "onizle-kaydet",
    target: `${p}-kaydet-actions`,
    title: "Önizleyin ve kaydedin",
    body: "Hesap sonucunu görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
    mode: "finish",
    placement: "top",
    scroll: "none",
  });

  return {
    id: meta.tourId,
    version: 1,
    steps,
  };
}

export function getUbgtTourWelcome(variant: UbgtTourVariant): { title: string; body: string } {
  const meta = META[variant];
  return { title: meta.welcomeTitle, body: meta.welcomeBody };
}
