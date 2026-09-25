import { Link } from "react-router-dom";
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  Clock,
  FileCheck,
  Newspaper,
  Scale,
  ShieldCheck,
  Ship,
  Sun,
} from "lucide-react";
import styles from "./IhbarSelectionPage.module.css";

const CARDS = [
  {
    title: "İş Kanununa Göre (30+ işçi)",
    desc: "4857 sayılı İş Kanunu kapsamında standart ihbar süresi ve tazminat hesabı.",
    to: "/ihbar-tazminati/30isci",
    icon: Briefcase,
    tone: "amber",
  },
  {
    title: "Borçlar Kanunu İşçi Alacağı",
    desc: "TBK kapsamındaki iş ilişkilerinde ihbar süresi ve tazminat hesabı.",
    to: "/ihbar-tazminati/borclar",
    icon: Scale,
    tone: "slate",
  },
  {
    title: "Gemi Adamları",
    desc: "Deniz iş ilişkilerinde ihbar süresine göre tazminat hesabı.",
    to: "/ihbar-tazminati/gemi",
    icon: Ship,
    tone: "sky",
  },
  {
    title: "Mevsimlik İşçi",
    desc: "Mevsimlik çalışma ilişkisinde kıdeme göre ihbar tazminatı hesabı.",
    to: "/ihbar-tazminati/mevsim",
    icon: Sun,
    tone: "orange",
  },
  {
    title: "Basın İş",
    desc: "5953 sayılı Basın İş Kanunu; 5 yıl kuralına göre 30/90 günlük ihbar hesabı.",
    to: "/ihbar-tazminati/basin",
    icon: Newspaper,
    tone: "rose",
  },
  {
    title: "Kısmi Süreli / Part Time",
    desc: "Kısmi süreli çalışmada çalışma süresi ve ihbar tazminatı hesabı.",
    to: "/ihbar-tazminati/kismi",
    icon: Clock,
    tone: "violet",
  },
  {
    title: "Belirli Süreli İş Sözleşmesi",
    desc: "Belirli süreli sözleşmede ihbar hakkına ilişkin hesap ve mevzuat özeti.",
    to: "/ihbar-tazminati/belirli",
    icon: FileCheck,
    tone: "emerald",
  },
] as const;

export default function IhbarSelectionPage() {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1 className={styles.title}>İhbar Tazminatı</h1>
          <p className={styles.desc}>
            <CalendarClock size={14} style={{ verticalAlign: "-2px", marginRight: "0.25rem" }} />
            Hesaplama türünü seçin. Her tür kendi kurallarıyla, birbirinden izole ve tamamen
            tarayıcı içinde çalışır.
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
