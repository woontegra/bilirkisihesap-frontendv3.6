import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { datesReadyIn, isValidTimeValue } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function fmHaftalikDatesReady(): boolean {
  return datesReadyIn(findTourTarget("fm-haftalik-karma-donem"));
}

type DayGroupFields = { dayCountRaw: string; dayCount: number; tin: string; tout: string };

function readDayGroupRows(root: Element): DayGroupFields[] {
  const rows = root.querySelectorAll<HTMLElement>("[data-tour-day-group-row]");
  const out: DayGroupFields[] = [];
  for (const row of rows) {
    const num = row.querySelector<HTMLInputElement>('input[type="number"]');
    const times = row.querySelectorAll<HTMLInputElement>('input[type="time"]');
    const dayCountRaw = (num?.value ?? "").trim();
    const dayCount = Number(dayCountRaw);
    const tin = (times[0]?.value ?? "").trim();
    const tout = (times[1]?.value ?? "").trim();
    out.push({ dayCountRaw, dayCount, tin, tout });
  }
  return out;
}

function groupStarted(g: DayGroupFields): boolean {
  return g.dayCountRaw !== "" || g.tin !== "" || g.tout !== "";
}

/** Motor `hasUsableDavaciPattern` ile aynı: dayCount > 0 + dolu giriş/çıkış. */
function groupComplete(g: DayGroupFields): boolean {
  return Number.isFinite(g.dayCount) && g.dayCount > 0 && isValidTimeValue(g.tin) && isValidTimeValue(g.tout);
}

/**
 * Manuel “Çalışma düzenini tamamladım”:
 * en az bir geçerli grup (2. grup boş kalabilir).
 */
function fmHaftalikDesenReady(): boolean {
  const root = findTourTarget("fm-haftalik-karma-desen");
  if (!root) return false;
  return readDayGroupRows(root).some(groupComplete);
}

/**
 * Otomatik ilerleme:
 * - Başlanmış tüm gruplar tamamlanmış olmalı.
 * - Yalnızca 1. grup doluysa otomatik geçme (kullanıcıya 2. grup fırsatı).
 * - 2. (veya sonraki) grupta veri başladıysa, başlananların hepsi bitmeden geçme.
 */
function fmHaftalikDesenReadyForAuto(): boolean {
  const root = findTourTarget("fm-haftalik-karma-desen");
  if (!root) return false;
  const groups = readDayGroupRows(root);
  if (groups.length === 0) return false;

  const startedIdx: number[] = [];
  for (let i = 0; i < groups.length; i += 1) {
    if (groupStarted(groups[i]!)) startedIdx.push(i);
  }
  if (startedIdx.length === 0) return false;

  for (const i of startedIdx) {
    if (!groupComplete(groups[i]!)) return false;
  }

  // Tek başlayan grup yalnızca ilk satırsa → otomatik yok (manuel buton var).
  if (startedIdx.length === 1 && startedIdx[0] === 0) return false;

  return true;
}

/**
 * Haftalık Karma Fazla Mesai — 5 adımlı kılavuz.
 * Persistence: `bh.guidedTour.fm-haftalik-karma`
 *
 * Tanık isteğe bağlı: engine/v3-engine tanık yoksa `buildDavaciOnlyMerged`
 * ile yalnızca davacı deseninden hesap üretir (`witnesses: []` varsayılan).
 */
export const FM_HAFTALIK_KARMA_TOUR: GuidedTourDefinition = {
  id: "fm-haftalik-karma",
  version: 1,
  steps: [
    {
      id: "donem",
      target: "fm-haftalik-karma-donem",
      title: "Hesaplama dönemi",
      body: "Davacının işe giriş ve işten çıkış tarihlerini girin. Program hesaplama dönemlerini bu tarihlere göre oluşturur.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: fmHaftalikDatesReady, delayMs: 500 },
      advanceBlockedHint: "Devam etmek için işe giriş ve işten çıkış tarihlerini tamamlayın.",
    },
    {
      id: "desen",
      target: "fm-haftalik-karma-desen",
      title: "Haftalık çalışma düzeni",
      body: "Farklı saatlerde çalışılan günleri gruplar halinde girin. Her grup için gün sayısını, işe giriş ve işten çıkış saatini belirtin.",
      mode: "optional",
      optionalHideSkip: true,
      optionalConfirmLabel: "Çalışma düzenini tamamladım",
      optionalConfirmReady: fmHaftalikDesenReady,
      optionalConfirmBlockedHint:
        "Devam etmek için en az bir çalışma grubunun gün sayısı ile giriş ve çıkış saatlerini tamamlayın.",
      // İkinci grup da doldurulunca (veya 1. dışındaki başlanan gruplar bitince) otomatik 3/5.
      autoAdvance: { isReady: fmHaftalikDesenReadyForAuto, delayMs: 800 },
      placement: "top",
    },
    {
      id: "taniklar",
      target: "fm-haftalik-karma-taniklar",
      title: "Tanık dönemleri — isteğe bağlı",
      body: "Tanık varsa birlikte çalıştığı dönemi ve bildirdiği haftalık çalışma düzenini ekleyin. Birden fazla tanık girebilirsiniz.",
      mode: "optional",
      optionalSkipLabel: "Tanığım yok",
      optionalConfirmLabel: "Tanıkları tamamladım",
      placement: "top",
    },
    {
      id: "ayarlar",
      target: "fm-haftalik-karma-ayarlar",
      title: "Düşüm ve ayarlar — isteğe bağlı",
      body: "Hafta tatili, yıllık izin, UBGT, çalışılmayan dönem, katsayı, 270 saat ve zamanaşımı gibi özel durumlar varsa buradan düzenleyebilirsiniz. Yoksa doğrudan devam edin.",
      mode: "optional",
      optionalSkipLabel: "Özel durum yok",
      optionalConfirmLabel: "Ayarları tamamladım",
      placement: "top",
    },
    {
      id: "onizle-kaydet",
      target: "fm-haftalik-karma-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap cetvelini görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};

export const FM_HAFTALIK_KARMA_TOUR_WELCOME_TITLE =
  "İlk haftalık karma fazla mesai hesabınızı birlikte yapalım mı?";
export const FM_HAFTALIK_KARMA_TOUR_WELCOME_BODY =
  "Çalışma dönemini ve haftanın farklı günlerindeki çalışma düzenlerini girerek fazla mesai hesabınızı tamamlayın.";
