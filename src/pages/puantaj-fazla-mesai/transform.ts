import {
  extractIzinKodlari,
  mergeDurumKodlari,
  primaryIzinKod,
  rowHasOff,
  ensureDurumKodlari,
} from "./codes";
import type {
  ColumnMapping,
  CodeMap,
  ControlStatus,
  HourSource,
  IzinKodKey,
  MappableFieldKey,
  StandardRow,
  TableView,
} from "./model";
import { isTimeRangeFieldKey } from "./model";
import { parseCombinedTimeCell } from "./timeRange";
import {
  id,
  isValidISODate,
  isValidTime,
  normalizeTimeString,
  parseDateToISO,
  parseTimeRange,
  parseTimeToMinutes,
} from "./utils";
import { readLogicalCell } from "./smart-import-v2/groupLogicalColumns";
import { logicalGroupsFromHeaders } from "./detect";

/**
 * Ayrıştırılmış tablo + alan eşleştirmesinden STANDART puantaj satırlarını üretir.
 * Mesai Açıklama ve İzin Açıklama bağımsız sınıflandırılır; `durumKodlari`
 * çoklu etiket olarak birleştirilir (OFF + RAPOR gibi ezilmez).
 */

export type TransformConfig = {
  mappings: ColumnMapping[];
  constants: Partial<Record<MappableFieldKey, string>>;
  codeMap: CodeMap;
  pageNumber?: number;
  /** Mantıksal sütun birleştirme (Adı Soyadı vb.) için tablo başlıkları. */
  headers?: string[];
};

type FieldBag = Partial<Record<MappableFieldKey, string>> & {
  _esasAralikHam?: string;
  _kartAralikHam?: string;
  _ertesiGun?: boolean;
  _aralikKontrol?: boolean;
  _aralikNot?: string;
  _hamMesaiAciklama?: string;
  _hamIzinAciklama?: string;
  _mesaiKodlari?: IzinKodKey[];
  _izinKodlari?: IzinKodKey[];
};

function readCell(row: string[], index: number): string {
  return (row[index] ?? "").toString().trim();
}

function readMappedCell(row: string[], map: ColumnMapping, headers?: string[]): string {
  const indices = map.physicalIndices;
  if (indices && indices.length > 1 && headers?.length) {
    const group = logicalGroupsFromHeaders(headers).find((g) => g.physicalIndices[0] === indices[0]);
    if (group) return readLogicalCell(row, group);
  }
  return readCell(row, map.columnIndex);
}

function collectFields(row: string[], config: TransformConfig): FieldBag {
  const bag: FieldBag = {};

  for (const [k, v] of Object.entries(config.constants)) {
    if (v != null && v !== "") bag[k as MappableFieldKey] = v;
  }

  for (const map of config.mappings) {
    if (map.mode === "field" && map.field) {
      const val = readMappedCell(row, map, config.headers);
      if (!val) continue;
      applyMappedValue(bag, map.field, val, config.codeMap);
    } else if (map.mode === "constant" && map.field) {
      if (map.constantValue) bag[map.field] = map.constantValue;
    } else if (map.mode === "derive" && map.field) {
      const src = readMappedCell(row, { ...map, columnIndex: map.deriveFromColumn ?? map.columnIndex }, config.headers);
      if (!src) continue;
      if (isTimeRangeFieldKey(map.field) || map.deriveRule === "rangeStart") {
        applyTimeRangeField(bag, map.field === "kartSaatAraligi" ? "kart" : "esas", src, config.codeMap);
      } else {
        const derived = applyDerive(src, map.deriveRule ?? "copy");
        if (derived) bag[map.field] = derived;
      }
    }
  }

  return bag;
}

function applyTimeRangeField(
  bag: FieldBag,
  target: "esas" | "kart",
  val: string,
  codeMap: CodeMap,
): void {
  const parsed = parseCombinedTimeCell(val, codeMap);

  if (target === "esas") {
    bag._esasAralikHam = parsed.raw;
    bag.esasCalismaSaatAraligi = parsed.raw;
  } else {
    bag._kartAralikHam = parsed.raw;
    bag.kartSaatAraligi = parsed.raw;
  }

  if (parsed.kind === "range") {
    if (target === "esas") {
      bag.esasCalismaGiris = parsed.start;
      bag.esasCalismaCikis = parsed.end;
    } else {
      bag.kartGiris = parsed.start;
      bag.kartCikis = parsed.end;
    }
    if (parsed.ertesiGun) bag._ertesiGun = true;
    return;
  }

  if (parsed.kind === "izin") {
    // Mesai hücresindeki OFF/tatil kodunu İzin sütununun üzerine yazmadan biriktir.
    const codes = extractIzinKodlari(parsed.raw, codeMap);
    if (target === "esas") {
      bag._hamMesaiAciklama = parsed.raw;
      bag._mesaiKodlari = mergeDurumKodlari(bag._mesaiKodlari ?? [], codes);
    } else {
      bag._mesaiKodlari = mergeDurumKodlari(bag._mesaiKodlari ?? [], codes);
    }
    return;
  }

  if (parsed.reason === "empty") return;
  bag._aralikKontrol = true;
  bag._aralikNot =
    parsed.reason === "single"
      ? "Birleşik saat hücresinde tek saat var; giriş-çıkış ayrıştırılamadı."
      : "Birleşik saat hücresi ayrıştırılamadı; kullanıcı kontrolü gerekli.";
}

function applyMappedValue(bag: FieldBag, field: MappableFieldKey, val: string, codeMap: CodeMap): void {
  if (field === "esasCalismaSaatAraligi") {
    applyTimeRangeField(bag, "esas", val, codeMap);
    return;
  }
  if (field === "kartSaatAraligi") {
    applyTimeRangeField(bag, "kart", val, codeMap);
    return;
  }
  if (field === "izinTatilKodu") {
    bag._hamIzinAciklama = val;
    bag._izinKodlari = mergeDurumKodlari(bag._izinKodlari ?? [], extractIzinKodlari(val, codeMap));
    return;
  }
  bag[field] = val;
}

function applyDerive(src: string, rule: ColumnMapping["deriveRule"]): string {
  if (!src) return "";
  if (rule === "rangeStart") return parseTimeRange(src)?.start ?? "";
  if (rule === "rangeEnd") return parseTimeRange(src)?.end ?? "";
  return src;
}

export function applyHourPriority(fields: {
  kartGiris: string;
  kartCikis: string;
  esasGiris: string;
  esasCikis: string;
}): {
  kullanilanGiris: string;
  kullanilanCikis: string;
  girisKaynagi: HourSource;
  cikisKaynagi: HourSource;
} {
  const kg = isValidTime(fields.kartGiris) ? normalizeTimeString(fields.kartGiris) : "";
  const kc = isValidTime(fields.kartCikis) ? normalizeTimeString(fields.kartCikis) : "";
  const eg = isValidTime(fields.esasGiris) ? normalizeTimeString(fields.esasGiris) : "";
  const ec = isValidTime(fields.esasCikis) ? normalizeTimeString(fields.esasCikis) : "";

  if (kg && kc) {
    return { kullanilanGiris: kg, kullanilanCikis: kc, girisKaynagi: "kart", cikisKaynagi: "kart" };
  }
  if (kg && !kc) {
    return {
      kullanilanGiris: kg,
      kullanilanCikis: ec,
      girisKaynagi: "kart",
      cikisKaynagi: ec ? "esas" : "yok",
    };
  }
  if (!kg && kc) {
    return {
      kullanilanGiris: eg,
      kullanilanCikis: kc,
      girisKaynagi: eg ? "esas" : "yok",
      cikisKaynagi: "kart",
    };
  }
  if (eg || ec) {
    return {
      kullanilanGiris: eg,
      kullanilanCikis: ec,
      girisKaynagi: eg ? "esas" : "yok",
      cikisKaynagi: ec ? "esas" : "yok",
    };
  }
  return { kullanilanGiris: "", kullanilanCikis: "", girisKaynagi: "yok", cikisKaynagi: "yok" };
}

export function hasOffCardConflict(row: StandardRow): boolean {
  if (!rowHasOff(row)) return false;
  return !!(
    isValidTime(row.kartGiris) ||
    isValidTime(row.kartCikis) ||
    isValidTime(row.esasCalismaGiris) ||
    isValidTime(row.esasCalismaCikis) ||
    isValidTime(row.kullanilanGiris) ||
    isValidTime(row.kullanilanCikis)
  );
}

export function isOffConflictRow(row: StandardRow): boolean {
  return rowHasOff(row) && hasOffCardConflict(row);
}

export function clearOffHourFields(row: StandardRow): StandardRow {
  return {
    ...row,
    kartGiris: "",
    kartCikis: "",
    kartAralikHam: "",
    esasCalismaGiris: "",
    esasCalismaCikis: "",
    esasCalismaAralikHam: "",
    kullanilanGiris: "",
    kullanilanCikis: "",
    girisKaynagi: "yok",
    cikisKaynagi: "yok",
    ertesiGunCikis: false,
    aralikKontrolGerekli: false,
  };
}

export function resolveOffKeepOff(row: StandardRow): StandardRow {
  if (!isOffConflictRow(row)) return row;
  const kodlar = ensureDurumKodlari(row);
  if (!kodlar.includes("OFF")) kodlar.push("OFF");
  const cleared = clearOffHourFields({
    ...row,
    durumKodlari: kodlar,
    izinTatilKodu: primaryIzinKod(kodlar),
  });
  const status = computeRowStatus({ ...cleared, userEdited: false });
  const notlar = ["Kullanıcı OFF'u esas aldı", ...status.notlar.filter((n) => !n.includes("çelişiyor"))];
  return {
    ...cleared,
    userEdited: false,
    kontrolDurumu: status.status,
    durumNotlari: [...new Set(notlar)],
  };
}

/** Saatleri esas al: yalnız OFF etiketini kaldır; RAPOR vb. korunur. */
export function resolveOffKeepHours(row: StandardRow): StandardRow {
  if (!isOffConflictRow(row)) return row;
  const remaining = ensureDurumKodlari(row).filter((k) => k !== "OFF");
  const next: StandardRow = {
    ...row,
    durumKodlari: remaining,
    izinTatilKodu: primaryIzinKod(remaining),
    userEdited: false,
    aralikKontrolGerekli: false,
  };
  const status = computeRowStatus(next);
  return {
    ...next,
    kontrolDurumu: status.status,
    durumNotlari: ["Kullanıcı saatleri esas aldı; OFF sınıflandırması kaldırıldı.", ...status.notlar],
  };
}

export function resolveOffKeepOffMany(rows: StandardRow[], rowIds?: string[]): StandardRow[] {
  const idSet = rowIds ? new Set(rowIds) : null;
  return rows.map((r) => {
    if (!isOffConflictRow(r)) return r;
    if (idSet && !idSet.has(r.id)) return r;
    return resolveOffKeepOff(r);
  });
}

export function computeRowStatus(row: StandardRow): { status: ControlStatus; notlar: string[] } {
  const notlar: string[] = [...(row.durumNotlari ?? [])];
  const kodlar = ensureDurumKodlari(row);
  const kod = primaryIzinKod(kodlar.length ? kodlar : [row.izinTatilKodu]);

  if (rowHasOff(row)) {
    if (hasOffCardConflict(row)) {
      notlar.push("OFF kaydıyla kart kaydı çelişiyor; saatleri temizleyin veya sınıflandırmayı değiştirin.");
      return { status: "yellow", notlar };
    }
    const kaynak = [row.hamMesaiAciklama, row.hamIzinAciklama, row.izinTatilRaw].filter(Boolean).join(" · ");
    if (kaynak) notlar.push(`Kaynak: ${kaynak}`);
    if (kodlar.length > 1) notlar.push(`Etiketler: ${kodlar.join(", ")}`);
    if (row.userEdited) return { status: "blue", notlar };
    return { status: "purple", notlar };
  }

  if (row.userEdited) {
    return { status: "blue", notlar: row.durumNotlari ?? [] };
  }

  if (kod !== "CALISTI" && kod !== "BILINMIYOR") {
    return { status: "green", notlar };
  }

  if (kod === "BILINMIYOR" && row.izinTatilRaw) {
    notlar.push("Açıklama tanınmadı; kod seçimi gerekli.");
  }

  if (row.aralikKontrolGerekli) {
    notlar.push("Birleşik saat aralığı kullanıcı kontrolü gerektiriyor.");
  }

  const hasGiris = isValidTime(row.kullanilanGiris);
  const hasCikis = isValidTime(row.kullanilanCikis);

  if (hasGiris && hasCikis) {
    const tamamlandi = row.girisKaynagi === "esas" || row.cikisKaynagi === "esas";
    if (tamamlandi) {
      notlar.push("Eksik alan esas çalışma bilgisinden tamamlandı.");
      return { status: kod === "BILINMIYOR" ? "red" : "yellow", notlar };
    }
    return { status: kod === "BILINMIYOR" || row.aralikKontrolGerekli ? "red" : "green", notlar };
  }

  notlar.push("Hesaplama için yeterli saat bilgisi yok.");
  return { status: "red", notlar };
}

function normTime(v: string | undefined): string {
  if (!v) return "";
  return isValidTime(v) ? normalizeTimeString(v) : v;
}

export function buildStandardRow(rawRow: string[], config: TransformConfig): StandardRow {
  const bag = collectFields(rawRow, config);

  const tarihRaw = bag.tarih ?? "";
  const tarihISO = parseDateToISO(tarihRaw);

  const hours = applyHourPriority({
    kartGiris: bag.kartGiris ?? "",
    kartCikis: bag.kartCikis ?? "",
    esasGiris: bag.esasCalismaGiris ?? "",
    esasCikis: bag.esasCalismaCikis ?? "",
  });

  const hamMesai = (bag._hamMesaiAciklama ?? "").trim();
  const hamIzin = (bag._hamIzinAciklama ?? "").trim();
  const mesaiCodes = bag._mesaiKodlari ?? extractIzinKodlari(hamMesai, config.codeMap);
  const izinCodes = bag._izinKodlari ?? extractIzinKodlari(hamIzin, config.codeMap);
  const durumKodlari = mergeDurumKodlari(mesaiCodes, izinCodes);
  const kod = primaryIzinKod(durumKodlari);
  const izinRaw = [hamMesai, hamIzin].filter(Boolean).join(" · ");

  let ertesiGun = !!bag._ertesiGun;
  if (!ertesiGun && hours.kullanilanGiris && hours.kullanilanCikis) {
    const gm = parseTimeToMinutes(hours.kullanilanGiris);
    const cm = parseTimeToMinutes(hours.kullanilanCikis);
    if (gm !== null && cm !== null && cm <= gm) ertesiGun = true;
  }

  const row: StandardRow = {
    id: id("prow"),
    personelAdSoyad: (bag.personelAdSoyad ?? "").trim(),
    birim: (bag.birim ?? "").trim(),
    pozisyon: (bag.pozisyon ?? "").trim(),
    tarih: tarihISO ?? tarihRaw,
    kartGiris: normTime(bag.kartGiris),
    kartCikis: normTime(bag.kartCikis),
    kartAralikHam: bag._kartAralikHam ?? bag.kartSaatAraligi ?? "",
    esasCalismaGiris: normTime(bag.esasCalismaGiris),
    esasCalismaCikis: normTime(bag.esasCalismaCikis),
    esasCalismaAralikHam: bag._esasAralikHam ?? bag.esasCalismaSaatAraligi ?? "",
    kullanilanGiris: hours.kullanilanGiris,
    kullanilanCikis: hours.kullanilanCikis,
    girisKaynagi: hours.girisKaynagi,
    cikisKaynagi: hours.cikisKaynagi,
    izinTatilRaw: izinRaw,
    izinTatilKodu: kod,
    durumKodlari,
    hamMesaiAciklama: hamMesai,
    hamIzinAciklama: hamIzin,
    aciklama: (bag.aciklama ?? "").trim(),
    kontrolDurumu: "green",
    durumNotlari: bag._aralikNot ? [bag._aralikNot] : [],
    kaynakSayfa: Number(bag.kaynakSayfa) || config.pageNumber || 1,
    okumaGuveni: 1,
    ertesiGunCikis: ertesiGun,
    userEdited: false,
    aralikKontrolGerekli: !!bag._aralikKontrol,
  };

  if (tarihRaw && !isValidISODate(row.tarih)) {
    row.okumaGuveni = 0.5;
  }

  const status = computeRowStatus(row);
  row.kontrolDurumu = status.status;
  row.durumNotlari = status.notlar;

  if (rowHasOff(row) && !hasOffCardConflict(row)) {
    row.kartGiris = "";
    row.kartCikis = "";
    row.esasCalismaGiris = "";
    row.esasCalismaCikis = "";
    row.kullanilanGiris = "";
    row.kullanilanCikis = "";
    row.girisKaynagi = "yok";
    row.cikisKaynagi = "yok";
    row.ertesiGunCikis = false;
  }

  return row;
}

export function buildStandardRows(table: TableView, config: TransformConfig): StandardRow[] {
  const cfg: TransformConfig = { ...config, pageNumber: config.pageNumber ?? table.pageNumber };
  const out: StandardRow[] = [];
  for (let ri = 0; ri < table.rows.length; ri++) {
    const raw = table.rows[ri];
    if (raw.every((c) => (c ?? "").toString().trim() === "")) continue;
    const row = buildStandardRow(raw, cfg);
    row.kaynakSatirSira = ri;
    const hasAny =
      row.personelAdSoyad ||
      (row.tarih && row.tarih.trim()) ||
      row.kullanilanGiris ||
      row.kullanilanCikis ||
      row.izinTatilRaw ||
      row.esasCalismaAralikHam ||
      row.kartAralikHam ||
      (row.durumKodlari && row.durumKodlari.length > 0);
    if (!hasAny) continue;
    out.push(row);
  }
  return out;
}

export function groupByPersonel(rows: StandardRow[]): { key: string; label: string; rows: StandardRow[] }[] {
  const map = new Map<string, { label: string; rows: StandardRow[] }>();
  for (const r of rows) {
    const label = r.personelAdSoyad || "Belirtilmemiş";
    const key = label.toLocaleLowerCase("tr-TR").trim();
    if (!map.has(key)) map.set(key, { label, rows: [] });
    map.get(key)!.rows.push(r);
  }
  return [...map.entries()].map(([key, v]) => ({ key, label: v.label, rows: v.rows }));
}

export function recomputeEditedRow(row: StandardRow): StandardRow {
  let next: StandardRow = {
    ...row,
    durumKodlari: ensureDurumKodlari(row),
    userEdited: true,
    aralikKontrolGerekli: false,
  };

  if (rowHasOff(next) && !hasOffCardConflict(next)) {
    next = {
      ...next,
      kartGiris: "",
      kartCikis: "",
      esasCalismaGiris: "",
      esasCalismaCikis: "",
      kullanilanGiris: "",
      kullanilanCikis: "",
      girisKaynagi: "yok",
      cikisKaynagi: "yok",
      ertesiGunCikis: false,
    };
  }

  const status = computeRowStatus(next);
  next.kontrolDurumu = status.status;
  next.durumNotlari = status.notlar;
  return next;
}

/** Eski lokal satırları çoklu etiket modeline yükseltir. */
export function migrateStandardRow(row: StandardRow): StandardRow {
  const durumKodlari = ensureDurumKodlari(row);
  return {
    ...row,
    durumKodlari,
    izinTatilKodu: primaryIzinKod(durumKodlari.length ? durumKodlari : [row.izinTatilKodu]),
  };
}
