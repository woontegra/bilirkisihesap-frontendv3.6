// calculateOvertimeWith270AndLimitation.ts
// AMAÇ:
// - İşe giriş yılı SABİT (işe giriş tarihi → +1 yıl -1 gün)
// - 270 saat düşümü ROUND ile yapılır
// - Zamanaşımı SADECE kırpar, 270'i etkilemez
// - Yıllık izin düşümü EN SON (gün/7 + ROUND)
// - Frontend tablo satırları FM HESAPLAMAZ, sadece GÖSTERİR
// - Negatif hafta çıkmaz, satırlar arası kaydırma yok

type TabloSatiri = {
  baslangic: Date
  bitis: Date
}

type YillikIzin = {
  baslangic: Date
  bitis: Date
  gunSayisi: number
}

type SonucSatiri = {
  baslangic: Date
  bitis: Date
  fmHafta: number
}

type HireYearFM = {
  baslangic: Date
  bitis: Date
  fmBaslangic: Date // 270 sonrası FM başlangıcı
  fmBitis: Date
  fmHafta: number
}

export function calculateOvertimeWith270AndLimitation(params: {
  iseGirisTarihi: Date
  istenCikisTarihi: Date
  haftalikFazlaMesaiSaati: number
  zamanaSimiTarihi?: Date
  yillikIzinler?: YillikIzin[]
  tabloSatirlari: TabloSatiri[]
}): SonucSatiri[] {
  const {
    iseGirisTarihi,
    istenCikisTarihi,
    haftalikFazlaMesaiSaati,
    zamanaSimiTarihi,
    yillikIzinler,
    tabloSatirlari,
  } = params

  const GUN = 24 * 60 * 60 * 1000
  const HAFTA = 7 * GUN

  // 270 saat düşümü → MATEMATİKSEL YUVARLAMA
  const dusulecekHafta = Math.round(270 / haftalikFazlaMesaiSaati)

  // ========================================
  // ADIM 1: HIRE-YEAR PERIYOTLARINI OLUŞTUR VE FM HESAPLA
  // ========================================
  const hireYearFMs: HireYearFM[] = []
  
  let yilBaslangic = new Date(iseGirisTarihi)

  while (yilBaslangic <= istenCikisTarihi) {
    const yilBitis = new Date(yilBaslangic)
    yilBitis.setFullYear(yilBitis.getFullYear() + 1)
    yilBitis.setDate(yilBitis.getDate() - 1)

    const fiiliYilBitis = yilBitis > istenCikisTarihi ? istenCikisTarihi : yilBitis

    // Bu hire-year'da toplam kaç hafta var?
    const toplamHafta = Math.floor(
      (fiiliYilBitis.getTime() - yilBaslangic.getTime() + GUN) / HAFTA,
    )

    // 270 düşümü sonrası kalan FM haftası
    const hireYearFM = Math.max(0, toplamHafta - dusulecekHafta)

    // FM başlangıç tarihi: geriden hesapla (bitiş - kalan hafta). Hafta gün hesabıyla simetrik olsun; milisaniye kaydırma 1 hafta kayması yapmasın.
    const fmBaslangic = new Date(fiiliYilBitis.getTime() - hireYearFM * HAFTA)

    // Zamanaşımı uygulanacaksa
    let fmFiiliBaslangic = fmBaslangic
    let fmFiiliBitis = fiiliYilBitis
    let fmFiiliHafta = hireYearFM

    if (zamanaSimiTarihi) {
      if (zamanaSimiTarihi > fiiliYilBitis) {
        // Bu hire-year tamamen zamanaşımı
        fmFiiliHafta = 0
      } else if (zamanaSimiTarihi > fmBaslangic) {
        // Zamanaşımı FM başlangıcından sonra
        fmFiiliBaslangic = zamanaSimiTarihi
        // Zamanaşımı sonrası kalan hafta
        fmFiiliHafta = Math.floor(
          (fmFiiliBitis.getTime() - fmFiiliBaslangic.getTime() + GUN) / HAFTA,
        )
        fmFiiliHafta = Math.max(0, Math.min(fmFiiliHafta, hireYearFM))
      }
    }

    if (fmFiiliHafta > 0) {
      hireYearFMs.push({
        baslangic: yilBaslangic,
        bitis: fiiliYilBitis,
        fmBaslangic: fmFiiliBaslangic,
        fmBitis: fmFiiliBitis,
        fmHafta: fmFiiliHafta,
      })
    }

    yilBaslangic.setFullYear(yilBaslangic.getFullYear() + 1)
  }

  // ========================================
  // ADIM 2: HIRE-YEAR FM'LERİNİ TABLO SATIRLARINA DAĞIT
  // GÜN ORANI ile dağıt (diffWeeks KULLANMA!)
  // ========================================
  const sonuc: SonucSatiri[] = tabloSatirlari.map(s => ({
    baslangic: s.baslangic,
    bitis: s.bitis,
    fmHafta: 0,
  }))

  for (const hireYear of hireYearFMs) {
    let yazilanToplam = 0

    // Hire-year'ın toplam gün sayısı
    const hireYearGun = hireYear.fmBitis.getTime() - hireYear.fmBaslangic.getTime()

    for (const satir of sonuc) {
      if (yazilanToplam >= hireYear.fmHafta) break

      // Kesişim kontrolü: FM dönemi ile tablo satırı
      const kesisimBaslangic = hireYear.fmBaslangic > satir.baslangic 
        ? hireYear.fmBaslangic 
        : satir.baslangic
      
      const kesisimBitis = hireYear.fmBitis < satir.bitis 
        ? hireYear.fmBitis 
        : satir.bitis

      if (kesisimBaslangic > kesisimBitis) continue

      // Bu satırın hire-year içindeki gün sayısı
      const satirGun = kesisimBitis.getTime() - kesisimBaslangic.getTime()

      if (satirGun > 0 && hireYearGun > 0) {
        // GÜN ORANI ile FM dağıt
        const oran = satirGun / hireYearGun
        let eklenecek = Math.round(hireYear.fmHafta * oran)
        
        // Toplam hire-year FM'ini geçme
        eklenecek = Math.min(eklenecek, hireYear.fmHafta - yazilanToplam)
        
        if (eklenecek > 0) {
          satir.fmHafta += eklenecek
          yazilanToplam += eklenecek
        }
      }
    }
  }

  // ========================================
  // ADIM 3: YILLIK İZİN DÜŞÜMÜ (EN SON, /7 + ROUND)
  // ========================================
  if (yillikIzinler && yillikIzinler.length > 0) {
    for (const satir of sonuc) {
      if (satir.fmHafta <= 0) continue

      let toplamIzinGun = 0

      for (const izin of yillikIzinler) {
        const kesisimBaslangic = izin.baslangic > satir.baslangic 
          ? izin.baslangic 
          : satir.baslangic
        
        const kesisimBitis = izin.bitis < satir.bitis 
          ? izin.bitis 
          : satir.bitis

        if (kesisimBaslangic <= kesisimBitis) {
          toplamIzinGun += izin.gunSayisi
        }
      }

      if (toplamIzinGun > 0) {
        const dusulecekIzinHafta = Math.round(toplamIzinGun / 7)
        satir.fmHafta = Math.max(0, satir.fmHafta - dusulecekIzinHafta)
      }
    }
  }

  return sonuc
}
