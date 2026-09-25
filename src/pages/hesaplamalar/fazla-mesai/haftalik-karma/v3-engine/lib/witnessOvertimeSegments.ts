/**
 * Tanıklı Standart ve Haftalık Karma cetveli için ortak segment üretimi.
 * TanikliStandartPage rows useMemo ile birebir aynı algoritma (tek kaynak).
 */

export type WitnessFmBoundaryInput = {
  startMs: number;
  endMs: number;
  fmHours: number;
  /** Tanıklı Standart yıllık izin V2 (kazanan tanığın günlük net süresi) */
  dailyNet?: number;
  /** Yıllık izin / UBGT V2: bu tanığın haftalık iş günü (1–7) — Haftalık Karma / Tanıklı Standart */
  annualLeaveHg?: number;
  /** 7 gün iken hafta tatili FM’si (tatilli) bu tanık için geçerli mi */
  annualLeaveSevenDay?: "tatilli" | "tatilsiz";
};

/**
 * Davacı dönemi içinde tanık başlangıç/bitişlerinden sınırlar üretir,
 * her parçada en yüksek FM saatini seçer, ardışık aynı FM satırlarını birleştirir.
 * Tarihler `new Date('YYYY-MM-DD')` ile işlenir (Tanıklı Standart ile aynı).
 */
export function buildMergedWitnessSegments(
  davaciDateIn: string,
  davaciDateOut: string,
  witnesses: WitnessFmBoundaryInput[]
): Array<{
  start: string;
  end: string;
  fmHours: number;
  dailyNet?: number;
  annualLeaveHg?: number;
  annualLeaveSevenDay?: "tatilli" | "tatilsiz";
}> {
  if (!davaciDateIn || !davaciDateOut || witnesses.length === 0) return [];

  const DAY_MS = 86400000;
  const dStartMs = new Date(davaciDateIn).getTime();
  const dEndMs = new Date(davaciDateOut).getTime();

  const boundarySet = new Set<number>();
  boundarySet.add(dStartMs);
  boundarySet.add(dEndMs + DAY_MS);

  witnesses.forEach((w) => {
    if (w.startMs > dStartMs && w.startMs <= dEndMs) boundarySet.add(w.startMs);
    const tEndPlus1 = w.endMs + DAY_MS;
    if (tEndPlus1 > dStartMs && tEndPlus1 <= dEndMs + DAY_MS) boundarySet.add(tEndPlus1);
  });

  const sortedBoundaries = Array.from(boundarySet).sort((a, b) => a - b);

  const segments: Array<{
    start: string;
    end: string;
    fmHours: number;
    dailyNet?: number;
    annualLeaveHg?: number;
    annualLeaveSevenDay?: "tatilli" | "tatilsiz";
  }> = [];

  // Tanık öncelik kuralı:
  // - Daha geç başlayan tanık, overlap bölgede önceliklidir.
  // - Aynı gün başlayan tanıklarda listede sonra gelen tanık önceliklidir.
  const witnessesWithOrder = witnesses.map((w, idx) => ({ ...w, order: idx }));

  for (let i = 0; i < sortedBoundaries.length - 1; i++) {
    const segStartMs = Math.max(sortedBoundaries[i], dStartMs);
    const segEndMs = Math.min(sortedBoundaries[i + 1] - DAY_MS, dEndMs);
    if (segStartMs > segEndMs) continue;

    const segStartISO = new Date(segStartMs).toISOString().slice(0, 10);
    const segEndISO = new Date(segEndMs).toISOString().slice(0, 10);

    const activeWitnesses = witnessesWithOrder.filter(
      (td) => td.startMs <= segStartMs && td.endMs >= segEndMs
    );
    if (activeWitnesses.length === 0) continue;

    const best = activeWitnesses.reduce((prev, cur) => {
      if (cur.startMs > prev.startMs) return cur;
      if (cur.startMs < prev.startMs) return prev;
      return cur.order > prev.order ? cur : prev;
    });
    segments.push({
      start: segStartISO,
      end: segEndISO,
      fmHours: best.fmHours,
      dailyNet: best.dailyNet,
      annualLeaveHg: best.annualLeaveHg,
      annualLeaveSevenDay: best.annualLeaveSevenDay,
    });
  }

  const mergedSegments: typeof segments = [];
  for (const seg of segments) {
    const last = mergedSegments[mergedSegments.length - 1];
    const isAdjacent =
      !!last &&
      new Date(last.end).getTime() + DAY_MS === new Date(seg.start).getTime();
    if (
      last &&
      isAdjacent &&
      last.fmHours === seg.fmHours &&
      last.dailyNet === seg.dailyNet &&
      (last.annualLeaveHg ?? undefined) === (seg.annualLeaveHg ?? undefined) &&
      (last.annualLeaveSevenDay ?? undefined) === (seg.annualLeaveSevenDay ?? undefined)
    ) {
      last.end = seg.end;
    } else {
      mergedSegments.push({ ...seg });
    }
  }

  return mergedSegments;
}
