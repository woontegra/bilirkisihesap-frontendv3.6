import { Link } from "react-router-dom";
import { ArrowLeft, Gavel, Info, Scale, ScrollText, Wallet } from "lucide-react";
import styles from "./BorclarKidemPage.module.css";

const ARTICLES = [
  {
    id: "m434",
    tone: "amber" as const,
    icon: Scale,
    title: "MADDE 434",
    subtitle: "Feshe karşı koruma",
    body: "Fesih hakkının kötüye kullanılarak sona erdirildiği durumlarda işveren, işçiye bildirim süresine ait ücretin üç katı tutarında tazminat ödemekle yükümlüdür.",
  },
  {
    id: "m437",
    tone: "sky" as const,
    icon: Gavel,
    title: "MADDE 437",
    subtitle: "Haklı sebeple fesihte",
    body: "Fesih sebebi taraflardan birinin sözleşmeye uymamasından doğmuşsa, o taraf sebep olduğu zararı tamamen gidermekle yükümlüdür. Diğer hâllerde hâkim, durum ve koşulları değerlendirerek feshin maddi sonuçlarını serbestçe takdir eder. Belirsiz süreli sözleşmesi haksız feshedilen işçi, bildirim süresine ilişkin tazminat ile hâkimin takdirine bağlı, en fazla altı aylık ücret tutarında ek bir tazminat talep edebilir.",
  },
  {
    id: "m438",
    tone: "rose" as const,
    icon: Wallet,
    title: "MADDE 438",
    subtitle: "Haklı sebebe dayanmayan fesihte",
    body: "İşveren haklı sebep olmaksızın sözleşmeyi derhâl feshederse işçi; belirsiz süreli sözleşmede bildirim süresi, belirli süreli sözleşmede ise kalan sözleşme süresi karşılığında kazanabileceği miktarı tazminat olarak isteyebilir. Bu tutardan, işçinin bu süre içinde tasarruf ettiği ya da başka bir işten elde ettiği gelir düşülür. Hâkim ayrıca, işçinin en fazla altı aylık ücretini geçmeyecek şekilde takdirî bir ek tazminata hükmedebilir.",
  },
];

export default function BorclarKidemPage() {
  return (
    <div className={styles.page}>
      <Link to="/kidem-tazminati" className={styles.backLink}>
        <ArrowLeft size={14} />
        Kıdem Tazminatına dön
      </Link>

      <header className={styles.hero} style={{ animationDelay: "40ms" }}>
        <div className={styles.heroIcon} aria-hidden>
          <Scale size={22} />
        </div>
        <div className={styles.heroCopy}>
          <h1 className={styles.title}>Borçlar Kanunu İşçi Alacağı</h1>
          <p className={styles.desc}>
            6098 sayılı Türk Borçlar Kanunu&apos;na tâbi çalışanlar için &quot;kıdem tazminatı&quot;
            kurumu bulunmaz; ancak koşulları oluştuğunda haksız fesih tazminatı talep edilebilir.
          </p>
        </div>
      </header>

      <section className={styles.noticeCard} style={{ animationDelay: "90ms" }}>
        <span className={styles.noticeIcon} aria-hidden>
          <Info size={16} />
        </span>
        <p className={styles.noticeText}>
          TBK, kıdem tazminatı adı altında bir tazminat türü öngörmez. Bunun yerine 434, 437 ve
          438&apos;inci maddelerinde, iş sözleşmesinin fesih şekline ve sebebine göre değişen
          tazminat imkânları düzenlenmiştir.
        </p>
      </section>

      <div className={styles.grid}>
        {ARTICLES.map((article, index) => {
          const Icon = article.icon;
          return (
            <article
              key={article.id}
              className={`${styles.card} ${styles[article.tone]}`}
              style={{ animationDelay: `${140 + index * 70}ms` }}
            >
              <div className={styles.cardHead}>
                <span className={styles.cardIcon} aria-hidden>
                  <Icon size={18} strokeWidth={2.25} />
                </span>
                <div>
                  <span className={styles.cardTag}>{article.title}</span>
                  <h2 className={styles.cardTitle}>{article.subtitle}</h2>
                </div>
              </div>
              <p className={styles.cardBody}>{article.body}</p>
            </article>
          );
        })}
      </div>

      <section className={styles.summary} style={{ animationDelay: "360ms" }}>
        <span className={styles.summaryIcon} aria-hidden>
          <ScrollText size={18} />
        </span>
        <div className={styles.summaryCopy}>
          <h2 className={styles.summaryTitle}>Doktrindeki yeri</h2>
          <p className={styles.summaryText}>
            BK m.438/3&apos;te düzenlenen ve hâkimin takdirine bağlı, en fazla altı aylık ücret
            tutarındaki bu ek tazminat, doktrinde &quot;haksız fesih tazminatı&quot; olarak
            anılmaktadır. Bu sayfa yalnızca bilgilendirme amaçlıdır; hesaplama içermez.
          </p>
        </div>
      </section>
    </div>
  );
}
