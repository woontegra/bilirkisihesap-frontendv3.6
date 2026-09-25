import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, Gavel, Home, Info, Scale, ScrollText } from "lucide-react";
import styles from "./EvIsciPage.module.css";

const KARARLAR = [
  {
    id: "9hd-2016",
    tone: "sky" as const,
    daire: "9. Hukuk Dairesi",
    esasKarar: "Esas: 2016/28557 · Karar: 2016/16963",
    baslik: "Ev ve çalışma hayatının iç içe geçtiği durum",
    body: "Davacının, davalının yönetim kurulu başkanının yazlık evinde çalıştığı, o evin müştemilatında ikamet ettiği, çalışma şekil ve şartları dikkate alındığında ev ve çalışma hayatının iç içe geçtiği; bu tür çalışmada fazla mesai olamayacağının Dairenin yerleşik içtihadı olduğu, kaldı ki davacının dahi çalışma saatleri konusunda açıklaması bulunmadığı anlaşıldığından, fazla mesai alacağı talebinin reddi gerekirken kabulü hatalı bulunmuştur.",
  },
  {
    id: "22hd-2017",
    tone: "amber" as const,
    daire: "22. Hukuk Dairesi",
    esasKarar: "Esas: 2015/21212 · Karar: 2017/31087",
    baslik: "Müştemilatta ikamet ve serbest zaman imkânı",
    body: "Davacı, 01.11.1997–17.04.2014 tarihleri arasında davalıya ait evde temizlik, ev ve bahçe bakımı ile bekçilik işlerinde çalışmıştır. Çalışma şekli; kendine özgü çalışma şartları olan, serbest zaman kullanma imkânı bulunan ve çalışılan evin müştemilatında ikamet edilmesi sebebiyle özel hayat ve iş hayatının iç içe geçtiği bir biçimdir. Dinlenen tanıkların davacıyla birlikte çalışan kişiler olmaması ve davacının tam gün sürekli çalışma yerinde kalması nedeniyle, fazla çalışma ile hafta tatili ve genel tatil günlerinde çalışıldığı yeterli ve inandırıcı delillerle ispat edilemediğinden, bu taleplerin kabulü usul ve kanuna aykırı bulunmuş ve bozma kararı verilmiştir.",
  },
];

export default function EvIsciPage() {
  return (
    <div className={styles.page}>
      <Link to="/fazla-mesai" className={styles.backLink}>
        <ArrowLeft size={14} />
        Fazla Mesaiye dön
      </Link>

      <header className={styles.hero} style={{ animationDelay: "40ms" }}>
        <div className={styles.heroIcon} aria-hidden>
          <Home size={22} />
        </div>
        <div className={styles.heroCopy}>
          <h1 className={styles.title}>Ev İşçileri — Fazla Mesai</h1>
          <p className={styles.desc}>
            Ev hizmetlerinde çalışanlar bakımından fazla mesai talebi, işçinin ev ve çalışma hayatının birbirinden
            ayrışıp ayrışmadığına göre değerlendirilir. Bu sayfa bir hesaplama aracı içermez; yalnızca Yargıtay
            yaklaşımını ve yönlendirmeyi özetler.
          </p>
        </div>
      </header>

      <section className={styles.noticeCard} style={{ animationDelay: "90ms" }}>
        <span className={styles.noticeIcon} aria-hidden>
          <AlertTriangle size={16} />
        </span>
        <p className={styles.noticeText}>
          İşçinin çalışma hayatı ile ev hayatının iç içe geçtiği (örn. çalıştığı evin müştemilatında ikamet ettiği,
          serbest zaman kullanabildiği) durumlarda Yargıtay'ın yerleşik içtihadı uyarınca fazla çalışma hesabı
          yapılmaması gerektiği kabul edilmektedir. Aşağıdaki örnekler dahilinde değerlendirme, dosyanın somut
          koşullarına göre siz hukukçuların/profesyonellerin takdirine bırakılmıştır.
        </p>
      </section>

      <section className={styles.routeCard} style={{ animationDelay: "120ms" }}>
        <span className={styles.routeIcon} aria-hidden>
          <Info size={16} />
        </span>
        <div className={styles.routeCopy}>
          <h2 className={styles.routeTitle}>Ev ve çalışma hayatı ayrı ise</h2>
          <p className={styles.routeText}>
            Ev ve çalışma hayatının ayrı olduğu, fazla çalışmanın delillerle (bordro, tanık, yazışma vb.) ispatlandığı
            durumlarda aşağıdaki hesaplama araçlarını kullanabilirsiniz:
          </p>
          <div className={styles.routeLinks}>
            <Link to="/fazla-mesai/standart" className={styles.routeLink}>
              <Scale size={14} />
              Standart Fazla Mesai
              <ArrowRight size={13} className={styles.routeArrow} aria-hidden />
            </Link>
            <Link to="/fazla-mesai/tanikli-standart" className={styles.routeLink}>
              <Gavel size={14} />
              Tanıklı Standart
              <ArrowRight size={13} className={styles.routeArrow} aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <div className={styles.grid}>
        {KARARLAR.map((karar, index) => (
          <article
            key={karar.id}
            className={`${styles.card} ${styles[karar.tone]}`}
            style={{ animationDelay: `${160 + index * 70}ms` }}
          >
            <div className={styles.cardHead}>
              <span className={styles.cardIcon} aria-hidden>
                <Gavel size={18} strokeWidth={2.25} />
              </span>
              <div>
                <span className={styles.cardTag}>{karar.daire}</span>
                <h2 className={styles.cardTitle}>{karar.baslik}</h2>
              </div>
            </div>
            <p className={styles.cardMeta}>{karar.esasKarar}</p>
            <p className={styles.cardBody}>{karar.body}</p>
          </article>
        ))}
      </div>

      <section className={styles.summary} style={{ animationDelay: "300ms" }}>
        <span className={styles.summaryIcon} aria-hidden>
          <ScrollText size={18} />
        </span>
        <div className={styles.summaryCopy}>
          <h2 className={styles.summaryTitle}>Özet</h2>
          <p className={styles.summaryText}>
            Ev işçileri bakımından fazla mesai talebi otomatik bir hesaplama formülüne bağlanamaz; dosyadaki somut
            olgular (ayrı işyeri/mesken düzeni, serbest zaman, tanık beyanları) değerlendirilerek karar verilmelidir.
            Bu sayfa yalnızca bilgilendirme amaçlıdır ve hesaplama içermez.
          </p>
        </div>
      </section>
    </div>
  );
}
