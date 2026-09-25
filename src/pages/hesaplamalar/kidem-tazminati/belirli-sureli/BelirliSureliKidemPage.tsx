import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  FileCheck,
  Heart,
  ListChecks,
  Scale,
  ScrollText,
  ShieldOff,
  Wallet,
} from "lucide-react";
import type { LegalBlock, MevzuatSection } from "./legalContent";
import { MEVZUAT_SECTIONS } from "./legalContent";
import styles from "./BelirliSureliKidemPage.module.css";

const CARD_ICONS: Record<string, LucideIcon> = {
  ik11: FileCheck,
  ik12: Scale,
  "k14-kidem": ScrollText,
  "k14-kamu": Building2,
  "k14-ucret": Wallet,
};

function CardBlocks({ blocks }: { blocks: LegalBlock[] }) {
  return (
    <div className={styles.cardBodyStack}>
      {blocks.map((block) => (
        <p key={block.id} className={styles.cardBody}>
          {block.text}
        </p>
      ))}
    </div>
  );
}

function MevzuatCard({
  section,
  delayMs,
}: {
  section: Extract<MevzuatSection, { layout: "card" }>;
  delayMs: number;
}) {
  const Icon = CARD_ICONS[section.id] ?? FileCheck;

  return (
    <article className={`${styles.card} ${styles[section.tone]}`} style={{ animationDelay: `${delayMs}ms` }}>
      <span className={styles.cardIcon} aria-hidden>
        <Icon size={18} strokeWidth={2.25} />
      </span>
      <h2 className={styles.cardTitle}>{section.title}</h2>
      <p className={styles.cardSubtitle}>{section.subtitle}</p>
      <CardBlocks blocks={section.blocks} />
    </article>
  );
}

export default function BelirliSureliKidemPage() {
  const topCards = MEVZUAT_SECTIONS.filter(
    (s): s is Extract<MevzuatSection, { layout: "card" }> =>
      s.layout === "card" && (s.id === "ik11" || s.id === "ik12"),
  );
  const bodyCards = MEVZUAT_SECTIONS.filter(
    (s): s is Extract<MevzuatSection, { layout: "card" }> =>
      s.layout === "card" && s.id !== "ik11" && s.id !== "ik12",
  );
  const grounds = MEVZUAT_SECTIONS.find((s) => s.layout === "grounds");
  const conclusion = MEVZUAT_SECTIONS.find((s) => s.layout === "conclusion");

  return (
    <div className={styles.page}>
      <Link to="/kidem-tazminati" className={styles.backLink}>
        <ArrowLeft size={14} />
        Kıdem Tazminatına dön
      </Link>

      <header className={styles.hero} style={{ animationDelay: "40ms" }}>
        <div className={styles.heroIcon} aria-hidden>
          <FileCheck size={22} />
        </div>
        <div className={styles.heroCopy}>
          <h1 className={styles.title}>Belirli Süreli İş Sözleşmesi</h1>
          <p className={styles.desc}>
            Belirli süreli sözleşmelerin kuruluş koşulları, zincirleme sözleşme sınırı ve 1475 sayılı
            Kanun m.14 kapsamındaki kıdem tazminatı hakları hakkında mevzuat metni.
          </p>
        </div>
      </header>

      <div className={styles.topGrid}>
        {topCards.map((section, index) => (
          <MevzuatCard key={section.id} section={section} delayMs={100 + index * 70} />
        ))}
      </div>

      {grounds && grounds.layout === "grounds" ? (
        <section className={styles.groundsPanel} style={{ animationDelay: "240ms" }}>
          <div className={styles.groundsHead}>
            <span className={styles.groundsIcon} aria-hidden>
              <ListChecks size={18} />
            </span>
            <div>
              <h2 className={styles.groundsTitle}>{grounds.title}</h2>
              <p className={styles.groundsDesc}>{grounds.desc}</p>
            </div>
          </div>
          <p className={styles.groundsIntro}>{grounds.intro}</p>
          <ul className={styles.groundsList}>
            {grounds.listItems.map((item) => (
              <li key={item} className={styles.groundsItem}>
                <Heart size={13} className={styles.groundsBullet} aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className={styles.groundsClosing}>{grounds.closing}</p>
        </section>
      ) : null}

      <div className={styles.bodyStack}>
        {bodyCards.map((section, index) => (
          <MevzuatCard key={section.id} section={section} delayMs={310 + index * 70} />
        ))}
      </div>

      {conclusion && conclusion.layout === "conclusion" ? (
        <section className={styles.conclusion} style={{ animationDelay: "520ms" }}>
          <span className={styles.conclusionIcon} aria-hidden>
            <ShieldOff size={18} />
          </span>
          <div className={styles.conclusionCopy}>
            <h2 className={styles.conclusionTitle}>{conclusion.title}</h2>
            <CardBlocks blocks={conclusion.blocks} />
            <p className={styles.conclusionEmphasis}>{conclusion.emphasis}</p>
          </div>
        </section>
      ) : null}

      <section className={styles.nextStep} style={{ animationDelay: "590ms" }}>
        <p className={styles.nextStepText}>
          1475 sayılı Kanun m.14&apos;teki şartlar somut olayda gerçekleşmişse kıdem tazminatı hesabı için
          diğer kıdem tazminatı hesaplama araçlarını kullanabilirsiniz.
        </p>
        <Link to="/kidem-tazminati/30isci" className={styles.nextStepLink}>
          İş Kanununa göre kıdem hesaplama
          <ArrowRight size={14} />
        </Link>
      </section>
    </div>
  );
}
