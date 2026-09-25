/**
 * Kıdem Tazminatı — Belirli Süreli İş Sözleşmesi mevzuat metni.
 * Kaynak: frontendV3/src/calculations/kidem-tazminati/KidemBelirliSureliPage.tsx (birebir).
 */

export type LegalBlockKind = "p" | "indent" | "closing";

export type LegalBlock = {
  id: string;
  kind: LegalBlockKind;
  text: string;
};

export type SectionTone = "sky" | "amber" | "violet" | "teal" | "rose";

export type MevzuatSection =
  | {
      id: string;
      layout: "card";
      tone: SectionTone;
      title: string;
      subtitle: string;
      blocks: LegalBlock[];
    }
  | {
      id: string;
      layout: "grounds";
      title: string;
      desc: string;
      intro: string;
      listItems: string[];
      closing: string;
    }
  | {
      id: string;
      layout: "conclusion";
      title: string;
      blocks: LegalBlock[];
      emphasis: string;
    };

export const MEVZUAT_SECTIONS: MevzuatSection[] = [
  {
    id: "ik11",
    layout: "card",
    tone: "sky",
    title: "4857 s. İş Kanunu — Madde 11",
    subtitle: "Belirli ve belirsiz süreli iş sözleşmesi",
    blocks: [
      {
        id: "ik11-1",
        kind: "p",
        text: '4857 s. İş K. "Belirli ve belirsiz süreli iş sözleşmesi" başlıklı 11. Maddesinde; "İş ilişkisinin bir süreye bağlı olarak yapılmadığı halde sözleşme belirsiz süreli sayılır. Belirli süreli işlerde veya belli bir işin tamamlanması veya belirli bir olgunun ortaya çıkması gibi objektif koşullara bağlı olarak işveren ile işçi arasında yazılı şekilde yapılan iş sözleşmesi belirli süreli iş sözleşmesidir.',
      },
      {
        id: "ik11-2",
        kind: "p",
        text: "Belirli süreli iş sözleşmesi, esaslı bir neden olmadıkça, birden fazla üst üste (zincirleme) yapılamaz. Aksi halde iş sözleşmesi başlangıçtan itibaren belirsiz süreli kabul edilir.",
      },
      {
        id: "ik11-3",
        kind: "closing",
        text: 'Esaslı nedene dayalı zincirleme iş sözleşmeleri, belirli süreli olma özelliğini korurlar." Şeklinde düzenlenmiştir.',
      },
    ],
  },
  {
    id: "ik12",
    layout: "card",
    tone: "violet",
    title: "4857 s. İş Kanunu — Madde 12",
    subtitle: "Belirli ve belirsiz süreli iş sözleşmesi ayırımının sınırları",
    blocks: [
      {
        id: "ik12-1",
        kind: "p",
        text: '4857 s. İş K. "Belirli ve belirsiz süreli iş sözleşmesi ayırımın sınırları" başlıklı 12. Maddesinde; "Belirli süreli iş sözleşmesi ile çalıştırılan işçi, ayırımı haklı kılan bir neden olmadıkça, salt iş sözleşmesinin süreli olmasından dolayı belirsiz süreli iş sözleşmesiyle çalıştırılan emsal işçiye göre farklı işleme tâbi tutulamaz.',
      },
      {
        id: "ik12-2",
        kind: "p",
        text: "Belirli süreli iş sözleşmesi ile çalışan işçiye, belirli bir zaman ölçüt alınarak ödenecek ücret ve paraya ilişkin bölünebilir menfaatler, işçinin çalıştığı süreye orantılı olarak verilir. Herhangi bir çalışma şartından yararlanmak için aynı işyeri veya işletmede geçirilen kıdem arandığında belirli süreli iş sözleşmesine göre çalışan işçi için farklı kıdem uygulanmasını haklı gösteren bir neden olmadıkça, belirsiz süreli iş sözleşmesi ile çalışan emsal işçi hakkında esas alınan kıdem uygulanır.",
      },
      {
        id: "ik12-3",
        kind: "closing",
        text: 'Emsal işçi, işyerinde aynı veya benzeri işte belirsiz süreli iş sözleşmesiyle çalıştırılan işçidir. İşyerinde böyle bir işçi bulunmadığı takdirde, o işkolunda şartlara uygun bir işyerinde aynı veya benzer işi üstlenen belirsiz süreli iş sözleşmesiyle çalıştırılan işçi dikkate alınır." Şeklinde düzenlenmiştir.',
      },
    ],
  },
  {
    id: "k14-haller",
    layout: "grounds",
    title: "1475 sayılı Kanun m.14 — Kıdem tazminatı hâlleri",
    desc: "Hizmet akdi aşağıdaki sebeplerden biriyle sona eren işçiye, çalıştığı her tam yıl için 30 günlük ücreti tutarında kıdem tazminatı ödenir.",
    intro:
      '1475 s. İş Kanunun (22.05.2003 tarihli 4857 s. İş Kanunun 120. Maddesi ile 14. Maddesi hariç diğer maddeleri yürürlükten kaldırılmıştır.) "Kıdem tazminatı" başlıklı 14. Maddesi; "(Değişik birinci fıkra: 29/7/1983 - 2869/3 md.) Bu Kanuna tabi işçilerin hizmet akitlerinin:',
    listItems: [
      "1. İşveren tarafından bu Kanunun 17 nci maddesinin II numaralı bendinde gösterilen sebepler dışında,",
      "2. İşçi tarafından bu Kanunun 16 ncı maddesi uyarınca,",
      "3. Muvazzaf askerlik hizmeti dolayısıyle,",
      "4. Bağlı bulundukları kanunla veya Cumhurbaşkanlığı kararnamesiyle kurulu kurum veya sandıklardan yaşlılık, emeklilik veya malullük aylığı yahut toptan ödeme almak amacıyla;",
      "5. (Ek: 25/8/1999 - 4447/45 md.) 506 Sayılı Kanunun 60 ıncı maddesinin birinci fıkrasının (A) bendinin (a) ve (b) alt bentlerinde öngörülen yaşlar dışında kalan diğer şartları veya aynı Kanunun Geçici 81 inci maddesine göre yaşlılık aylığı bağlanması için öngörülen sigortalılık süresini ve prim ödeme gün sayısını tamamlayarak kendi istekleri ile işten ayrılmaları nedeniyle,",
    ],
    closing:
      "Feshedilmesi veya kadının evlendiği tarihten itibaren bir yıl içerisinde kendi arzusu ile sona erdirmesi veya işçinin ölümü sebebiyle son bulması hallerinde işçinin işe başladığı tarihten itibaren hizmet aktinin devamı süresince her geçen tam yıl için işverence işçiye 30 günlük ücreti tutarında kıdem tazminatı ödenir. Bir yıldan artan süreler için de aynı oran üzerinden ödeme yapılır.",
  },
  {
    id: "k14-kidem",
    layout: "card",
    tone: "teal",
    title: "1475 s. Kanun m.14 — Kıdem hesabı ve işyeri devri",
    subtitle: "Kıdem süresinin hesaplanması",
    blocks: [
      { id: "k14-degisik-1", kind: "p", text: "(Değişik fıkralar: 17/10/1980 - 2320/1 md.):" },
      {
        id: "k14-kidem",
        kind: "p",
        text: "İşçilerin kıdemleri, hizmet akdinin devam etmiş veya fasılalarla yeniden akdedilmiş olmasına bakılmaksızın aynı işverenin bir veya değişik işyerlerinde çalıştıkları süreler gözönüne alınarak hesaplanır. İşyerlerinin devir veya intikali yahut herhangi bir suretle bir işverenden başka bir işverene geçmesi veya başka bir yere nakli halinde işçinin kıdemi, işyeri veya işyerlerindeki hizmet akitleri sürelerinin toplamı üzerinden hesaplanır. 12/7/1975 tarihinden, itibaren işyerinin devri veya herhangi bir suretle el değiştirmesi halinde işlemiş kıdem tazminatlarından her iki işveren sorumludur. Ancak, işyerini devreden işverenlerin bu sorumlulukları işçiyi çalıştırdıkları sürelerle ve devir esnasındaki işçinin aldığı ücret seviyesiyle sınırlıdır. 12/7/1975 tarihinden evvel işyeri devrolmuş veya herhangi bir suretle el değiştirmişse devir mukavelesinde aksine bir hüküm yoksa işlemiş kıdem tazminatlarından yeni işveren sorumludur.",
      },
    ],
  },
  {
    id: "k14-kamu",
    layout: "card",
    tone: "sky",
    title: "1475 s. Kanun m.14 — Kamu kuruluşları ve belgeleme",
    subtitle: "Emeklilik, kamu hizmeti ve istisnalar",
    blocks: [
      {
        id: "k14-belge",
        kind: "p",
        text: "İşçinin birinci bendin 4 üncü fıkrası hükmünden faydalanabilmesi için aylık veya toptan ödemeye hak kazanmış bulunduğunu ve kendisine aylık bağlanması veya toptan ödeme yapılması için yaşlılık sigortası bakımından bağlı bulunduğu kuruma veya sandığa müracaat etmiş olduğunu belgelemesi şarttır. İşçinin ölümü halinde bu şart aranmaz.",
      },
      {
        id: "k14-kamu",
        kind: "p",
        text: "T.C. Emekli Sandığı Kanunu ve Sosyal Sigortalar Kanununa veya yalnız Sosyal Sigortalar Kanununa tabi olarak sadece aynı ya da değişik kamu kuruluşlarında geçen hizmet sürelerinin birleştirilmesi suretiyle Sosyal Sigortalar Kanununa göre yaşlılık veya malullük aylığına ya da toptan ödemeye hak kazanmış işçiye, bu kamu kuruluşlarında geçirdiği hizmet sürelerinin toplamı üzerinden son kamu kuruluşu işverenince kıdem tazminatı ödenir.",
      },
      {
        id: "k14-onceki",
        kind: "p",
        text: "Yukarıda belirtilen kamu kuruluşlarında işçinin hizmet akdinin evvelce bu maddeye göre kıdem tazminatı ödenmesini gerektirmeyecek şekilde sona ermesi suretiyle geçen hizmet süreleri kıdem tazminatının hesabında dikkate alınmaz.",
      },
      {
        id: "k14-emekli",
        kind: "p",
        text: "Ancak, bu tazminatın T.C. Emekli Sandığına tabi olarak geçen hizmet süresine ait kısmı için ödenecek miktar, yaşlılık veya malullük aylığının başlangıç tarihinde T.C. Emekli Sandığı Kanununun yürürlükteki hükümlerine göre emeklilik ikramiyesi için öngörülen miktardan fazla olamaz.",
      },
      {
        id: "k14-deyim",
        kind: "p",
        text: "Bu maddede geçen kamu kuruluşları deyimi, genel, katma ve özel bütçeli idareler ile 468 sayılı Kanunun 4 üncü maddesinde sayılan kurumları kapsar.",
      },
      {
        id: "k14-tek",
        kind: "p",
        text: "Aynı kıdem süresi için bir defadan fazla kıdem tazminatı veya ikramiye ödenmez.",
      },
    ],
  },
  {
    id: "k14-ucret",
    layout: "card",
    tone: "amber",
    title: "1475 s. Kanun m.14 — Ücret, menfaatler ve diğer hükümler",
    subtitle: "Hesaplama esasları, sigorta ve fon",
    blocks: [
      {
        id: "k14-son-ucret",
        kind: "p",
        text: "Kıdem tazminatının hesaplanması, son ücret üzerinden yapılır. Parça başı, akort, götürü veya yüzde usulü gibi ücretin sabit olmadığı hallerde son bir yıllık süre içinde ödenen ücretin o süre içinde çalışılan günlere bölünmesi suretiyle bulunacak ortalama ücret bu tazminatın hesabına esas tutulur.",
      },
      {
        id: "k14-zam",
        kind: "p",
        text: "Ancak, son bir yıl içinde işçi ücretine zam yapıldığı takdirde, tazminata esas ücret, işçinin işten ayrılma tarihi ile zammın yapıldığı tarih arasında alınan ücretin aynı süre içinde çalışılan günlere bölünmesi suretiyle hesaplanır.",
      },
      {
        id: "k14-menfaat",
        kind: "p",
        text: "(Değişik: 29/7/1983 – 2869/3 md.) 13 üncü maddesinde sözü geçen tazminat ile bu maddede yer alan kıdem tazminatına esas olacak ücretin hesabında 26 ncı maddenin birinci fıkrasında yazılı ücrete ilaveten işçiye sağlanmış olan para ve para ile ölçülmesi mümkün akdi ve kanundan doğan menfaatler de gözönünde tutulur. Kıdem tazminatının zamanında ödenmemesi sebebiyle açılacak davanın sonunda hakim gecikme süresi için, ödenmeyen süreye göre mevduata uygulanan en yüksek faizin ödenmesine hükmeder. İşçinin mevzuattan doğan diğer hakları saklıdır.",
      },
      {
        id: "k14-30gun",
        kind: "p",
        text: "(Değişik: 17/10/1980 - 2320/1 md.) Bu maddede belirtilen kıdem tazminatı ile ilgili 30 günlük süre hizmet akidleri veya toplu iş sözleşmeleri ile işçi lehine değiştirilebilir.",
      },
      {
        id: "k14-ikramiye",
        kind: "p",
        text: "(Değişik: 10/12/1982 - 2762/1 md.) Ancak, toplu sözleşmelerle ve hizmet akitleriyle belirlenen kıdem tazminatlarının yıllık miktarı, Devlet Memurları Kanununa tabi en yüksek Devlet memuruna 5434 sayılı T.C. Emekli Sandığı Kanunu hükümlerine göre bir hizmet yılı için ödenecek azami emeklilik ikramiyesini geçemez.",
      },
      { id: "k14-degisik-2", kind: "p", text: "(Değişik fıkralar: 17/10/1980 - 2320/1 md.):" },
      {
        id: "k14-olum",
        kind: "p",
        text: "İşçinin ölümü halinde yukarıdaki hükümlere göre doğan tazminat tutarı, kanuni mirasçılarına ödenir.",
      },
      {
        id: "k14-sigorta",
        kind: "p",
        text: "Kıdem tazminatından doğan sorumluluğu işveren şahıslara veya sigorta şirketlerine sigorta ettiremez.",
      },
      {
        id: "k14-fon",
        kind: "p",
        text: "İşveren sorumluluğu altında ve sadece yaşlılık, emeklilik, malullük, ölüm ve toptan ödeme hallerine mahsus olmak kaydiyle Devlet veya kanunla veya Cumhurbaşkanlığı kararnamesiyle kurulu kurumlarda veya % 50 hisseden fazlası Devlete ait bir bankada veya bir kurumda işveren tarafından kıdem tazminatı ile ilgili bir fon tesis edilir.",
      },
      {
        id: "k14-kapanis",
        kind: "closing",
        text: 'Fon tesisi ile ilgili hususlar kanunla düzenlenir." Şeklinde düzenlenmiştir.',
      },
    ],
  },
  {
    id: "sonuc",
    layout: "conclusion",
    title: "Sonuç İtibariyle;",
    blocks: [
      {
        id: "sonuc-1",
        kind: "p",
        text: "Belirli süreli iş sözleşmeleri, sözleşmede belirtilen sürenin dolması ile kendiliğinden sona ermektedir. Bu sona erme şekli, işçi ve işverenin tek taraflı tasarrufu ve/veya eylemine bağlı değildir. Taraflar arasında imza edile belirli süreli iş sözleşmeleri taraflar arasında ki ortak irade ve tasarruflarıyla belirlenmiş bir son bulma şeklidir.",
      },
      {
        id: "sonuc-2",
        kind: "p",
        text: "Belirli süreli iş sözleşmesinin süresinin bitimi ile kendiliğinden sona ermesi hali, yukarıda 1475 sayılı Kanun's 14. maddesinde sayılan 7 ayrı kıdem tazminatı ödeme hallerine girmediğinden, belirli süreli iş sözleşmesiyle çalışan işçilere sürenin bitiminde kıdem tazminatı ödenmemektedir.",
      },
      {
        id: "sonuc-3",
        kind: "closing",
        text: "Bu hususlar dahilinde belirli süreli iş sözleşmesinde 1475 s. Kanunun 14. Maddesindeki şartlar oluşur ise kıdem tazminatı hesaplaması yapılabilmektedir.",
      },
    ],
    emphasis:
      "Hesaplama yapılması gereken durumlarda diğer kıdem tazminatı hesaplama araçları ile hesaplama yapabilirsiniz.",
  },
];
