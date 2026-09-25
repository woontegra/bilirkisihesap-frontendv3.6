import { Link } from "react-router-dom";
import { ArrowRight, Briefcase, CalendarClock, Clock3, FileCheck, Newspaper, Scale, ShieldCheck, Ship, Sun } from "lucide-react";
import styles from "./YillikSelectionPage.module.css";

const CARDS = [
  { title: "Yıllık İzin Hesaplama", desc: "4857 sayılı İş Kanunu — standart kıdem dilimleri.", to: "/yillik-izin/standart", icon: Briefcase, tone: "amber" },
  { title: "Borçlar Kanunu", desc: "Her yıl 14 gün (18-/50+: 21 gün).", to: "/yillik-izin/borclar", icon: Scale, tone: "slate" },
  { title: "Gemi Adamları", desc: "30/360 gün kuralı — Deniz İş Kanunu.", to: "/yillik-izin/gemi", icon: Ship, tone: "sky" },
  { title: "Mevsimlik İşçi", desc: "Fiili kıdeme göre standart dilimler.", to: "/yillik-izin/mevsim", icon: Sun, tone: "orange" },
  { title: "Basın — Günlük Gazete", desc: "4/6 hafta kuralı (5953).", to: "/yillik-izin/basin", icon: Newspaper, tone: "rose" },
  { title: "Basın — Günlük Olmayan", desc: "Her 6 ayda 14 gün.", to: "/yillik-izin/basin/gunluk-olmayan", icon: Newspaper, tone: "rose" },
  { title: "Kısmi Süreli / Part Time", desc: "Kısmi süreli çalışmada izin hakkı.", to: "/yillik-izin/kismi", icon: Clock3, tone: "violet" },
  { title: "Belirli Süreli", desc: "Belirli süreli sözleşmede izin alacağı.", to: "/yillik-izin/belirli", icon: FileCheck, tone: "emerald" },
] as const;

export default function YillikSelectionPage() {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1 className={styles.title}>Yıllık Ücretli İzin Alacağı</h1>
          <p className={styles.desc}>
            <CalendarClock size={14} style={{ verticalAlign: "-2px", marginRight: "0.25rem" }} />
            Hesaplama türünü seçin. Tüm varyantlar tarayıcı içinde, backend isteği olmadan çalışır.
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
            <Link key={card.to} to={card.to} className={`${styles.card} ${styles[card.tone]}`} style={{ animationDelay: `${60 + index * 55}ms` }}>
              <span className={styles.iconWrap} aria-hidden><Icon size={20} strokeWidth={2.25} /></span>
              <h2 className={styles.cardTitle}>{card.title}</h2>
              <p className={styles.cardDesc}>{card.desc}</p>
              <span className={styles.cardCta}>Hesaplamaya git<ArrowRight size={14} className={styles.arrow} aria-hidden /></span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
