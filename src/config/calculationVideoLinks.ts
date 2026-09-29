/**
 * HESAPLAMA EĞİTİM VİDEOLARI — tek dosya.
 *
 * Bir sayfaya video eklemek için yalnız o satırın `youtubeUrl` alanına YouTube linkini yapıştırın.
 * Kabul edilen biçimler:
 *   https://www.youtube.com/watch?v=VIDEO_ID
 *   https://youtu.be/VIDEO_ID
 *   https://www.youtube.com/shorts/VIDEO_ID
 *   https://www.youtube.com/embed/VIDEO_ID
 *
 * `youtubeUrl` boş veya geçersizse o sayfada "Videoyu İzle" düğmesi görünmez.
 * `title` video penceresinin başlığıdır. `routes` sayfanın uygulama içi adresidir; değiştirmeyin.
 */

export type CalculationVideoLink = {
  title: string;
  routes: readonly string[];
  youtubeUrl: string;
};

export const calculationVideoLinks = {
  // ─── Kıdem Tazminatı ───────────────────────────────────────────────
  "kidem-is-kanunu": {
    title: "Kıdem Tazminatı — İş Kanununa Göre",
    routes: ["/kidem-tazminati/30isci"],
    youtubeUrl: "",
  },
  "kidem-borclar-kanunu": {
    title: "Kıdem Tazminatı — Borçlar Kanununa Göre",
    routes: ["/kidem-tazminati/borclar"],
    youtubeUrl: "",
  },
  "kidem-gemi-adamlari": {
    title: "Kıdem Tazminatı — Gemi Adamları",
    routes: ["/kidem-tazminati/gemi"],
    youtubeUrl: "",
  },
  "kidem-mevsimlik-isci": {
    title: "Kıdem Tazminatı — Mevsimlik İşçi",
    routes: ["/kidem-tazminati/mevsimlik"],
    youtubeUrl: "",
  },
  "kidem-basin-is": {
    title: "Kıdem Tazminatı — Basın İş",
    routes: ["/kidem-tazminati/basin"],
    youtubeUrl: "",
  },
  "kidem-kismi-sureli": {
    title: "Kıdem Tazminatı — Kısmi Süreli / Part Time",
    routes: ["/kidem-tazminati/kismi-sureli"],
    youtubeUrl: "",
  },
  "kidem-belirli-sureli": {
    title: "Kıdem Tazminatı — Belirli Süreli",
    routes: ["/kidem-tazminati/belirli-sureli"],
    youtubeUrl: "",
  },

  // ─── İhbar Tazminatı ───────────────────────────────────────────────
  "ihbar-is-kanunu": {
    title: "İhbar Tazminatı — İş Kanununa Göre",
    routes: ["/ihbar-tazminati/30isci"],
    youtubeUrl: "",
  },
  "ihbar-borclar-kanunu": {
    title: "İhbar Tazminatı — Borçlar Kanununa Göre",
    routes: ["/ihbar-tazminati/borclar"],
    youtubeUrl: "",
  },
  "ihbar-gemi-adamlari": {
    title: "İhbar Tazminatı — Gemi Adamları",
    routes: ["/ihbar-tazminati/gemi"],
    youtubeUrl: "",
  },
  "ihbar-mevsimlik-isci": {
    title: "İhbar Tazminatı — Mevsimlik İşçi",
    routes: ["/ihbar-tazminati/mevsim"],
    youtubeUrl: "",
  },
  "ihbar-basin-is": {
    title: "İhbar Tazminatı — Basın İş Kanunu",
    routes: ["/ihbar-tazminati/basin"],
    youtubeUrl: "",
  },
  "ihbar-kismi-sureli": {
    title: "İhbar Tazminatı — Kısmi Süreli",
    routes: ["/ihbar-tazminati/kismi"],
    youtubeUrl: "",
  },
  "ihbar-belirli-sureli": {
    title: "İhbar Tazminatı — Belirli Süreli",
    routes: ["/ihbar-tazminati/belirli"],
    youtubeUrl: "",
  },

  // ─── Fazla Mesai ───────────────────────────────────────────────────
  "fazla-mesai-standart": {
    title: "Fazla Mesai — Standart",
    routes: ["/fazla-mesai/standart"],
    youtubeUrl: "",
  },
  "fazla-mesai-tanikli-standart": {
    title: "Fazla Mesai — Tanıklı Standart",
    routes: ["/fazla-mesai/tanikli-standart"],
    youtubeUrl: "",
  },
  "fazla-mesai-haftalik-karma": {
    title: "Fazla Mesai — Haftalık Karma",
    routes: ["/fazla-mesai/haftalik-karma"],
    youtubeUrl: "",
  },
  "fazla-mesai-donemsel": {
    title: "Fazla Mesai — Dönemsel",
    routes: ["/fazla-mesai/donemsel"],
    youtubeUrl: "",
  },
  "fazla-mesai-donemsel-haftalik": {
    title: "Fazla Mesai — Dönemsel Haftalık",
    routes: ["/fazla-mesai/donemsel-haftalik"],
    youtubeUrl: "",
  },
  "fazla-mesai-yeralti-isci": {
    title: "Fazla Mesai — Yeraltı İşçileri",
    routes: ["/fazla-mesai/yeralti-isci"],
    youtubeUrl: "",
  },
  "fazla-mesai-vardiya-24": {
    title: "Fazla Mesai — 24 Saat Vardiya",
    routes: ["/fazla-mesai/vardiya-24"],
    youtubeUrl: "",
  },
  "fazla-mesai-vardiya-48": {
    title: "Fazla Mesai — 48 Saat Vardiya",
    routes: ["/fazla-mesai/vardiya-48"],
    youtubeUrl: "",
  },
  "fazla-mesai-gemi-adami-gunluk": {
    title: "Fazla Mesai — Gemi Adamı Günlük",
    routes: ["/fazla-mesai/gemi-adami-gunluk"],
    youtubeUrl: "",
  },
  "fazla-mesai-gemi-adami-7-24": {
    title: "Fazla Mesai — Gemi Adamı 7/24",
    routes: ["/fazla-mesai/gemi-adami-7-24"],
    youtubeUrl: "",
  },
  "fazla-mesai-ev-isci": {
    title: "Fazla Mesai — Ev İşçileri",
    routes: ["/fazla-mesai/ev-isci"],
    youtubeUrl: "",
  },
  "fazla-mesai-puantaj": {
    title: "Fazla Mesai — Puantaj Kayıtlarına Göre",
    routes: ["/fazla-mesai/puantaj"],
    youtubeUrl: "",
  },

  // ─── Yıllık Ücretli İzin ───────────────────────────────────────────
  "yillik-izin-is-kanunu": {
    title: "Yıllık İzin — İş Kanununa Göre",
    routes: ["/yillik-izin/standart"],
    youtubeUrl: "",
  },
  "yillik-izin-borclar-kanunu": {
    title: "Yıllık İzin — Borçlar Kanununa Göre",
    routes: ["/yillik-izin/borclar"],
    youtubeUrl: "",
  },
  "yillik-izin-gemi-adamlari": {
    title: "Yıllık İzin — Gemi Adamları",
    routes: ["/yillik-izin/gemi"],
    youtubeUrl: "",
  },
  "yillik-izin-mevsimlik-isci": {
    title: "Yıllık İzin — Mevsimlik İşçi",
    routes: ["/yillik-izin/mevsim"],
    youtubeUrl: "",
  },
  "yillik-izin-basin-gunluk-gazete": {
    title: "Yıllık İzin — Basın (Günlük Gazete)",
    routes: ["/yillik-izin/basin"],
    youtubeUrl: "",
  },
  "yillik-izin-basin-gunluk-olmayan": {
    title: "Yıllık İzin — Basın (Günlük Olmayan)",
    routes: ["/yillik-izin/basin/gunluk-olmayan"],
    youtubeUrl: "",
  },
  "yillik-izin-kismi-sureli": {
    title: "Yıllık İzin — Kısmi Süreli",
    routes: ["/yillik-izin/kismi"],
    youtubeUrl: "",
  },
  "yillik-izin-belirli-sureli": {
    title: "Yıllık İzin — Belirli Süreli",
    routes: ["/yillik-izin/belirli"],
    youtubeUrl: "",
  },

  // ─── UBGT ──────────────────────────────────────────────────────────
  "ubgt-standart": {
    title: "UBGT Alacağı — Standart",
    routes: ["/ubgt/alacagi"],
    youtubeUrl: "",
  },
  "ubgt-bilirkisi": {
    title: "UBGT Alacağı — Bilirkişi",
    routes: ["/ubgt/bilirkisi"],
    youtubeUrl: "",
  },

  // ─── Hafta Tatili ──────────────────────────────────────────────────
  "hafta-tatili-standart": {
    title: "Hafta Tatili — Standart",
    routes: ["/hafta-tatili/standard"],
    youtubeUrl: "",
  },
  "hafta-tatili-gemi-adamlari": {
    title: "Hafta Tatili — Gemi Adamları",
    routes: ["/hafta-tatili/gemi-adami"],
    youtubeUrl: "",
  },
  "hafta-tatili-basin-is": {
    title: "Hafta Tatili — Basın İş",
    routes: ["/hafta-tatili/basin-is"],
    youtubeUrl: "",
  },

  // ─── Diğer alacak ve tazminatlar ───────────────────────────────────
  "ucret-alacagi": {
    title: "Ücret Alacağı",
    routes: ["/ucret-alacagi"],
    youtubeUrl: "",
  },
  "bakiye-ucret-alacagi": {
    title: "Bakiye Ücret Alacağı",
    routes: ["/bakiye-ucret-alacagi"],
    youtubeUrl: "",
  },
  "davaci-ucreti": {
    title: "Davacı Ücreti",
    routes: ["/davaci-ucreti"],
    youtubeUrl: "",
  },
  "bosta-gecen-sure-ucreti": {
    title: "Boşta Geçen Süre Ücreti",
    routes: ["/bosta-gecen-sure-ucreti"],
    youtubeUrl: "",
  },
  "ise-baslatmama-tazminati": {
    title: "İşe Başlatmama Tazminatı",
    routes: ["/ise-almama-tazminati"],
    youtubeUrl: "",
  },
  "haksiz-fesih-tazminati": {
    title: "Haksız Fesih Tazminatı",
    routes: ["/haksiz-fesih-tazminati"],
    youtubeUrl: "",
  },
  "kotu-niyet-tazminati": {
    title: "Kötü Niyet Tazminatı",
    routes: ["/kotu-niyet-tazminati"],
    youtubeUrl: "",
  },
  "is-arama-izni-ucreti": {
    title: "İş Arama İzni Ücreti",
    routes: ["/is-arama-izni-ucreti"],
    youtubeUrl: "",
  },
  "ayrimcilik-tazminati": {
    title: "Ayrımcılık Tazminatı",
    routes: ["/ayrimcilik-tazminati"],
    youtubeUrl: "",
  },
  "prim-alacagi": {
    title: "Prim Alacağı",
    routes: ["/prim-alacagi"],
    youtubeUrl: "",
  },

  // ─── İcra Takip Brütten Nete ───────────────────────────────────────
  "icra-damga-vergisi-kesintili": {
    title: "İcra Takip — Damga Vergisi Kesintili",
    routes: ["/icra-takip-brutten-nete/damga-vergisi-kesintili"],
    youtubeUrl: "",
  },
  "icra-gelir-ve-damga-vergisi-kesintili": {
    title: "İcra Takip — Gelir ve Damga Vergisi Kesintili",
    routes: ["/icra-takip-brutten-nete/gelir-ve-damga-vergisi-kesintili"],
    youtubeUrl: "",
  },
  "icra-istisnali-full-kesintili": {
    title: "İcra Takip — İstisnalı Full Kesintili",
    routes: ["/icra-takip-brutten-nete/istisnali-full-kesintili"],
    youtubeUrl: "",
  },
  "icra-istisnasiz-full-kesintili": {
    title: "İcra Takip — İstisnasız Full Kesintili",
    routes: ["/icra-takip-brutten-nete/istisnasiz-full-kesintili"],
    youtubeUrl: "",
  },
} as const satisfies Record<string, CalculationVideoLink>;

export type CalculationVideoPageKey = keyof typeof calculationVideoLinks;
