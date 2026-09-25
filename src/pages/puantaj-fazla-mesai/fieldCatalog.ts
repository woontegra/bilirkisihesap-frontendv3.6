import type { MappableFieldKey, StandardFieldDef, StandardFieldKey } from "./model";

/**
 * Standart puantaj alanları ve otomatik sütun tahmini için anahtar kelimeler.
 * Anahtar kelimeler küçük harf ve Türkçe karakter normalizasyonu sonrası eşleşir.
 */
export const STANDARD_FIELDS: StandardFieldDef[] = [
  {
    key: "personelAdSoyad",
    label: "Personel",
    mappable: true,
    keywords: ["adi soyadi", "ad soyad", "personel", "isim", "calisan", "ad-soyad", "adsoyad", "sicil adi"],
    hint: "Personelin ad soyadı.",
  },
  {
    key: "birim",
    label: "Birim",
    mappable: true,
    keywords: ["birim", "bolum", "departman", "kisim", "unite"],
  },
  {
    key: "pozisyon",
    label: "Pozisyon",
    mappable: true,
    keywords: ["pozisyon", "gorev", "unvan", "kadro"],
  },
  {
    key: "tarih",
    label: "Tarih",
    mappable: true,
    keywords: ["tarih", "gun", "mesai tarihi", "date", "puantaj tarihi"],
    hint: "Mesai tarihi (gün).",
  },
  {
    key: "kartGiris",
    label: "Kart Giriş",
    mappable: true,
    keywords: ["giris", "kart giris", "giris saati", "gelis", "in", "baslangic"],
  },
  {
    key: "kartCikis",
    label: "Kart Çıkış",
    mappable: true,
    keywords: ["cikis", "kart cikis", "cikis saati", "ayrilis", "out", "bitis"],
  },
  {
    key: "kartSaatAraligi",
    label: "Kart Giriş-Çıkış Saat Aralığı",
    mappable: true,
    keywords: ["kart saat", "kart aralik", "giris cikis", "giris-cikis", "kart mesai"],
    hint: "Tek hücredeki kart giriş–çıkış aralığı (örn. 08:30-17:00). Aynı sütunu iki kez eşleştirmeniz gerekmez.",
  },
  {
    key: "esasCalismaGiris",
    label: "Esas Çalışma Giriş",
    mappable: true,
    keywords: ["esas giris", "mesai giris", "planlanan giris", "vardiya giris"],
    hint: "Ayrı sütundaki esas/vardiya giriş saati.",
  },
  {
    key: "esasCalismaCikis",
    label: "Esas Çalışma Çıkış",
    mappable: true,
    keywords: ["esas cikis", "mesai cikis", "planlanan cikis", "vardiya cikis"],
    hint: "Ayrı sütundaki esas/vardiya çıkış saati.",
  },
  {
    key: "esasCalismaSaatAraligi",
    label: "Esas Çalışma Saat Aralığı",
    mappable: true,
    keywords: [
      "mesai aciklama",
      "esas calisma",
      "esas saat",
      "saat araligi",
      "vardiya saati",
      "vardiya aralik",
      "calisma saati",
    ],
    hint: "Tek hücredeki esas/vardiya aralığı (örn. 08:30-15:00 veya 20:30-08:30). Tatil koduysa izin olarak sınıflandırılır.",
  },
  {
    key: "kullanilanGiris",
    label: "Kullanılan Giriş",
    mappable: true,
    keywords: ["kullanilan giris"],
    hint: "Hesaplamada kullanılacak giriş saati (otomatik türetilir).",
  },
  {
    key: "kullanilanCikis",
    label: "Kullanılan Çıkış",
    mappable: true,
    keywords: ["kullanilan cikis"],
    hint: "Hesaplamada kullanılacak çıkış saati (otomatik türetilir).",
  },
  {
    key: "izinTatilKodu",
    label: "İzin / Tatil / Rapor",
    mappable: true,
    keywords: ["izin aciklama", "izin", "tatil", "rapor", "aciklama izin", "durum", "devamsizlik"],
    hint: "İzin / rapor / hafta tatili açıklaması.",
  },
  {
    key: "aciklama",
    label: "Açıklama",
    mappable: true,
    keywords: ["aciklama", "not", "detay", "aciklamalar"],
  },
  {
    key: "kaynakSayfa",
    label: "Kaynak Sayfa",
    mappable: true,
    keywords: ["sayfa", "kaynak sayfa", "page"],
  },
  // Türetilen / sistem alanları (belge sütunuyla doğrudan eşlenmez):
  { key: "girisKaynagi", label: "Giriş Kaynağı", mappable: false, keywords: [] },
  { key: "cikisKaynagi", label: "Çıkış Kaynağı", mappable: false, keywords: [] },
  { key: "kontrolDurumu", label: "Kontrol Durumu", mappable: false, keywords: [] },
  { key: "okumaGuveni", label: "Okuma Güveni", mappable: false, keywords: [] },
];

export const MAPPABLE_FIELDS: StandardFieldDef[] = STANDARD_FIELDS.filter((f) => f.mappable);

export function fieldLabel(key: StandardFieldKey): string {
  return STANDARD_FIELDS.find((f) => f.key === key)?.label ?? key;
}

export function isMappableField(key: string): key is MappableFieldKey {
  return MAPPABLE_FIELDS.some((f) => f.key === key);
}
