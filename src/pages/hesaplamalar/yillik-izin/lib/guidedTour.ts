import type { GuidedTourDefinition, GuidedTourStep } from "@/components/guided-tour/types";
import {
  datesReadyCountIn,
  datesReadyIn,
  periodRowsReadyIn,
  wageReadyIn,
} from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

export type YillikTourVariant =
  | "standart"
  | "borclar"
  | "gemi"
  | "mevsim"
  | "basin"
  | "basin-gunluk-olmayan"
  | "kismi"
  | "belirli";

type PeriodMode = "single" | "work-periods" | "basin" | "basin-gunluk-olmayan";
type SpecialMode = "none" | "age-underground" | "age-only";

type VariantMeta = {
  tourId: string;
  welcomeTitle: string;
  welcomeBody: string;
  periodMode: PeriodMode;
  special: SpecialMode;
};

const META: Record<YillikTourVariant, VariantMeta> = {
  standart: {
    tourId: "yillik-izin-standart",
    welcomeTitle: "İlk standart yıllık izin hesabınızı birlikte yapalım mı?",
    welcomeBody:
      "Çalışma dönemini ve brüt ücreti girerek yıllık ücretli izin hesabınızı kısa adımlarla tamamlayın.",
    periodMode: "single",
    special: "age-underground",
  },
  borclar: {
    tourId: "yillik-izin-borclar",
    welcomeTitle: "İlk Borçlar Kanunu yıllık izin hesabınızı birlikte yapalım mı?",
    welcomeBody:
      "Çalışma dönemini ve brüt ücreti girerek Borçlar Kanunu’na göre yıllık izin hesabınızı tamamlayın.",
    periodMode: "single",
    special: "age-only",
  },
  gemi: {
    tourId: "yillik-izin-gemi",
    welcomeTitle: "İlk gemi adamları yıllık izin hesabınızı birlikte yapalım mı?",
    welcomeBody:
      "Çalışma dönemlerini ve brüt ücreti girerek gemi adamı yıllık izin hesabınızı kısa adımlarla tamamlayın.",
    periodMode: "work-periods",
    special: "none",
  },
  mevsim: {
    tourId: "yillik-izin-mevsim",
    welcomeTitle: "İlk mevsimlik işçi yıllık izin hesabınızı birlikte yapalım mı?",
    welcomeBody:
      "Sezon dönemlerini ve brüt ücreti girerek mevsimlik işçi yıllık izin hesabınızı tamamlayın.",
    periodMode: "work-periods",
    special: "age-underground",
  },
  basin: {
    tourId: "yillik-izin-basin",
    welcomeTitle: "İlk basın (günlük gazete) yıllık izin hesabınızı birlikte yapalım mı?",
    welcomeBody:
      "Mesleğe başlangıç, işe giriş–çıkış tarihlerini ve brüt ücreti girerek yıllık izin hesabınızı tamamlayın.",
    periodMode: "basin",
    special: "none",
  },
  "basin-gunluk-olmayan": {
    tourId: "yillik-izin-basin-gunluk-olmayan",
    welcomeTitle: "İlk basın (günlük olmayan) yıllık izin hesabınızı birlikte yapalım mı?",
    welcomeBody:
      "Mesleğe başlangıç ve işten çıkış tarihlerini ve brüt ücreti girerek yıllık izin hesabınızı tamamlayın.",
    periodMode: "basin-gunluk-olmayan",
    special: "none",
  },
  kismi: {
    tourId: "yillik-izin-kismi",
    welcomeTitle: "İlk kısmi süreli yıllık izin hesabınızı birlikte yapalım mı?",
    welcomeBody:
      "Çalışma dönemlerini ve brüt ücreti girerek kısmi süreli yıllık izin hesabınızı tamamlayın.",
    periodMode: "work-periods",
    special: "age-underground",
  },
  belirli: {
    tourId: "yillik-izin-belirli",
    welcomeTitle: "İlk belirli süreli yıllık izin hesabınızı birlikte yapalım mı?",
    welcomeBody:
      "Çalışma dönemlerini ve brüt ücreti girerek belirli süreli yıllık izin hesabınızı tamamlayın.",
    periodMode: "work-periods",
    special: "age-underground",
  },
};

function yillikDonemReady(mode: PeriodMode): boolean {
  const root = findTourTarget("yillik-donem");
  if (!root) return false;
  if (mode === "work-periods") return periodRowsReadyIn(root);
  if (mode === "basin") return datesReadyCountIn(root, 3);
  if (mode === "basin-gunluk-olmayan") return datesReadyCountIn(root, 2);
  return datesReadyIn(root);
}

function yillikWageReady(): boolean {
  return wageReadyIn(findTourTarget("yillik-ucret"));
}

function periodStep(mode: PeriodMode): GuidedTourStep {
  if (mode === "work-periods") {
    return {
      id: "donem",
      target: "yillik-donem",
      title: "Çalışma dönemleri",
      body: "Çalışma dönemlerini başlangıç ve bitiş tarihleriyle ekleyin. Birden fazla dönem varsa her dönemi ayrı satır olarak girebilirsiniz.",
      mode: "optional",
      optionalHideSkip: true,
      optionalConfirmLabel: "Dönemleri tamamladım",
      optionalConfirmReady: () => yillikDonemReady("work-periods"),
      optionalConfirmBlockedHint: "Devam etmek için en az bir geçerli çalışma dönemi girin.",
      placement: "bottom",
    };
  }

  if (mode === "basin") {
    return {
      id: "donem",
      target: "yillik-donem",
      title: "Çalışma dönemi",
      body: "Mesleğe başlangıç ile işe giriş ve işten çıkış tarihlerini girin. Program işyeri ve meslek kıdemini bu tarihlere göre hesaplar.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: () => yillikDonemReady("basin"), delayMs: 500 },
      advanceBlockedHint:
        "Devam etmek için mesleğe başlangıç, işe giriş ve işten çıkış tarihlerini tamamlayın.",
    };
  }

  if (mode === "basin-gunluk-olmayan") {
    return {
      id: "donem",
      target: "yillik-donem",
      title: "Çalışma dönemi",
      body: "Mesleğe başlangıç ve işten çıkış tarihlerini girin. Program kıdem süresini bu tarihlere göre hesaplar.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: () => yillikDonemReady("basin-gunluk-olmayan"), delayMs: 500 },
      advanceBlockedHint:
        "Devam etmek için mesleğe başlangıç ve işten çıkış tarihlerini tamamlayın.",
    };
  }

  return {
    id: "donem",
    target: "yillik-donem",
    title: "Çalışma dönemi",
    body: "Çalışanın işe giriş ve işten çıkış tarihlerini girin. Program hizmet süresini ve izin hakkını bu tarihlere göre hesaplar.",
    mode: "manual",
    skippable: false,
    placement: "bottom",
    autoAdvance: { isReady: () => yillikDonemReady("single"), delayMs: 500 },
    advanceBlockedHint: "Devam etmek için işe giriş ve işten çıkış tarihlerini tamamlayın.",
  };
}

function specialStep(special: SpecialMode): GuidedTourStep | null {
  if (special === "none") return null;
  if (special === "age-only") {
    return {
      id: "ozel",
      target: "yillik-ozel-bilgiler",
      title: "Yaş durumu — isteğe bağlı",
      body: "18 yaş altı veya 50 yaş üstü ise işaretleyin; izin süresi buna göre artar. Uygun değilse geçebilirsiniz.",
      mode: "optional",
      optionalSkipLabel: "Özel durum yok",
      optionalConfirmLabel: "Bilgileri tamamladım",
      placement: "bottom",
    };
  }
  return {
    id: "ozel",
    target: "yillik-ozel-bilgiler",
    title: "Yaş ve yeraltı durumu — isteğe bağlı",
    body: "18 yaş altı / 50 yaş üstü veya yeraltı işçisi ise ilgili kutuları işaretleyin. Uygun değilse geçebilirsiniz.",
    mode: "optional",
    optionalSkipLabel: "Özel durum yok",
    optionalConfirmLabel: "Bilgileri tamamladım",
    placement: "bottom",
  };
}

/**
 * Yıllık İzin — variant’a göre dinamik adımlar.
 * Ortak DOM: yillik-donem | yillik-ozel-bilgiler | yillik-ucret | yillik-kullanilan-izin | yillik-kaydet-actions
 * Kullanılan izin adımı koşulsuzdur (when/hedef yok diye atlanmaz).
 */
export function createYillikGuidedTour(variant: YillikTourVariant): GuidedTourDefinition {
  const meta = META[variant];
  const ozel = specialStep(meta.special);

  const steps: GuidedTourStep[] = [
    periodStep(meta.periodMode),
    ...(ozel ? [ozel] : []),
    {
      id: "ucret",
      target: "yillik-ucret",
      title: "Brüt ücret",
      body: "İzin ücreti hesabına esas aylık brüt ücreti girin.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: yillikWageReady, delayMs: 800 },
      advanceBlockedHint: "Devam etmek için sıfırdan büyük geçerli bir brüt ücret girin.",
    },
    {
      id: "kullanilan-izin",
      target: "yillik-kullanilan-izin",
      title: "Kullanılan izinleri dışla — isteğe bağlı",
      body: "Çalışanın kullandığı yıllık izinleri hesaplamadan düşmek için buraya ekleyin. Kullanılmış izin yoksa doğrudan devam edebilirsiniz.",
      mode: "optional",
      optionalSkipLabel: "Kullanılmış izin yok",
      optionalConfirmLabel: "İzinleri tamamladım",
      placement: "top",
    },
    {
      id: "onizle-kaydet",
      target: "yillik-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap sonucunu görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ];

  return {
    id: meta.tourId,
    version: 1,
    steps,
  };
}

export function yillikWelcomeCopy(variant: YillikTourVariant): { title: string; body: string } {
  const meta = META[variant];
  return { title: meta.welcomeTitle, body: meta.welcomeBody };
}

export function yillikTourId(variant: YillikTourVariant): string {
  return META[variant].tourId;
}
