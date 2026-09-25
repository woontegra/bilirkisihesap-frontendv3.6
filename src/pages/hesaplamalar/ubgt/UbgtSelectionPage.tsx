import { Link } from "react-router-dom";
import { Calculator, Gavel } from "lucide-react";
import styles from "../ihbar-tazminati/IhbarSelectionPage.module.css";

const CARDS = [
  { title: "Standart UBGT", desc: "Ulusal bayram ve genel tatil alacağı", to: "/ubgt/alacagi", icon: Calculator, tone: "sky" as const },
  { title: "Bilirkişi UBGT", desc: "Bilirkişi raporuna göre çok kişili hesaplama", to: "/ubgt/bilirkisi", icon: Gavel, tone: "violet" as const },
];

export default function UbgtSelectionPage() {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1 className={styles.title}>UBGT Alacağı</h1>
          <p className={styles.desc}>Hesaplama türünü seçin. Tüm formüller tarayıcı içinde çalışır.</p>
        </div>
      </header>
      <div className={styles.grid}>
        {CARDS.map(({ title, desc, to, icon: Icon, tone }) => (
          <Link key={to} to={to} className={`${styles.card} ${styles[tone]}`}>
            <span className={styles.iconWrap}>
              <Icon size={22} />
            </span>
            <h2 className={styles.cardTitle}>{title}</h2>
            <p className={styles.cardDesc}>{desc}</p>
            <span className={styles.cardCta}>Hesaplamaya git →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
