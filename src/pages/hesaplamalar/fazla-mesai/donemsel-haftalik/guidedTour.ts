import type { GuidedTourDefinition } from "@/components/guided-tour/types";
import { datesReadyIn, isValidTimeValue } from "@/components/guided-tour/autoAdvance";
import { findTourTarget } from "@/components/guided-tour/geometry";

function fmDonemselHaftalikDatesReady(): boolean {
  return datesReadyIn(findTourTarget("fm-donemsel-haftalik-donem"));
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

function groupComplete(g: DayGroupFields): boolean {
  return Number.isFinite(g.dayCount) && g.dayCount > 0 && isValidTimeValue(g.tin) && isValidTimeValue(g.tout);
}

/** En az bir geçerli grup (yaz/kış Grup 1 veya 2). */
export function fmDonemselHaftalikDesenReady(): boolean {
  const root = findTourTarget("fm-donemsel-haftalik-desen");
  if (!root) return false;
  return readDayGroupRows(root).some(groupComplete);
}

/**
 * Otomatik ilerleme: yalnız birden fazla grup başlanmış ve hepsi tamamsa.
 * Tek grup (ör. yalnızca Yaz Grup 1) doluysa otomatik geçme.
 */
function fmDonemselHaftalikDesenReadyForAuto(): boolean {
  const root = findTourTarget("fm-donemsel-haftalik-desen");
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

  if (startedIdx.length === 1 && startedIdx[0] === 0) return false;

  return true;
}

/**
 * Dönemsel Haftalık Fazla Mesai — 5 adım.
 * Tanık isteğe bağlı. Desen: yaz/kış Grup 1–2 (haftalık karma mantığı).
 */
export const FM_DONEMSEL_HAFTALIK_TOUR: GuidedTourDefinition = {
  id: "fm-donemsel-haftalik",
  version: 1,
  steps: [
    {
      id: "donem",
      target: "fm-donemsel-haftalik-donem",
      title: "Çalışma dönemi",
      body: "Davacının işe giriş ve işten çıkış tarihlerini girin. Program hesaplama dönemini bu tarihlere göre oluşturur.",
      mode: "manual",
      skippable: false,
      placement: "bottom",
      autoAdvance: { isReady: fmDonemselHaftalikDatesReady, delayMs: 500 },
      advanceBlockedHint: "Devam etmek için davacının işe giriş ve işten çıkış tarihlerini tamamlayın.",
    },
    {
      id: "desen",
      target: "fm-donemsel-haftalik-desen",
      title: "Yaz / kış haftalık çalışma düzeni",
      body: "Yaz ve kış için Grup 1 ve Grup 2 gün sayıları ile giriş/çıkış saatlerini girin. En az bir geçerli grup yeterlidir; ikinci grup boş kalabilir.",
      mode: "optional",
      optionalHideSkip: true,
      optionalConfirmLabel: "Deseni tamamladım",
      optionalConfirmReady: fmDonemselHaftalikDesenReady,
      optionalConfirmBlockedHint:
        "Devam etmek için en az bir grubun gün sayısı ile giriş ve çıkış saatlerini tamamlayın.",
      autoAdvance: { isReady: fmDonemselHaftalikDesenReadyForAuto, delayMs: 800 },
      placement: "top",
    },
    {
      id: "taniklar",
      target: "fm-donemsel-haftalik-taniklar",
      title: "Tanık beyanları — isteğe bağlı",
      body: "Tanık varsa adını, dönemini ve yaz/kış Grup 1–2 çalışma düzenini girin. Tanık yoksa hesaplama yalnızca davacı deseniyle yapılır.",
      mode: "optional",
      optionalSkipLabel: "Tanığım yok",
      optionalConfirmLabel: "Tanıkları tamamladım",
      placement: "top",
    },
    {
      id: "ayarlar",
      target: "fm-donemsel-haftalik-ayarlar",
      title: "Düşüm ve ayarlar — isteğe bağlı",
      body: "Yıllık izin, UBGT, çalışılmayan dönem, katsayı, 270 gün ve zamanaşımı gibi özel durumlar varsa buradan ekleyebilirsiniz. Yoksa doğrudan devam edin.",
      mode: "optional",
      optionalSkipLabel: "Özel durum yok",
      optionalConfirmLabel: "Ayarları tamamladım",
      placement: "top",
    },
    {
      id: "onizle-kaydet",
      target: "fm-donemsel-haftalik-kaydet-actions",
      title: "Önizleyin ve kaydedin",
      body: "Hesap sonucunu görmek, Word’e kopyalamak, yazdırmak veya PDF indirmek için Önizleme’yi açın. Hesaplamayı daha sonra kullanmak için Kaydet’e basın.",
      mode: "finish",
      placement: "top",
      scroll: "none",
    },
  ],
};

export const FM_DONEMSEL_HAFTALIK_TOUR_WELCOME_TITLE =
  "İlk dönemsel haftalık fazla mesai hesabınızı birlikte yapalım mı?";
export const FM_DONEMSEL_HAFTALIK_TOUR_WELCOME_BODY =
  "Çalışma dönemini ve yaz/kış haftalık gruplarını girerek dönemsel haftalık fazla mesai hesabınızı tamamlayın.";
