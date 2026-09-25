import { Link } from "react-router-dom";
import {
  ArrowRight,
  Clock3,
  FileSpreadsheet,
  HardHat,
  Home,
  Layers,
  MoonStar,
  RotateCcw,
  Scale,
  ShieldCheck,
  Ship,
  Shuffle,
  SunMedium,
  Timer,
  Users,
  Waves,
} from "lucide-react";
import styles from "./FazlaMesaiSelectionPage.module.css";

type Card =
  | {
      title: string;
      desc: string;
      to: string;
      icon: typeof Clock3;
      tone: string;
      comingSoon?: false;
    }
  | {
      title: string;
      desc: string;
      icon: typeof Clock3;
      tone: string;
      comingSoon: true;
    };

const CARDS: Card[] = [
  {
    title: "Standart Fazla Mesai",
    desc: "Tek davacı beyanı; haftalık 45 saat üstü, asgari ücret dönemleri ve düşümlerle hesap.",
    to: "/fazla-mesai/standart",
    icon: Scale,
    tone: "amber",
  },
  {
    title: "Tanıklı Standart",
    desc: "Davacı haftası esas; tanık dönemleri ve saat kesişimleriyle satırlandırma.",
    to: "/fazla-mesai/tanikli-standart",
    icon: Users,
    tone: "sky",
  },
  {
    title: "Haftalık Karma",
    desc: "Hafta içi farklı gün grupları ve saatleri; marjinal düşüm mantığı.",
    to: "/fazla-mesai/haftalik-karma",
    icon: Shuffle,
    tone: "violet",
  },
  {
    title: "Dönemsel",
    desc: "Yaz / kış mevsim desenleri; ay bazlı çalışma düzeni.",
    to: "/fazla-mesai/donemsel",
    icon: SunMedium,
    tone: "orange",
  },
  {
    title: "Dönemsel Haftalık",
    desc: "Mevsimsel desen + haftalık karma gün grupları bir arada.",
    to: "/fazla-mesai/donemsel-haftalik",
    icon: Layers,
    tone: "rose",
  },
  {
    title: "Yeraltı İşçileri",
    desc: "Haftalık 37,5 saat sınırı; 187,5 / ×2 ve çift asgari ücret.",
    to: "/fazla-mesai/yeralti-isci",
    icon: HardHat,
    tone: "slate",
  },
  {
    title: "24 Saat Vardiya",
    desc: "Gün aşırı çalışma; vardiya günü başına 3 saat fazla mesai.",
    to: "/fazla-mesai/vardiya-24",
    icon: RotateCcw,
    tone: "emerald",
  },
  {
    title: "48 Saat Vardiya",
    desc: "1 çalış / 2 dinlen ritmi; 3 günlük çevrim ve geçiş haftaları.",
    to: "/fazla-mesai/vardiya-48",
    icon: Timer,
    tone: "teal",
  },
  {
    title: "Gemi Adamı Günlük",
    desc: "Deniz işi; haftalık 48 saat, 240 / ×1,25 formülü.",
    to: "/fazla-mesai/gemi-adami-gunluk",
    icon: Ship,
    tone: "navy",
  },
  {
    title: "Gemi Adamı 7/24",
    desc: "Tam mürettebat; sabit haftalık 35 saat fazla mesai.",
    to: "/fazla-mesai/gemi-adami-7-24",
    icon: Waves,
    tone: "cyan",
  },
  {
    title: "Ev İşçileri",
    desc: "Yargıtay yaklaşımı ve yönlendirme; ayrı işyeri varsa Standart / Tanıklı.",
    to: "/fazla-mesai/ev-isci",
    icon: Home,
    tone: "warm",
  },
  {
    title: "Puantaj Kayıtlarına Göre",
    desc: "PDF / Excel / CSV puantaj belgesinden alan eşleştirme, kontrol ve lokal fazla mesai hesabı.",
    to: "/fazla-mesai/puantaj",
    icon: FileSpreadsheet,
    tone: "sky",
  },
  {
    title: "12 Saat Vardiya Usulü",
    desc: "Bu hesaplama türü yakında eklenecek.",
    icon: Clock3,
    tone: "muted",
    comingSoon: true,
  },
  {
    title: "Fazla Sürelerle Çalışma",
    desc: "Bu hesaplama türü yakında eklenecek.",
    icon: MoonStar,
    tone: "muted",
    comingSoon: true,
  },
  {
    title: "Basın İş",
    desc: "Bu hesaplama türü yakında eklenecek.",
    icon: Scale,
    tone: "muted",
    comingSoon: true,
  },
];

export default function FazlaMesaiSelectionPage() {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1 className={styles.title}>Fazla Mesai Alacağı</h1>
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
          const delay = { animationDelay: `${50 + index * 45}ms` };
          if (card.comingSoon) {
            return (
              <div
                key={card.title}
                className={`${styles.card} ${styles.soon} ${styles[card.tone]}`}
                style={delay}
                aria-disabled="true"
              >
                <span className={styles.soonBadge}>Yakında</span>
                <span className={styles.iconWrap} aria-hidden>
                  <Icon size={20} strokeWidth={2.25} />
                </span>
                <h2 className={styles.cardTitle}>{card.title}</h2>
                <p className={styles.cardDesc}>{card.desc}</p>
              </div>
            );
          }
          return (
            <Link
              key={card.to}
              to={card.to}
              className={`${styles.card} ${styles[card.tone]}`}
              style={delay}
            >
              <span className={styles.sheen} aria-hidden />
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
