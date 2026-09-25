import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Newspaper, ShieldCheck, Ship } from "lucide-react";
import styles from "./HaftaTatiliSelectionPage.module.css";

const CARDS = [
  {
    title: "Standart",
    desc: "4857 sayılı İş Kanunu; mevsimsel kullanım ve dışlanabilir günler desteği.",
    to: "/hafta-tatili/standard",
    icon: CalendarDays,
    tone: "violet" as const,
  },
  {
    title: "Gemi Adamları",
    desc: "Deniz İş Kanunu kapsamında gemi adamları hafta tatili alacağı.",
    to: "/hafta-tatili/gemi-adami",
    icon: Ship,
    tone: "sky" as const,
  },
  {
    title: "Basın İş",
    desc: "5953 sayılı Basın İş Kanunu; gece çalışanı için haftada 2 gün tatil.",
    to: "/hafta-tatili/basin-is",
    icon: Newspaper,
    tone: "rose" as const,
  },
];

export default function HaftaTatiliSelectionPage() {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1 className={styles.title}>Hafta Tatili Alacağı</h1>
          <p className={styles.desc}>
            Hesaplama türünü seçin. Her tür kendi kurallarıyla, birbirinden izole ve tamamen tarayıcı
            içinde çalışır.
          </p>
          <div className={styles.privacyBadge}>
            <ShieldCheck size={14} />
            <span>Veriler hesabınıza güvenli şekilde kaydedilir</span>
          </div>
        </div>
      </header>

      <div className={styles.grid}>
        {CARDS.map((card, index) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.to}
              to={card.to}
              className={`${styles.card} ${styles[card.tone]}`}
              style={{ animationDelay: `${60 + index * 55}ms` }}
            >
              <span className={styles.iconWrap} aria-hidden>
                <Icon size={20} strokeWidth={2.25} />
              </span>
              <h2 className={styles.cardTitle}>{card.title}</h2>
              <p className={styles.cardDesc}>{card.desc}</p>
              <span className={styles.cardCta}>
                Hesaplamaya git
                <ArrowRight size={14} className={styles.arrow} aria-hidden />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
