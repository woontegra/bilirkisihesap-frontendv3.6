import { Link } from "react-router-dom";
import { BadgePercent, Calculator, ShieldCheck, ShieldOff } from "lucide-react";
import styles from "../ihbar-tazminati/IhbarSelectionPage.module.css";

const CARDS = [
  { title: "Damga Vergisi Kesintili", to: "/icra-takip-brutten-nete/damga-vergisi-kesintili", icon: BadgePercent, tone: "emerald" as const },
  { title: "Gelir ve Damga Vergisi Kesintili", to: "/icra-takip-brutten-nete/gelir-ve-damga-vergisi-kesintili", icon: Calculator, tone: "sky" as const },
  { title: "İstisnalı Full Kesintili", to: "/icra-takip-brutten-nete/istisnali-full-kesintili", icon: ShieldCheck, tone: "sky" as const },
  { title: "İstisnasız Full Kesintili", to: "/icra-takip-brutten-nete/istisnasiz-full-kesintili", icon: ShieldOff, tone: "rose" as const },
];

export default function IcraTakipSelectionPage() {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1 className={styles.title}>İcra Takip Brütten Nete</h1>
          <p className={styles.desc}>Kesinti türünü seçin. Yasal faiz ve mevduat faizi hesaplamaları desteklenir.</p>
        </div>
      </header>
      <div className={styles.grid}>
        {CARDS.map(({ title, to, icon: Icon, tone }) => (
          <Link key={to} to={to} className={`${styles.card} ${styles[tone]}`}>
            <span className={styles.iconWrap}>
              <Icon size={22} />
            </span>
            <h2 className={styles.cardTitle}>{title}</h2>
            <span className={styles.cardCta}>Hesaplamaya git →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
