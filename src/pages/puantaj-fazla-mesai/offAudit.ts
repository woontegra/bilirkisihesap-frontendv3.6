/**
 * OFF sayım denetimi — ham kaynaktan mahsupa kadar katmanlı iz sürme.
 * Toplam OFF gün sayısı yalnızca doğrulanmış listenin uzunluğundan türetilir.
 */

import { isOffCandidateText, matchIzinKod, rowHasOff, ensureDurumKodlari, primaryIzinKod } from "./codes";
import type {
  CodeMap,
  ColumnMapping,
  IzinKodKey,
  MappableFieldKey,
  OffAuditRecord,
  OffAuditReport,
  OffLayerCounts,
  OffLayerKey,
  PersonelOffAudit,
  StandardRow,
  TableView,
  ValidOffDay,
} from "./model";
import { buildStandardRows, isOffConflictRow, type TransformConfig } from "./transform";
import { parseCombinedTimeCell } from "./timeRange";
import { id, isValidISODate, normalizeText, parseDateToISO } from "./utils";

const LAYER_ORDER: OffLayerKey[] = [
  "hamPdfMetni",
  "tabloSatirlari",
  "alanEslestirme",
  "standartSatir",
  "kullaniciKontrolu",
  "tarihFiltresi",
  "mahsup",
  "rapor",
];

export type OffAuditInput = {
  table: TableView;
  mappings: ColumnMapping[];
  constants: Partial<Record<MappableFieldKey, string>>;
  codeMap: CodeMap;
  standardRows: StandardRow[];
  calcDateStart?: string;
  calcDateEnd?: string;
};

function emptyLayers(): Record<OffLayerKey, boolean> {
  return {
    hamPdfMetni: false,
    tabloSatirlari: false,
    alanEslestirme: false,
    standartSatir: false,
    kullaniciKontrolu: false,
    tarihFiltresi: false,
    mahsup: false,
    rapor: false,
  };
}

function emptyLayerCounts(): OffLayerCounts {
  return {
    hamPdfMetni: 0,
    tabloSatirlari: 0,
    alanEslestirme: 0,
    standartSatir: 0,
    kullaniciKontrolu: 0,
    tarihFiltresi: 0,
    mahsup: 0,
    rapor: 0,
  };
}

function readCell(row: string[], index: number): string {
  return (row[index] ?? "").toString().trim();
}

function readMappedBag(
  rawRow: string[],
  mappings: ColumnMapping[],
  constants: Partial<Record<MappableFieldKey, string>>,
): Partial<Record<MappableFieldKey, string>> {
  const bag: Partial<Record<MappableFieldKey, string>> = { ...constants };
  for (const map of mappings) {
    if (map.mode === "field" && map.field) {
      const val = readCell(rawRow, map.columnIndex);
      if (val) bag[map.field] = val;
    } else if (map.mode === "constant" && map.field && map.constantValue) {
      bag[map.field] = map.constantValue;
    }
  }
  return bag;
}

function probeOffInCell(raw: string, codeMap: CodeMap): boolean {
  if (!raw.trim()) return false;
  if (isOffCandidateText(raw, codeMap)) return true;
  const parsed = parseCombinedTimeCell(raw, codeMap);
  return parsed.kind === "izin" && parsed.kod === "OFF";
}

function collectOffTextsFromRow(rawRow: string[], codeMap: CodeMap): string[] {
  const found: string[] = [];
  for (const cell of rawRow) {
    const t = (cell ?? "").toString().trim();
    if (t && probeOffInCell(t, codeMap)) found.push(t);
  }
  return found;
}

function mappedOffTexts(bag: Partial<Record<MappableFieldKey, string>>, codeMap: CodeMap): string[] {
  const keys: MappableFieldKey[] = [
    "izinTatilKodu",
    "aciklama",
    "esasCalismaSaatAraligi",
    "kartSaatAraligi",
    "esasCalismaGiris",
    "esasCalismaCikis",
  ];
  const found: string[] = [];
  for (const k of keys) {
    const t = bag[k];
    if (t && probeOffInCell(t, codeMap)) found.push(t);
  }
  return found;
}

export function wasHoursPreferredOverOff(row: StandardRow): boolean {
  return row.durumNotlari.some((n) => n.toLocaleLowerCase("tr-TR").includes("saatleri esas aldı"));
}

export function personelDayKey(personel: string, tarihISO: string): string {
  return `${personel.toLocaleLowerCase("tr-TR").trim()}|${tarihISO}`;
}

function inDateRange(iso: string, start?: string, end?: string): boolean {
  if (!isValidISODate(iso)) return false;
  if (start && iso < start) return false;
  if (end && iso > end) return false;
  return true;
}

/**
 * Tek doğrulanmış OFF listesi — mahsup, rapor ve motor bu listeyi kullanır.
 * Sayı = listenin uzunluğu; bağımsız sayaç tutulmaz.
 */
export function deriveValidOffDays(
  rows: StandardRow[],
  rangeStart?: string,
  rangeEnd?: string,
): ValidOffDay[] {
  const seen = new Map<string, ValidOffDay>();
  const out: ValidOffDay[] = [];

  for (const row of rows) {
    if (!rowHasOff(row)) continue;
    if (wasHoursPreferredOverOff(row)) continue;
    if (!isValidISODate(row.tarih)) continue;
    if (!inDateRange(row.tarih, rangeStart, rangeEnd)) continue;
    if (isOffConflictRow(row)) continue;

    const key = personelDayKey(row.personelAdSoyad || "Belirtilmemiş", row.tarih);
    if (seen.has(key)) continue;

    const day: ValidOffDay = {
      personel: row.personelAdSoyad || "Belirtilmemiş",
      tarihISO: row.tarih,
      tarihHam: row.tarih,
      kaynakSayfa: row.kaynakSayfa,
      kaynakSatirSira: row.kaynakSatirSira,
      standardRowId: row.id,
      hamMetin: row.izinTatilRaw || row.esasCalismaAralikHam || "OFF",
    };
    seen.set(key, day);
    out.push(day);
  }

  out.sort((a, b) =>
    a.personel.localeCompare(b.personel, "tr") || (a.tarihISO < b.tarihISO ? -1 : 1),
  );
  return out;
}

function countLayers(records: OffAuditRecord[]): OffLayerCounts {
  const counts = emptyLayerCounts();
  for (const r of records) {
    for (const k of LAYER_ORDER) {
      if (r.katmanlar[k]) counts[k] += 1;
    }
  }
  return counts;
}

function findFirstDivergence(counts: OffLayerCounts): { layer: OffLayerKey | null; detail?: string } {
  let prev = counts[LAYER_ORDER[0]];
  for (let i = 1; i < LAYER_ORDER.length; i++) {
    const key = LAYER_ORDER[i];
    const cur = counts[key];
    if (cur !== prev) {
      return {
        layer: key,
        detail: `${LAYER_ORDER[i - 1]} (${prev}) → ${key} (${cur})`,
      };
    }
    prev = cur;
  }
  return { layer: null };
}

function buildSummary(records: OffAuditRecord[], validOffDays: ValidOffDay[]): PersonelOffAudit["summary"] {
  const offRecords = records.filter((r) => r.offAdayi || r.durumKodlari.includes("OFF"));
  return {
    hamAdayToplam: records.filter((r) => r.katmanlar.hamPdfMetni).length,
    gecerliOffGunToplam: validOffDays.length,
    tarihDisi: offRecords.filter((r) => r.dahilEdilmediNedeni === "Tarih aralığı dışında").length,
    mukerrer: offRecords.filter((r) => !!r.mukerrerEslesme).length,
    celiskili: offRecords.filter((r) => r.celiskili).length,
    tarihCozulemedi: offRecords.filter((r) => r.dahilEdilmediNedeni === "Tarih çözümlenemedi").length,
    saatleriEsasAlindi: offRecords.filter((r) => r.saatleriEsasAlindi).length,
  };
}

/** Ham tablo + güncel standart satırlardan tam OFF denetim raporu üretir. */
export function buildOffAuditReport(input: OffAuditInput): OffAuditReport {
  const { table, mappings, constants, codeMap, standardRows, calcDateStart, calcDateEnd } = input;
  const config: TransformConfig = { mappings, constants, codeMap, pageNumber: table.pageNumber };
  const rebuilt = buildStandardRows(table, config);

  const stdBySourceIndex = new Map<number, StandardRow>();
  for (const sr of rebuilt) {
    if (sr.kaynakSatirSira != null) stdBySourceIndex.set(sr.kaynakSatirSira, sr);
  }
  const stdById = new Map(standardRows.map((r) => [r.id, r]));
  for (const sr of standardRows) {
    if (sr.kaynakSatirSira != null && !stdBySourceIndex.has(sr.kaynakSatirSira)) {
      stdBySourceIndex.set(sr.kaynakSatirSira, sr);
    }
  }

  const allRecords: OffAuditRecord[] = [];
  const personelMap = new Map<string, OffAuditRecord[]>();

  for (let ri = 0; ri < table.rows.length; ri++) {
    const rawRow = table.rows[ri];
    if (rawRow.every((c) => (c ?? "").toString().trim() === "")) continue;

    const bag = readMappedBag(rawRow, mappings, constants);
    const personel = (bag.personelAdSoyad ?? "").trim() || "Belirtilmemiş";
    const tarihHam = bag.tarih ?? "";
    const tarihISO = parseDateToISO(tarihHam);
    const hamMesai = bag.esasCalismaSaatAraligi ?? bag.esasCalismaGiris ?? "";
    const hamIzin = bag.izinTatilKodu ?? "";

    const cellOffTexts = collectOffTextsFromRow(rawRow, codeMap);
    const mappedOff = mappedOffTexts(bag, codeMap);
    const normalizeMetin = normalizeText([...cellOffTexts, ...mappedOff].join(" ") || hamIzin || hamMesai);

    const rebuiltRow = stdBySourceIndex.get(ri);
    const userRow = rebuiltRow ? stdById.get(rebuiltRow.id) ?? rebuiltRow : undefined;
    const activeRow = userRow ?? rebuiltRow;

    const offAdayi = cellOffTexts.length > 0 || mappedOff.length > 0;
    const durumKodlari = activeRow
      ? ensureDurumKodlari(activeRow)
      : [];
    const sonSiniflandirma: IzinKodKey = activeRow
      ? primaryIzinKod(durumKodlari.length ? durumKodlari : [activeRow.izinTatilKodu])
      : matchIzinKod(hamIzin || hamMesai, codeMap);
    const saatleriEsasAlindi = activeRow ? wasHoursPreferredOverOff(activeRow) : false;
    const celiskili = activeRow ? isOffConflictRow(activeRow) : false;
    const hasOffTag = activeRow ? rowHasOff(activeRow) : offAdayi && durumKodlari.includes("OFF");

    const katmanlar = emptyLayers();
    katmanlar.hamPdfMetni = cellOffTexts.length > 0;
    katmanlar.tabloSatirlari = katmanlar.hamPdfMetni;
    katmanlar.alanEslestirme = mappedOff.length > 0;
    katmanlar.standartSatir = rebuiltRow ? rowHasOff(rebuiltRow) : katmanlar.alanEslestirme;
    katmanlar.kullaniciKontrolu = activeRow ? hasOffTag && !saatleriEsasAlindi : false;

    const isoForFilter = activeRow?.tarih && isValidISODate(activeRow.tarih) ? activeRow.tarih : tarihISO;
    katmanlar.tarihFiltresi =
      katmanlar.kullaniciKontrolu && !!isoForFilter && inDateRange(isoForFilter, calcDateStart, calcDateEnd);

    const record: OffAuditRecord = {
      id: id("oa"),
      kaynakSayfa: activeRow?.kaynakSayfa ?? table.pageNumber,
      kaynakSatirSira: ri,
      personel,
      tarihHam,
      tarihISO: isoForFilter ?? (tarihISO || null),
      hamMesaiAciklama: activeRow?.hamMesaiAciklama || hamMesai,
      hamIzinAciklama: activeRow?.hamIzinAciklama || hamIzin,
      normalizeMetin,
      offAdayi,
      durumKodlari: durumKodlari.length
        ? durumKodlari
        : sonSiniflandirma !== "CALISTI"
          ? [sonSiniflandirma]
          : [],
      sonSiniflandirma,
      mahsupaDahil: false,
      standardRowId: activeRow?.id,
      celiskili,
      saatleriEsasAlindi,
      katmanlar,
    };

    if (!personelMap.has(personel)) personelMap.set(personel, []);
    personelMap.get(personel)!.push(record);
    allRecords.push(record);
  }

  const personeller: PersonelOffAudit[] = [];

  for (const [personelAdSoyad, records] of personelMap) {
    const personelRows = standardRows.filter(
      (r) => (r.personelAdSoyad || "Belirtilmemiş") === personelAdSoyad,
    );
    const validOffDays = deriveValidOffDays(personelRows, calcDateStart, calcDateEnd);
    const validKeys = new Set(validOffDays.map((d) => personelDayKey(d.personel, d.tarihISO)));

    const seenDay = new Map<string, OffAuditRecord>();

    for (const rec of records) {
      if (rec.saatleriEsasAlindi) {
        rec.dahilEdilmediNedeni = "Saatleri esas alındı";
        continue;
      }
      if (!rec.katmanlar.kullaniciKontrolu && rec.offAdayi && !rec.durumKodlari.includes("OFF")) {
        rec.dahilEdilmediNedeni = "OFF sınıflandırması kaldırıldı";
        continue;
      }
      if (rec.katmanlar.kullaniciKontrolu && !rec.tarihISO) {
        rec.dahilEdilmediNedeni = "Tarih çözümlenemedi";
        continue;
      }
      if (rec.katmanlar.kullaniciKontrolu && rec.tarihISO && !inDateRange(rec.tarihISO, calcDateStart, calcDateEnd)) {
        rec.dahilEdilmediNedeni = "Tarih aralığı dışında";
        rec.katmanlar.tarihFiltresi = false;
        continue;
      }
      if (rec.celiskili) {
        rec.dahilEdilmediNedeni = "OFF–kart saati çelişkisi (çözülmedi)";
        continue;
      }

      if (rec.katmanlar.kullaniciKontrolu && rec.tarihISO) {
        const dk = personelDayKey(personelAdSoyad, rec.tarihISO);
        const prior = seenDay.get(dk);
        if (prior) {
          rec.mukerrerEslesme = { personel: personelAdSoyad, tarih: rec.tarihISO };
          rec.dahilEdilmediNedeni = "Mükerrer OFF günü";
          continue;
        }
        seenDay.set(dk, rec);
      }

      if (rec.tarihISO && validKeys.has(personelDayKey(personelAdSoyad, rec.tarihISO))) {
        rec.mahsupaDahil = true;
        rec.katmanlar.mahsup = true;
        rec.katmanlar.rapor = true;
      }
    }

    const layerCounts = countLayers(records.filter((r) => r.offAdayi || r.durumKodlari.includes("OFF")));
    const div = findFirstDivergence(layerCounts);

    personeller.push({
      personelAdSoyad,
      records: records.filter((r) => r.offAdayi || r.durumKodlari.includes("OFF") || r.mahsupaDahil),
      validOffDays,
      layerCounts,
      summary: buildSummary(records, validOffDays),
      firstDivergenceLayer: div.layer,
      firstDivergenceDetail: div.detail,
    });
  }

  const globalRecords = allRecords.filter((r) => r.offAdayi || r.durumKodlari.includes("OFF"));
  const layerCounts = countLayers(globalRecords);
  const globalDiv = findFirstDivergence(layerCounts);

  return {
    personeller: personeller.sort((a, b) => a.personelAdSoyad.localeCompare(b.personelAdSoyad, "tr")),
    layerCounts,
    firstDivergenceLayer: globalDiv.layer,
    firstDivergenceDetail: globalDiv.detail,
  };
}

/** Katman adlarını kullanıcıya gösterilebilir etiketlere çevirir. */
export const OFF_LAYER_LABELS: Record<OffLayerKey, string> = {
  hamPdfMetni: "Ham PDF metni",
  tabloSatirlari: "Tablo satırları",
  alanEslestirme: "Alan eşleştirmesi",
  standartSatir: "Standart puantaj satırı",
  kullaniciKontrolu: "Kullanıcı kontrolü sonrası",
  tarihFiltresi: "Tarih filtresi",
  mahsup: "Mahsup",
  rapor: "Rapor",
};
