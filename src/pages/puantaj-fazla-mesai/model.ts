/**
 * Puantaj Kayıtlarına Göre Fazla Mesai — veri modeli (tip sözleşmesi).
 *
 * Bu modül mevcut fazla mesai sayfalarından, hesap motorlarından ve backend'den
 * TAMAMEN bağımsızdır. Hiçbir dosyayı `../hesaplamalar/**` içinden import etmez.
 * Tüm işlem %100 tarayıcı içinde, lokal çalışır; ağ isteği oluşturmaz.
 *
 * Bu dosya; ayrıştırma (parsing), otomatik tahmin (detect), dönüştürme
 * (transform), kod eşleme (codes), şablon deposu (templates), lokal fazla mesai
 * motoru (engine) ve wizard arayüzü (components) için ortak sözleşmedir.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * 1) Standart alanlar
 * ──────────────────────────────────────────────────────────────────────────── */

export type StandardFieldKey =
  | "personelAdSoyad"
  | "birim"
  | "pozisyon"
  | "tarih"
  | "kartGiris"
  | "kartCikis"
  | "kartSaatAraligi"
  | "esasCalismaGiris"
  | "esasCalismaCikis"
  | "esasCalismaSaatAraligi"
  | "kullanilanGiris"
  | "kullanilanCikis"
  | "izinTatilKodu"
  | "aciklama"
  | "girisKaynagi"
  | "cikisKaynagi"
  | "kontrolDurumu"
  | "kaynakSayfa"
  | "okumaGuveni";

/** Belge sütunundan doğrudan eşlenebilen alanlar (türetilen/durum alanları hariç). */
export type MappableFieldKey = Exclude<
  StandardFieldKey,
  "girisKaynagi" | "cikisKaynagi" | "kontrolDurumu" | "okumaGuveni"
>;

/** Birleşik saat aralığı eşleme hedefleri (tek sütun → giriş+çıkış). */
export type TimeRangeFieldKey = "esasCalismaSaatAraligi" | "kartSaatAraligi";

export function isTimeRangeFieldKey(key: string): key is TimeRangeFieldKey {
  return key === "esasCalismaSaatAraligi" || key === "kartSaatAraligi";
}

export type StandardFieldDef = {
  key: StandardFieldKey;
  label: string;
  /** Kullanıcının belge sütunuyla eşleyebileceği bir alan mı? */
  mappable: boolean;
  /** Otomatik sütun tahmininde kullanılan başlık anahtar kelimeleri (küçük harf). */
  keywords: string[];
  /** Kısa açıklama (tooltip/hint). */
  hint?: string;
};

/* ────────────────────────────────────────────────────────────────────────────
 * 2) İzin / tatil kodları
 * ──────────────────────────────────────────────────────────────────────────── */

export type IzinKodKey =
  | "HAFTA_TATILI"
  | "IZIN"
  | "YILLIK_IZIN"
  | "RAPOR"
  | "UBGT"
  | "OFF"
  | "CALISMADI"
  | "CALISTI"
  | "BILINMIYOR";

export const IZIN_KOD_LABELS: Record<IzinKodKey, string> = {
  HAFTA_TATILI: "Hafta Tatili",
  IZIN: "İzin",
  YILLIK_IZIN: "Yıllık İzin",
  RAPOR: "Rapor",
  UBGT: "UBGT",
  OFF: "OFF – Fazla mesai karşılığı izin",
  CALISMADI: "Çalışmadı",
  CALISTI: "Çalıştı",
  BILINMIYOR: "Tanınmıyor",
};

/** Tam OFF günü mahsup karşılığı (saat). */
export const OFF_HOURS_PER_DAY = 7.5;

/** Ham açıklama metni → izin/tatil kodu (belge/şablon bazında). */
export type CodeMap = Record<string, IzinKodKey>;

/* ────────────────────────────────────────────────────────────────────────────
 * 3) Ayrıştırma (parsing) çıktısı
 * ──────────────────────────────────────────────────────────────────────────── */

export type SourceFileKind = "excel" | "csv" | "pdf" | "unknown";

/** PDF metin katmanından gelen geometrik hücre (sütun sınırları için). */
export type ParsedGeomCell = {
  x: number;
  endX: number;
  text: string;
};

export type ParsedGeomLine = {
  y: number;
  page: number;
  cells: ParsedGeomCell[];
};

export type ParsedSheet = {
  /** Sayfa/sekme adı (Excel) veya "Sayfa 1" gibi (PDF/CSV). */
  name: string;
  /**
   * Ham satırlar (başlık dahil). PDF'de başlık seçimine göre yeniden
   * hizalanmış önizleme grid'idir; Excel/CSV'de dosyadan gelen tablo.
   */
  grid: string[][];
  /**
   * PDF için ham geometri. Sütun şeması bu satırlardan, seçilen başlık
   * satırının merkez koordinatlarıyla üretilir. Excel/CSV'de yok.
   */
  geometry?: ParsedGeomLine[];
};

export type ParsedDocument = {
  fileName: string;
  kind: SourceFileKind;
  sheets: ParsedSheet[];
  /** Ayrıştırma sırasında oluşan uyarılar (ör. OCR gerekli). */
  warnings: string[];
};

/** Başlık satırı seçildikten sonra tablo görünümü. */
export type TableView = {
  headers: string[];
  /** Her veri satırı; hücre sayısı headers ile hizalı olacak şekilde normalize. */
  rows: string[][];
  headerRowIndex: number;
  sheetName: string;
  pageNumber: number;
};

/* ────────────────────────────────────────────────────────────────────────────
 * 4) Alan eşleştirme (XML ürün aktarımı mantığı)
 * ──────────────────────────────────────────────────────────────────────────── */

export type MappingMode =
  | "field" // Standart alan seç
  | "absent" // Bu belgede yok
  | "exclude" // Hesaplamaya dahil etme
  | "constant" // Sabit değer kullan
  | "derive" // Başka alandan türet
  | "review"; // Kullanıcı kontrolüne bırak

export type ColumnMapping = {
  columnIndex: number;
  header: string;
  mode: MappingMode;
  /** mode === "field" | "derive" hedef alanı. */
  field?: MappableFieldKey;
  /** mode === "constant" değeri. */
  constantValue?: string;
  /** mode === "derive": kaynak sütun indeksi ve türetme kuralı. */
  deriveFromColumn?: number;
  deriveRule?: DeriveRule;
  /** Birleştirilmiş başlık grubunun kapsadığı fiziksel sütun indeksleri. */
  physicalIndices?: number[];
  /** Mantıksal sütun sırası (eşleştirme ekranı). */
  logicalIndex?: number;
  /** Otomatik tahmin edildi mi (kısa vurgu animasyonu için). */
  autoGuessed?: boolean;
  /** Tahmin güveni 0..1. */
  confidence?: number;
};

export type DeriveRule =
  | "rangeStart" // "08:00-17:00" → giriş
  | "rangeEnd" // "08:00-17:00" → çıkış
  | "copy"; // olduğu gibi

/* ────────────────────────────────────────────────────────────────────────────
 * 5) Saat kaynağı ve standart puantaj satırı
 * ──────────────────────────────────────────────────────────────────────────── */

export type HourSource = "kart" | "esas" | "manuel" | "yok";

export type ControlStatus = "green" | "yellow" | "red" | "blue" | "purple";

export type StandardRow = {
  id: string;
  personelAdSoyad: string;
  birim: string;
  pozisyon: string;
  /** ISO (YYYY-MM-DD) veya ham metin (ayrıştırılamadıysa). */
  tarih: string;
  kartGiris: string;
  kartCikis: string;
  /** Kart giriş-çıkış birleşik hücresinin ham değeri (varsa). */
  kartAralikHam: string;
  esasCalismaGiris: string;
  esasCalismaCikis: string;
  /** Esas çalışma birleşik hücresinin ham değeri (varsa). */
  esasCalismaAralikHam: string;
  /** Hesaplamada kullanılacak nihai saatler (öncelik kuralından türetilir). */
  kullanilanGiris: string;
  kullanilanCikis: string;
  girisKaynagi: HourSource;
  cikisKaynagi: HourSource;
  /** Ham izin/tatil açıklaması. */
  izinTatilRaw: string;
  /**
   * Gösterim / geriye uyumluluk için ana kod.
   * Hesaplama ve OFF sayımı `durumKodlari` üzerinden yapılır.
   */
  izinTatilKodu: IzinKodKey;
  /**
   * Satırdaki tüm sınıflandırma etiketleri (örn. [OFF, RAPOR]).
   * Mesai Açıklama + İzin Açıklama bağımsız sınıflandırılıp birleştirilir.
   */
  durumKodlari: IzinKodKey[];
  /** Ham Mesai Açıklama (esas çalışma aralığı hücresi). */
  hamMesaiAciklama?: string;
  /** Ham İzin Açıklama hücresi. */
  hamIzinAciklama?: string;
  aciklama: string;
  kontrolDurumu: ControlStatus;
  /** Kontrol/uyarı notları (neden sarı/kırmızı vb.). */
  durumNotlari: string[];
  kaynakSayfa: number;
  /** Kaynak tablodaki veri satırı indeksi (0 tabanlı, denetim izi). */
  kaynakSatirSira?: number;
  /** 0..1 okuma güveni (min sütun güveni). */
  okumaGuveni: number;
  /** Çıkış ertesi gün mü (gece vardiyası). */
  ertesiGunCikis: boolean;
  /** Kullanıcı bu satırı elle düzenledi mi (mavi). */
  userEdited: boolean;
  /**
   * Birleşik saat hücresi ayrıştırılamadı (tek saat / geçersiz biçim).
   * Saat tahmin edilmez; kullanıcı kontrolüne bırakılır.
   */
  aralikKontrolGerekli: boolean;
};

/* ────────────────────────────────────────────────────────────────────────────
 * 6) Şablon yönetimi (lokal)
 * ──────────────────────────────────────────────────────────────────────────── */

export type NightShiftRule = "nextDayIfEndBeforeStart" | "never";

export type MultiPageBehavior = "mergeAll" | "perPage";

export type PuantajTemplate = {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Belge parmak izi (başlık imzası) — aynı format önerisi için. */
  signature: string;
  headerRowIndex: number;
  dateFormat: string; // ör. "DD.MM.YYYY", "auto"
  timeFormat: string; // ör. "HH:mm", "auto"
  /** "08:00-17:00" gibi aralık ayrıştırma ayıracı (regex kaynağı). */
  rangeSeparator: string;
  nightShiftRule: NightShiftRule;
  mappings: ColumnMapping[];
  codeMap: CodeMap;
  /** Sabit değerler (alan → değer). */
  constants: Partial<Record<MappableFieldKey, string>>;
  hourPriorityEnabled: boolean;
  multiPageBehavior: MultiPageBehavior;
};

/* ────────────────────────────────────────────────────────────────────────────
 * 7) Hesaplama ayarları ve sonuç (cetvel + rapor)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Ara dinlenme kuralı: otomatik (yasal tablo) veya sabit saat. */
export type BreakRule =
  | { kind: "auto" }
  | { kind: "fixed"; hours: number };

export type CalcSettings = {
  /** Haftalık yasal çalışma sınırı (varsayılan 45). */
  weeklyLimit: number;
  breakRule: BreakRule;
  /** Hakkaniyet (takdiri) indirimi uygulansın mı ve oranı (ör. 1/3). */
  applyEquityDiscount: boolean;
  equityDivisor: number;
  /** Mahsup tutarı (varsa). */
  mahsup: number;
  /** OFF mahsup sayımı için hesaplama başlangıç tarihi (ISO, opsiyonel). */
  calcDateStart?: string;
  /** OFF mahsup sayımı için hesaplama bitiş tarihi (ISO, opsiyonel). */
  calcDateEnd?: string;
};

export type DailyWorkRow = {
  rowId: string;
  tarih: string;
  kullanilanGiris: string;
  kullanilanCikis: string;
  ertesiGunCikis: boolean;
  brutSaat: number;
  molaSaat: number;
  netSaat: number;
  izinTatilKodu: IzinKodKey;
  /** Çoklu sınıflandırma etiketleri (rapor/cetvel). */
  durumKodlari?: IzinKodKey[];
  girisKaynagi: HourSource;
  cikisKaynagi: HourSource;
  /** Hesaba dahil edildi mi (izin/rapor/hafta tatili çalışılmadıysa hariç). */
  dahil: boolean;
  not?: string;
};

export type WeeklyCetvelRow = {
  id: string;
  haftaBaslangicISO: string;
  haftaBitisISO: string;
  calisilanGunSayisi: number;
  netHaftalikSaat: number;
  haftalikFmSaat: number;
  asgariUcret: number | null;
  saatlikUcret: number;
  katsayi: number;
  fmTutari: number;
  not?: string;
};

export type ValidOffDay = {
  personel: string;
  tarihISO: string;
  tarihHam: string;
  kaynakSayfa: number;
  kaynakSatirSira?: number;
  standardRowId: string;
  hamMetin: string;
};

export type OffLayerKey =
  | "hamPdfMetni"
  | "tabloSatirlari"
  | "alanEslestirme"
  | "standartSatir"
  | "kullaniciKontrolu"
  | "tarihFiltresi"
  | "mahsup"
  | "rapor";

export type OffLayerCounts = Record<OffLayerKey, number>;

export type OffAuditRecord = {
  id: string;
  kaynakSayfa: number;
  kaynakSatirSira: number;
  personel: string;
  tarihHam: string;
  tarihISO: string | null;
  hamMesaiAciklama: string;
  hamIzinAciklama: string;
  normalizeMetin: string;
  offAdayi: boolean;
  /** Bulunan tüm etiketler. */
  durumKodlari: IzinKodKey[];
  sonSiniflandirma: IzinKodKey;
  mahsupaDahil: boolean;
  dahilEdilmediNedeni?: string;
  mukerrerEslesme?: { personel: string; tarih: string };
  standardRowId?: string;
  celiskili: boolean;
  saatleriEsasAlindi: boolean;
  katmanlar: Record<OffLayerKey, boolean>;
};

export type OffAuditSummary = {
  hamAdayToplam: number;
  gecerliOffGunToplam: number;
  tarihDisi: number;
  mukerrer: number;
  celiskili: number;
  tarihCozulemedi: number;
  saatleriEsasAlindi: number;
};

export type PersonelOffAudit = {
  personelAdSoyad: string;
  records: OffAuditRecord[];
  validOffDays: ValidOffDay[];
  layerCounts: OffLayerCounts;
  summary: OffAuditSummary;
  firstDivergenceLayer: OffLayerKey | null;
  firstDivergenceDetail?: string;
};

export type OffAuditReport = {
  personeller: PersonelOffAudit[];
  layerCounts: OffLayerCounts;
  firstDivergenceLayer: OffLayerKey | null;
  firstDivergenceDetail?: string;
};

export type PuantajFmResult = {
  personelAdSoyad: string;
  birim: string;
  pozisyon: string;
  dailyRows: DailyWorkRow[];
  weeklyRows: WeeklyCetvelRow[];
  /** Haftalık cetvel toplamı (OFF mahsubu öncesi). */
  hesaplananToplamFmSaat: number;
  /** OFF mahsubu sonrası nihai fazla mesai saati. */
  toplamFmSaat: number;
  /** Mahsup için doğrulanmış OFF gün listesi — sayı = uzunluk. */
  offValidatedDays: ValidOffDay[];
  offGunSayisi: number;
  offSaatKarsiligi: number;
  offMahsupSaati: number;
  toplamFmTutari: number;
  hakkaniyetIndirimi: number;
  mahsup: number;
  sonTutar: number;
  /** Rapor istatistikleri. */
  stats: {
    duzeltilenKayit: number;
    tamamlananKayit: number;
    karttanAlinanSaat: number;
    vardiyadanTamamlanan: number;
    kullaniciDegistirdi: number;
  };
  notlar: string[];
};

/* ────────────────────────────────────────────────────────────────────────────
 * 8) Wizard adımları
 * ──────────────────────────────────────────────────────────────────────────── */

export type WizardStep = "upload" | "mapping" | "review" | "calculate" | "report";

export const WIZARD_STEPS: { key: WizardStep; label: string }[] = [
  { key: "upload", label: "Dosya Yükle" },
  { key: "mapping", label: "Alanları Eşleştir" },
  { key: "review", label: "Verileri Kontrol Et" },
  { key: "calculate", label: "Hesapla" },
  { key: "report", label: "Rapor" },
];

export const REPORT_DISCLAIMER =
  "Hesaplama, yüklenen puantaj belgesinden çıkarılan ve kullanıcı tarafından kontrol edilerek onaylanan çalışma kayıtları esas alınarak hazırlanmıştır.";
