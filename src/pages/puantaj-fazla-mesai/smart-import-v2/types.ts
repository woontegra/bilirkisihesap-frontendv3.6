import type { MappableFieldKey } from "../model";

export type CanonicalAttendanceStatus = "WORK" | "OFF" | "WEEKLY_REST" | "LEAVE" | "UNKNOWN";

export type CanonicalAttendanceRow = {
  employeeName?: string;
  department?: string;
  position?: string;
  employeeId?: string;
  workDate?: string;
  actualEntry?: string;
  actualExit?: string;
  plannedEntry?: string;
  plannedExit?: string;
  plannedShiftText?: string;
  leaveText?: string;
  breakMinutes?: number;
  status?: CanonicalAttendanceStatus;
  sourceSheet: string;
  sourceRow: number;
  sourceSegment: number;
  rawValues: unknown[];
};

export type SmartFieldRole =
  | "employeeName"
  | "department"
  | "position"
  | "employeeId"
  | "workDate"
  | "actualEntry"
  | "actualExit"
  | "plannedEntry"
  | "plannedExit"
  | "plannedShiftText"
  | "leaveText"
  | "breakMinutes"
  | "unknown";

export type ConfidenceTier = "auto" | "review" | "manual";

export type LogicalColumnGroup = {
  index: number;
  physicalIndices: number[];
  headerText: string;
  segmentIndex: number;
  isTextIdentity: boolean;
};

export type ColumnClassification = {
  role: SmartFieldRole;
  confidence: number;
  tier: ConfidenceTier;
  reasons: string[];
  headerScore: number;
  contentScore: number;
  neighborScore: number;
  continuityScore: number;
  duplicateOf?: number;
};

export type LayoutSegment = {
  index: number;
  startRow: number;
  endRow: number;
  signature: string;
  logicalColumns: LogicalColumnGroup[];
  classifications: ColumnClassification[];
};

export type SmartImportProposal = {
  logicalColumnIndex: number;
  sampleValue: string;
  targetField: MappableFieldKey | null;
  targetLabel: string;
  physicalColumns: string;
  segmentIndex: number;
  confidence: number;
  tier: ConfidenceTier;
  reasons: string[];
  headerText: string;
};

export type SmartImportAnalysis = {
  ok: boolean;
  error?: string;
  headerRowIndex: number;
  segmentCount: number;
  dataRowCount: number;
  proposals: SmartImportProposal[];
  canonicalRows: CanonicalAttendanceRow[];
  segments: LayoutSegment[];
  stats: {
    autoMatched: number;
    needsReview: number;
    lowConfidence: number;
  };
  fingerprint: string;
  duplicateColumns: { primary: number; duplicate: number; segmentIndex: number }[];
};

export const HEADER_SYNONYMS: Record<SmartFieldRole, string[]> = {
  employeeName: [
    "adi soyadi",
    "ad soyad",
    "personel",
    "personel adi",
    "calisan",
    "sicil adi",
    "isim",
    "adsoyad",
  ],
  department: ["birim", "bolum", "departman", "kisim", "unite"],
  position: ["pozisyon", "gorev", "unvan", "kadro"],
  employeeId: ["sicil", "sicil no", "personel no", "kart no", "id"],
  workDate: ["mesai tarihi", "tarih", "calisma tarihi", "hareket tarihi", "gun", "date"],
  actualEntry: ["giris", "giris saati", "ilk giris", "kart giris", "ise giris", "gelis"],
  actualExit: ["cikis", "cikis saati", "son cikis", "kart cikis", "isten cikis", "ayrilis"],
  plannedEntry: ["planlanan giris", "esas giris", "vardiya giris", "mesai giris"],
  plannedExit: ["planlanan cikis", "esas cikis", "vardiya cikis", "mesai cikis"],
  plannedShiftText: [
    "mesai aciklama",
    "vardiya",
    "planlanan vardiya",
    "calisma plani",
    "mesai plani",
    "saat araligi",
    "vardiya saati",
  ],
  leaveText: ["izin aciklama", "izin", "aciklama", "gun durumu", "tatil", "rapor"],
  breakMinutes: ["mola", "ara dinlenme", "dinlenme"],
  unknown: [],
};

export const ROLE_TO_MAPPABLE: Partial<Record<SmartFieldRole, MappableFieldKey>> = {
  employeeName: "personelAdSoyad",
  department: "birim",
  position: "pozisyon",
  employeeId: "personelAdSoyad",
  workDate: "tarih",
  actualEntry: "kartGiris",
  actualExit: "kartCikis",
  plannedEntry: "esasCalismaGiris",
  plannedExit: "esasCalismaCikis",
  plannedShiftText: "esasCalismaSaatAraligi",
  leaveText: "izinTatilKodu",
};

export const ROLE_LABELS: Record<SmartFieldRole, string> = {
  employeeName: "Adı Soyadı",
  department: "Birim",
  position: "Pozisyon",
  employeeId: "Sicil",
  workDate: "Mesai Tarihi",
  actualEntry: "Giriş",
  actualExit: "Çıkış",
  plannedEntry: "Planlanan Giriş",
  plannedExit: "Planlanan Çıkış",
  plannedShiftText: "Planlanan Vardiya",
  leaveText: "İzin Açıklaması",
  breakMinutes: "Mola",
  unknown: "Bilinmiyor",
};
