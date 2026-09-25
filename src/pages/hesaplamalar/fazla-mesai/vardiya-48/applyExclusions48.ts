import type { ExcludedDay } from "./model";
import type { WorkDay } from "./generateWorkDays48";
import { getAnchorWeekBucketKey } from "./groupWeeks48";

function parseISODateLocal(iso: string): Date | null {
  const raw = String(iso || "").trim();
  if (!raw) return null;
  const s = raw.slice(0, 10);

  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (!Number.isNaN(+dt)) return dt;
  }

  // dd.mm.yyyy
  const tr = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
  if (tr) {
    const d = Number(tr[1]);
    const m = Number(tr[2]);
    const y = Number(tr[3]);
    const dt = new Date(y, m - 1, d);
    if (!Number.isNaN(+dt)) return dt;
  }

  // Fallback for Date-like strings / timestamps
  const any = new Date(raw);
  if (!Number.isNaN(+any)) return new Date(any.getFullYear(), any.getMonth(), any.getDate());
  return null;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normDay(d: string): string {
  return String(d || "").trim().slice(0, 10);
}

type ApplyTwoWorkdayOpts = {
  /** `iso` günü vardiya çizelgesinde çalışma günü değilse hiç düşüm yapılmaz (48 saat birleşik ritim). */
  restrictToBaselineWorkAtIso?: boolean;
  baselineWorkByIso?: Map<string, boolean>;
  /**
   * 48 saat: düşürülecek vardiya **çalışma günü** adedi (varsayılan 1).
   * Yıllık izin — birleşik ritimde etkin takvim günü — için 2 kullanılır (2 vardiya çalışma günü).
   */
  targetWorkdayRemovals?: number;
};

/**
 * 48 saat vardiya: `targetWorkdayRemovals` kadar çalışma günü `isWork` kapatılır (takvim sırasıyla ileri).
 * `iso` cetvel aralığında yoksa işlem yapılmaz.
 * `iso` çalışma günüyse önce o gün; eksik kalan düşümler sonraki çalışma günlerinden tamamlanır.
 * `iso` dinlenme günüyse, o günden itibaren ilk çalışma günlerinden tamamlanır.
 *
 * `restrictToBaselineWorkAtIso`: true iken `iso` başlangıç çizelgesinde dinlenme günüyse
 * ileri tarihe kaydırılmaz (48 saat motorunda birleşik ritim + etkin gün listesi için).
 */
function applyTwoWorkdayDropsForIso(out: WorkDay[], isoRaw: string, opts?: ApplyTwoWorkdayOpts): void {
  const iso = normDay(isoRaw);
  if (!iso) return;

  if (opts?.restrictToBaselineWorkAtIso && opts.baselineWorkByIso?.get(iso) !== true) {
    return;
  }

  let idxAtIso = -1;
  for (let i = 0; i < out.length; i += 1) {
    if (normDay(out[i].date) === iso) {
      idxAtIso = i;
      break;
    }
  }
  if (idxAtIso < 0) return;

  const rawTarget = Math.floor(Number(opts?.targetWorkdayRemovals) || 1);
  const targetDrops = Math.min(6, Math.max(1, Number.isFinite(rawTarget) ? rawTarget : 1));

  let removed = 0;

  if (out[idxAtIso].isWork) {
    out[idxAtIso] = { ...out[idxAtIso], isWork: false };
    removed += 1;
    for (let j = idxAtIso + 1; j < out.length && removed < targetDrops; j += 1) {
      if (out[j].isWork) {
        out[j] = { ...out[j], isWork: false };
        removed += 1;
      }
    }
    return;
  }

  for (let i = idxAtIso; i < out.length && removed < targetDrops; i += 1) {
    if (out[i].isWork) {
      out[i] = { ...out[i], isWork: false };
      removed += 1;
    }
  }
}

/**
 * UBGT + Yıllık İzin günlerini tek havuzda toplar; ardışık takvim bloklarında
 * 1 düş / 1 düşme (indeks 0,2,4,… → etkin) kuralını uygular.
 */
export function buildEffectiveSequentialDates(exclusions: ExcludedDay[]): Set<string> {
  const raw = new Set<string>();
  exclusions.forEach((ex) => {
    const type = String(ex.type || "").trim();
    if (type !== "UBGT" && type !== "Yıllık İzin") return;
    const s = parseISODateLocal(String(ex.start || ""));
    const e = parseISODateLocal(String(ex.end || ""));
    if (!s || !e || e < s) return;
    const capRaw = Number(ex.days);
    const cap = Number.isFinite(capRaw) && capRaw > 0 ? Math.floor(capRaw) : null;
    const cur = new Date(s);
    let used = 0;
    while (cur <= e) {
      if (cap != null && used >= cap) break;
      raw.add(toISODate(cur));
      used += 1;
      cur.setDate(cur.getDate() + 1);
    }
  });

  const sorted = [...raw].sort((a, b) => a.localeCompare(b));
  const effective = new Set<string>();
  let i = 0;
  while (i < sorted.length) {
    const block: string[] = [sorted[i]];
    let j = i + 1;
    while (j < sorted.length) {
      const prev = parseISODateLocal(sorted[j - 1]);
      const curD = parseISODateLocal(sorted[j]);
      if (!prev || !curD) break;
      const next = new Date(prev);
      next.setDate(prev.getDate() + 1);
      if (toISODate(next) !== sorted[j]) break;
      block.push(sorted[j]);
      j += 1;
    }
    for (let k = 0; k < block.length; k += 1) {
      if (k % 2 === 0) effective.add(block[k]);
    }
    i = j;
  }
  return effective;
}

/**
 * 24/48 vardiya: ardışık UBGT + yıllık izin takvim bloklarında etkin günler
 * 3 günlük ritme göre 1-0-0 (üçlüde yalnızca ilk gün) seçilir; 24 saatteki 1-0-1’den ayrılır.
 */
export function buildEffectiveSequentialDates48(exclusions: ExcludedDay[]): Set<string> {
  const raw = new Set<string>();

  exclusions.forEach((ex) => {
    const type = String(ex.type || "").trim();
    if (type !== "UBGT" && type !== "Yıllık İzin") return;

    const s = parseISODateLocal(String(ex.start || ""));
    const e = parseISODateLocal(String(ex.end || ""));
    if (!s || !e || e < s) return;

    const capRaw = Number(ex.days);
    const cap = Number.isFinite(capRaw) && capRaw > 0 ? Math.floor(capRaw) : null;
    const cur = new Date(s);
    let used = 0;
    while (cur <= e) {
      if (cap != null && used >= cap) break;
      raw.add(toISODate(cur));
      used += 1;
      cur.setDate(cur.getDate() + 1);
    }
  });

  const sorted = [...raw].sort((a, b) => a.localeCompare(b));
  const effective = new Set<string>();

  let i = 0;
  while (i < sorted.length) {
    const block: string[] = [sorted[i]];
    let j = i + 1;

    while (j < sorted.length) {
      const prev = parseISODateLocal(sorted[j - 1]);
      const curD = parseISODateLocal(sorted[j]);
      if (!prev || !curD) break;

      const next = new Date(prev);
      next.setDate(prev.getDate() + 1);

      if (toISODate(next) !== sorted[j]) break;

      block.push(sorted[j]);
      j += 1;
    }

    for (let k = 0; k < block.length; k += 3) {
      effective.add(block[k]);
    }

    i = j;
  }

  return effective;
}

/**
 * Yalnızca UBGT kayıtları için etkin gün kümesi (48 saat vardiya / calculate48System).
 * Ardışık takvim günlerinde **üçlü ritim**: her 3 günde bir (1 dolu / 2 boş), {@link buildEffectiveSequentialDates48}
 * ile aynı sıkıştırma — 24 saatteki `k += 2` (1-0-1) burada kullanılmaz.
 */
export function buildEffectiveUbgtDates(exclusions: ExcludedDay[]): Set<string> {
  const raw = new Set<string>();
  exclusions.forEach((ex) => {
    if (String(ex.type || "").trim() !== "UBGT") return;
    const s = parseISODateLocal(String(ex.start || ""));
    const e = parseISODateLocal(String(ex.end || ""));
    if (!s || !e || e < s) return;
    const capRaw = Number(ex.days);
    const cap = Number.isFinite(capRaw) && capRaw > 0 ? Math.floor(capRaw) : null;
    const cur = new Date(s);
    let used = 0;
    while (cur <= e) {
      if (cap != null && used >= cap) break;
      raw.add(toISODate(cur));
      used += 1;
      cur.setDate(cur.getDate() + 1);
    }
  });

  const sorted = [...raw].sort((a, b) => a.localeCompare(b));
  const effective = new Set<string>();
  let i = 0;
  while (i < sorted.length) {
    const block: string[] = [sorted[i]];
    let j = i + 1;
    while (j < sorted.length) {
      const prev = parseISODateLocal(sorted[j - 1]);
      const cur = parseISODateLocal(sorted[j]);
      if (!prev || !cur) break;
      const next = new Date(prev);
      next.setDate(prev.getDate() + 1);
      if (toISODate(next) !== sorted[j]) break;
      block.push(sorted[j]);
      j += 1;
    }
    for (let k = 0; k < block.length; k += 3) effective.add(block[k]);
    i = j;
  }
  return effective;
}

function sortUniqueIsoDates(dates: string[]): string[] {
  return [...new Set(dates.map((d) => normDay(d)))].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

const MERGED_48_RHYTHM_TYPES = new Set(["UBGT", "Yıllık İzin", "Rapor", "Diğer"]);

/** UBGT + yıllık izin takvim günleri: ardışık blokta 1-0-0 indeksleri (kayıp tür bilgisi). */
export type V48EffectiveExclusionEvent = {
  date: string;
  types: string[];
  effectiveIndex: number;
  isEffective: boolean;
};

export function buildEffectiveExclusionEvents48(exclusions: ExcludedDay[]): V48EffectiveExclusionEvent[] {
  const byDate = new Map<string, Set<string>>();
  exclusions.forEach((ex) => {
    const type = String(ex.type || "").trim();
    if (type !== "UBGT" && type !== "Yıllık İzin") return;
    const s = parseISODateLocal(String(ex.start || ""));
    const e = parseISODateLocal(String(ex.end || ""));
    if (!s || !e || e < s) return;
    const capRaw = Number(ex.days);
    const cap = Number.isFinite(capRaw) && capRaw > 0 ? Math.floor(capRaw) : null;
    const cur = new Date(s);
    let used = 0;
    while (cur <= e) {
      if (cap != null && used >= cap) break;
      const key = toISODate(cur);
      let tset = byDate.get(key);
      if (!tset) {
        tset = new Set<string>();
        byDate.set(key, tset);
      }
      tset.add(type);
      used += 1;
      cur.setDate(cur.getDate() + 1);
    }
  });
  const sorted = [...byDate.keys()].sort((a, b) => a.localeCompare(b));
  if (!sorted.length) return [];
  const out: V48EffectiveExclusionEvent[] = [];
  let i = 0;
  while (i < sorted.length) {
    const block: string[] = [sorted[i]];
    let j = i + 1;
    while (j < sorted.length) {
      const prev = parseISODateLocal(sorted[j - 1]);
      const curD = parseISODateLocal(sorted[j]);
      if (!prev || !curD) break;
      const next = new Date(prev);
      next.setDate(prev.getDate() + 1);
      if (toISODate(next) !== sorted[j]) break;
      block.push(sorted[j]);
      j += 1;
    }
    // Ardışık blokta 1-0-0 (k % 3 === 0); blok tek günlükse yalnızca k=0 → her zaman etkin.
    for (let k = 0; k < block.length; k += 1) {
      const date = block[k];
      const types = [...(byDate.get(date) || [])].sort();
      out.push({
        date,
        types,
        effectiveIndex: k,
        isEffective: k % 3 === 0,
      });
    }
    i = j;
  }
  return out;
}

export function groupEffectiveExclusionEventsByAnchorBucket(
  events: V48EffectiveExclusionEvent[],
  anchorStart: string
): Map<string, V48EffectiveExclusionEvent[]> {
  const m = new Map<string, V48EffectiveExclusionEvent[]>();
  const anchor = String(anchorStart || "").trim().slice(0, 10);
  if (!anchor) return m;
  events
    .filter((ev) => ev.isEffective)
    .forEach((ev) => {
      const bk = getAnchorWeekBucketKey(ev.date, anchor) || ev.date.slice(0, 10);
      const arr = m.get(bk) || [];
      arr.push(ev);
      m.set(bk, arr);
    });
  return m;
}

export function listV48AppliedDropIsoOrdered(exclusions: ExcludedDay[], workDays: WorkDay[]): string[] {
  const { mergedWorkDropIso, mergedUbgtForwardFromRestIso } = materializeExclusionDates48(exclusions, workDays);
  return sortUniqueIsoDates([...mergedWorkDropIso, ...mergedUbgtForwardFromRestIso]);
}

/**
 * UBGT + yıllık izin + rapor + diğer takvim günlerinin **birleşik** ardışık takvim akışında 1-0-0 ritmi:
 * ardışık günler tek blokta birleştirilir; indeks 0,3,6… etkindir (1 dolu / 2 boş).
 * **Tek takvim günü** bloklarında yalnızca k=0 vardır → o gün her zaman ritimde etkindir.
 */
export function buildEffectiveMergedUir48(exclusions: ExcludedDay[]): Set<string> {
  const raw = new Set<string>();
  exclusions.forEach((ex) => {
    const type = String(ex.type || "").trim();
    if (!MERGED_48_RHYTHM_TYPES.has(type)) return;
    const s = parseISODateLocal(String(ex.start || ""));
    const e = parseISODateLocal(String(ex.end || ""));
    if (!s || !e || e < s) return;
    const capRaw = Number(ex.days);
    const cap = Number.isFinite(capRaw) && capRaw > 0 ? Math.floor(capRaw) : null;
    const cur = new Date(s);
    let used = 0;
    while (cur <= e) {
      if (cap != null && used >= cap) break;
      raw.add(toISODate(cur));
      used += 1;
      cur.setDate(cur.getDate() + 1);
    }
  });

  const sorted = [...raw].sort((a, b) => a.localeCompare(b));
  const effective = new Set<string>();
  let i = 0;
  while (i < sorted.length) {
    const block: string[] = [sorted[i]];
    let j = i + 1;
    while (j < sorted.length) {
      const prev = parseISODateLocal(sorted[j - 1]);
      const curD = parseISODateLocal(sorted[j]);
      if (!prev || !curD) break;
      const next = new Date(prev);
      next.setDate(prev.getDate() + 1);
      if (toISODate(next) !== sorted[j]) break;
      block.push(sorted[j]);
      j += 1;
    }
    for (let k = 0; k < block.length; k += 3) effective.add(block[k]);
    i = j;
  }
  return effective;
}

/**
 * Birleşik 48 saat ritim havuzu (UBGT + Yıllık İzin + Rapor + Diğer) için takvim günleri;
 * `buildEffectiveMergedUir48` süzmesinden önce — kullanıcının ardışık seçim blokları cetvel satırı için.
 */
export function collectMergedRhythmRawCalendarDates48(exclusions: ExcludedDay[]): string[] {
  const raw = new Set<string>();
  exclusions.forEach((ex) => {
    const type = String(ex.type || "").trim();
    if (!MERGED_48_RHYTHM_TYPES.has(type)) return;
    const s = parseISODateLocal(String(ex.start || ""));
    const e = parseISODateLocal(String(ex.end || ""));
    if (!s || !e || e < s) return;
    const capRaw = Number(ex.days);
    const cap = Number.isFinite(capRaw) && capRaw > 0 ? Math.floor(capRaw) : null;
    const cur = new Date(s);
    let used = 0;
    while (cur <= e) {
      if (cap != null && used >= cap) break;
      raw.add(toISODate(cur));
      used += 1;
      cur.setDate(cur.getDate() + 1);
    }
  });
  return sortUniqueIsoDates([...raw]);
}

/** Sıralı benzersiz ISO gün listesini ardışık takvim bloklarına böler. */
export function clusterConsecutiveIsoDatesSorted(sortedUnique: string[]): string[][] {
  if (!sortedUnique.length) return [];
  const blocks: string[][] = [];
  let i = 0;
  while (i < sortedUnique.length) {
    const block: string[] = [sortedUnique[i]];
    let j = i + 1;
    while (j < sortedUnique.length) {
      const prev = parseISODateLocal(sortedUnique[j - 1]);
      const curD = parseISODateLocal(sortedUnique[j]);
      if (!prev || !curD) break;
      const next = new Date(prev);
      next.setDate(prev.getDate() + 1);
      if (toISODate(next) !== sortedUnique[j]) break;
      block.push(sortedUnique[j]);
      j += 1;
    }
    blocks.push(block);
    i = j;
  }
  return blocks;
}

export type V48ExclusionEffectDetail = {
  date: string;
  type: string;
  isEffective: boolean;
  reason: string;
  sourceIndex: number;
};

/**
 * Tanılama / UI: her dışlama günü için ritim + vardiya çalışma günü birlikte değerlendirilir.
 * Puantaj/Bordro ritim havuzunda değildir; çalışma gününde takvim kaydı varsa etkin sayılır.
 */
export function buildV48ExclusionEffectDetails(
  exclusions: ExcludedDay[],
  workDays: WorkDay[]
): V48ExclusionEffectDetail[] {
  const eff = buildEffectiveMergedUir48(exclusions);
  const baseline = new Map(workDays.map((d) => [normDay(d.date), !!d.isWork]));
  const out: V48ExclusionEffectDetail[] = [];

  exclusions.forEach((ex, sourceIndex) => {
    const type = String(ex.type || "").trim();
    const s = parseISODateLocal(String(ex.start || ""));
    const e = parseISODateLocal(String(ex.end || ""));
    if (!s || !e || e < s) return;
    const capRaw = Number(ex.days);
    const cap = Number.isFinite(capRaw) && capRaw > 0 ? Math.floor(capRaw) : null;
    const cur = new Date(s);
    let used = 0;
    while (cur <= e) {
      if (cap != null && used >= cap) break;
      const key = toISODate(cur);
      const work = baseline.get(key) === true;
      if (type === "Puantaj/Bordro") {
        out.push({
          date: key,
          type,
          isEffective: work,
          reason: work ? "Puantaj/Bordro (çalışma günü)" : "vardiya dinlenme günü",
          sourceIndex,
        });
      } else if (MERGED_48_RHYTHM_TYPES.has(type)) {
        const rhythm = eff.has(key);
        const isEffective = rhythm && work;
        let reason = "etkin düşüm";
        if (!rhythm) reason = "48 saat ritiminde etkin slot değil (ardışık blokta 1-0-0)";
        else if (!work) reason = "vardiya dinlenme günü";
        out.push({ date: key, type, isEffective, reason, sourceIndex });
      } else {
        out.push({
          date: key,
          type,
          isEffective: work,
          reason: work ? "takvim dışlama (normal)" : "vardiya dinlenme günü",
          sourceIndex,
        });
      }
      used += 1;
      cur.setDate(cur.getDate() + 1);
    }
  });

  return out;
}

/**
 * 48 saat motoru: zorunlu düşüm tarihlerini kaynağa göre ayırır.
 * - **UBGT / Rapor / Diğer** (birleşik ritimde etkin): çalışma gününde 1 vardiya çalışma günü düşümü.
 * - **Yıllık İzin** (birleşik ritimde etkin): çalışma gününde **2** vardiya çalışma günü düşümü (48 saat kuralı).
 * - **UBGT / Yıllık İzin** dinlenme günü + ritim etkin: `mergedUbgtForwardFromRestIso` (kaydırmalı; UBGT 1, yıllık izin 2 vardiya çalışma günü).
 * - **Puantaj/Bordro**: takvim günü bazlı (7 günlük blok ile).
 * - **Diğer türler**: `normal` (tek tek isWork düşümü).
 */
export function materializeExclusionDates48(exclusions: ExcludedDay[], workDays: WorkDay[]): {
  normal: Set<string>;
  mergedWorkDropIso: string[];
  /** Etkin birleşik ritim günü başına kapatılacak vardiya çalışma günü sayısı (yıllık izin: 2, diğer: 1). */
  mergedWorkDropRemovalsByIso: Map<string, number>;
  /** Ritimde etkin gün dinlenmeye denk gelince: sonraki çalışma günlerinden düşüm (UBGT/ yıllık izin). */
  mergedUbgtForwardFromRestIso: string[];
  /** `mergedUbgtForwardFromRestIso` içindeki her ISO için kapatılacak vardiya çalışma günü sayısı (UBGT: 1, izin: 2). */
  forwardRemovalsByIso: Map<string, number>;
  puantajForcedIso: string[];
} {
  const normal = new Set<string>();
  const puantajList: string[] = [];
  const mergedRemovalByIso = new Map<string, number>();
  const bumpMergedRemoval = (iso: string, removals: number) => {
    const prev = mergedRemovalByIso.get(iso) || 0;
    mergedRemovalByIso.set(iso, Math.max(prev, removals));
  };
  const ubgtForwardAcc = new Set<string>();
  const forwardRemovalByIso = new Map<string, number>();
  const bumpForwardRemoval = (iso: string, removals: number) => {
    const prev = forwardRemovalByIso.get(iso) || 0;
    forwardRemovalByIso.set(iso, Math.max(prev, removals));
  };
  const baseline = new Map(workDays.map((d) => [normDay(d.date), !!d.isWork]));
  const effectiveMerged = buildEffectiveMergedUir48(exclusions);

  exclusions.forEach((ex) => {
    const s = parseISODateLocal(String(ex.start || ""));
    const e = parseISODateLocal(String(ex.end || ""));
    if (!s || !e || e < s) return;
    const type = String(ex.type || "").trim();
    const isForcedType = type === "Puantaj/Bordro";
    const capRaw = Number(ex.days);
    const cap = Number.isFinite(capRaw) && capRaw > 0 ? Math.floor(capRaw) : null;
    const cur = new Date(s);
    let used = 0;
    while (cur <= e) {
      if (cap != null && used >= cap) break;
      const key = toISODate(cur);
      if (type === "UBGT" || type === "Yıllık İzin" || type === "Rapor" || type === "Diğer") {
        const inSegmentCalendar = baseline.has(key);
        const workHere = baseline.get(key);
        if (!inSegmentCalendar) {
          /* Tanık parçası / dönem penceresi bu günü içermiyor; bu workDays üzerinde işlem yok. */
        } else if (effectiveMerged.has(key) && workHere === true) {
          bumpMergedRemoval(key, type === "Yıllık İzin" ? 2 : 1);
        } else if (effectiveMerged.has(key) && workHere === false) {
          if (type === "UBGT" || type === "Yıllık İzin") {
            ubgtForwardAcc.add(key);
            bumpForwardRemoval(key, type === "Yıllık İzin" ? 2 : 1);
          }
        } else if (type === "Rapor" || type === "Diğer") {
          normal.add(key);
        }
      } else if (isForcedType) {
        puantajList.push(key);
      } else {
        normal.add(key);
      }
      used += 1;
      cur.setDate(cur.getDate() + 1);
    }
  });

  return {
    normal,
    mergedWorkDropIso: sortUniqueIsoDates([...mergedRemovalByIso.keys()]),
    mergedWorkDropRemovalsByIso: mergedRemovalByIso,
    mergedUbgtForwardFromRestIso: sortUniqueIsoDates([...ubgtForwardAcc]),
    forwardRemovalsByIso: forwardRemovalByIso,
    puantajForcedIso: sortUniqueIsoDates(puantajList),
  };
}

/** Puantaj/Bordro: takvim günlerini anchor hafta kovasına göre grupla (seçili tarih+6 değil). */
function groupPuantajIsosByAnchorBucket(puantajIsoList: string[], anchorStart: string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  const anchor = normDay(anchorStart);
  if (!anchor) return m;
  sortUniqueIsoDates([...puantajIsoList]).forEach((iso) => {
    const bk = getAnchorWeekBucketKey(iso, anchor) || iso;
    const arr = m.get(bk) || [];
    arr.push(iso);
    m.set(bk, arr);
  });
  return m;
}

/** Puantaj için geriye uyum: anchor yoksa eski seçili tarih+6 blokları. */
function applyPuantajDropsSevenDayLegacy(out: WorkDay[], sortedUnique: string[]): void {
  let i = 0;
  while (i < sortedUnique.length) {
    const start = sortedUnique[i];
    const startDt = parseISODateLocal(start);
    if (!startDt) {
      i += 1;
      continue;
    }
    const endDt = new Date(startDt);
    endDt.setDate(endDt.getDate() + 6);
    const end = toISODate(endDt);
    let need = 0;
    while (i < sortedUnique.length && sortedUnique[i] <= end) {
      need += 1;
      i += 1;
    }
    for (let idx = 0; idx < out.length; idx += 1) {
      if (need <= 0) break;
      const dayIso = normDay(out[idx].date);
      if (dayIso < start || dayIso > end) continue;
      if (!out[idx].isWork) continue;
      out[idx] = { ...out[idx], isWork: false };
      need -= 1;
    }
  }
}

function applyPuantajDropsByAnchorBuckets(out: WorkDay[], puantajIsoList: string[], anchorStart: string): void {
  const byBucket = groupPuantajIsosByAnchorBucket(puantajIsoList, anchorStart);
  byBucket.forEach((isos, bucketKey) => {
    const bStart = bucketKey.slice(0, 10);
    const bStartDt = parseISODateLocal(bStart);
    if (!bStartDt) return;
    const bEnd = toISODate(new Date(bStartDt.getFullYear(), bStartDt.getMonth(), bStartDt.getDate() + 6));
    let need = isos.length;
    for (let idx = 0; idx < out.length; idx += 1) {
      if (need <= 0) break;
      const dayIso = normDay(out[idx].date);
      if (dayIso < bStart || dayIso > bEnd) continue;
      if (!out[idx].isWork) continue;
      out[idx] = { ...out[idx], isWork: false };
      need -= 1;
    }
  });
}

/**
 * UBGT/izin sadece calisma gununden dusulur.
 * Dinlenme gunune gelen dislama etkisizdir.
 *
 * @param anchorBucketStart 7 günlük kova başı (`weekBucketAnchorDate`); Puantaj düşümü bu anahtara göre gruplanır.
 */
export function applyExclusions48(
  workDays: WorkDay[],
  exclusions: ExcludedDay[] | null | undefined,
  anchorBucketStart?: string | null,
  options?: { respectWorkdayFilter?: boolean }
): WorkDay[] {
  if (!exclusions?.length) return workDays;
  const respectWorkdayFilter = options?.respectWorkdayFilter ?? true;
  const baselineWorkByIso = new Map(workDays.map((d) => [normDay(d.date), !!d.isWork]));
  const {
    normal,
    mergedWorkDropIso,
    mergedWorkDropRemovalsByIso,
    mergedUbgtForwardFromRestIso,
    forwardRemovalsByIso,
    puantajForcedIso,
  } = materializeExclusionDates48(exclusions, workDays);
  const applyOpts: ApplyTwoWorkdayOpts = {
    restrictToBaselineWorkAtIso: true,
    baselineWorkByIso,
  };
  const applyMergedChronological = (target: WorkDay[]) => {
    const chron = sortUniqueIsoDates([...mergedWorkDropIso, ...mergedUbgtForwardFromRestIso]);
    chron.forEach((iso) => {
      const directN = mergedWorkDropRemovalsByIso.get(iso) || 0;
      if (directN > 0) {
        applyTwoWorkdayDropsForIso(target, iso, { ...applyOpts, targetWorkdayRemovals: directN });
        return;
      }
      const forwardN = forwardRemovalsByIso.get(iso) || 0;
      if (forwardN > 0) {
        applyTwoWorkdayDropsForIso(target, iso, { targetWorkdayRemovals: forwardN });
      }
    });
  };

  const out = respectWorkdayFilter
    ? workDays.map((d) => {
        const iso = normDay(d.date);
        return d.isWork && normal.has(iso) ? { ...d, isWork: false } : { ...d };
      })
    : workDays.map((d) => ({ ...d }));

  if (!respectWorkdayFilter) {
    applyMergedChronological(out);
    for (let idx = 0; idx < out.length; idx += 1) {
      const iso = normDay(out[idx].date);
      if (out[idx].isWork && normal.has(iso)) {
        out[idx] = { ...out[idx], isWork: false };
      }
    }
    const anchor = String(anchorBucketStart || "").trim().slice(0, 10);
    const puSort = sortUniqueIsoDates(puantajForcedIso);
    if (anchor) applyPuantajDropsByAnchorBuckets(out, puantajForcedIso, anchor);
    else if (puSort.length) applyPuantajDropsSevenDayLegacy(out, puSort);
    return out;
  }

  applyMergedChronological(out);

  const anchor = String(anchorBucketStart || "").trim().slice(0, 10);
  const puSort = sortUniqueIsoDates(puantajForcedIso);
  if (anchor) applyPuantajDropsByAnchorBuckets(out, puantajForcedIso, anchor);
  else if (puSort.length) applyPuantajDropsSevenDayLegacy(out, puSort);

  return out;
}
