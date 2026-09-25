import { Link } from "react-router-dom";
import {
  ArrowRight,
  Briefcase,
  Clock,
  FileCheck,
  Newspaper,
  Scale,
  Ship,
  Sun,
} from "lucide-react";
import styles from "./KidemSelectionPage.module.css";

const CARDS = [
  {
    title: "İş Kanununa Göre",
    desc: "4857 / 1475 sayılı kanun çerçevesinde klasik kıdem tazminatı hesabı.",
    to: "/kidem-tazminati/30isci",
    icon: Briefcase,
    tone: "amber",
  },
  {
    title: "Borçlar Kanunu İşçi Alacağı",
    desc: "TBK kapsamında kıdem yerine haksız fesih tazminatı bilgilendirmesi.",
    to: "/kidem-tazminati/borclar",
    icon: Scale,
    tone: "slate",
  },
  {
    title: "Gemi Adamları",
    desc: "Deniz iş ilişkilerinde kıdem; GVK 25/7 muafiyeti ve damga ile net.",
    to: "/kidem-tazminati/gemi",
    icon: Ship,
    tone: "sky",
  },
  {
    title: "Mevsimlik İşçi",
    desc: "Birden fazla çalışma dönemi ve 360 günlük gün payı ile hesap.",
    to: "/kidem-tazminati/mevsimlik",
    icon: Sun,
    tone: "orange",
  },
  {
    title: "Basın İş",
    desc: "5953 sayılı Basın İş Kanunu; 5 yıl kuralı ve gelir vergisi.",
    to: "/kidem-tazminati/basin",
    icon: Newspaper,
    tone: "rose",
  },
  {
    title: "Kısmi Süreli / Part Time",
    desc: "SSK 360 gün sistemiyle kısmi süreli çalışma kıdemi.",
    to: "/kidem-tazminati/kismi-sureli",
    icon: Clock,
    tone: "violet",
  },
  {
    title: "Belirli Süreli İş Sözleşmesi",
    desc: "Belirli süreli sözleşmede kıdem hakkına ilişkin mevzuat özeti.",
    to: "/kidem-tazminati/belirli-sureli",
    icon: FileCheck,
    tone: "emerald",
  },
] as const;

export default function KidemSelectionPage() {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1 className={styles.title}>Kıdem Tazminatı</h1>
          <p className={styles.desc}>
            Hesaplama türünü seçin. Her tür kendi kurallarıyla, birbirinden bağımsız çalışır.
          </p>
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
