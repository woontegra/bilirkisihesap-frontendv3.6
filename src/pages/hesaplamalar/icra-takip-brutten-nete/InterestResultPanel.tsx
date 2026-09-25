import { formatMoney } from "./lib/brutNet";
import { fmtDateTR } from "./lib/format";
import type { CalculateInterestSuccess } from "./lib/interestCalculator";
import type { IcraVariant } from "./model";
import styles from "./InterestResultPanel.module.css";

type BrutNet =
  | { gross: number; damgaVergisi: number; net: number }
  | {
      gross: number;
      sgk: number;
      issizlik: number;
      gelirVergisi: number;
      damgaVergisi: number;
      net: number;
    };

type Props = {
  variant: IcraVariant;
  grossVal: number;
  brutNet: BrutNet;
  faizBaslangic: string;
  icraTakip: string;
  faizTuru: "yasal" | "en_yuksek_mevduat";
  interestResult: CalculateInterestSuccess;
  totalInterest: number;
  takipToplami: number;
};

function faizTuruLabel(faizTuru: Props["faizTuru"]): string {
  return faizTuru === "yasal"
    ? "Yasal Faiz"
    : "Bankalarca Mevduatlara Uygulanan En Yüksek Faiz";
}

export function InterestResultPanel({
  variant,
  grossVal,
  brutNet,
  faizBaslangic,
  icraTakip,
  faizTuru,
  interestResult,
  totalInterest,
  takipToplami,
}: Props) {
  const summaryRows: Array<{
    label: string;
    value: string;
    tone?: "deduction" | "emphasis";
  }> = [{ label: "Brüt Alacak Tutarı", value: `${formatMoney(grossVal)} ₺` }];

  if (variant === "damga" && "damgaVergisi" in brutNet) {
    summaryRows.push(
      { label: "Damga Vergisi (binde 7,59)", value: `-${formatMoney(brutNet.damgaVergisi)} ₺`, tone: "deduction" },
      { label: "Net Tutar (Anapara)", value: `${formatMoney(brutNet.net)} ₺`, tone: "emphasis" },
    );
  } else if ("sgk" in brutNet) {
    summaryRows.push(
      { label: "SGK Primi", value: `-${formatMoney(brutNet.sgk)} ₺`, tone: "deduction" },
      { label: "İşsizlik Primi", value: `-${formatMoney(brutNet.issizlik)} ₺`, tone: "deduction" },
      { label: "Gelir Vergisi", value: `-${formatMoney(brutNet.gelirVergisi)} ₺`, tone: "deduction" },
      { label: "Damga Vergisi", value: `-${formatMoney(brutNet.damgaVergisi)} ₺`, tone: "deduction" },
      { label: "Ödenecek Net Tutar (Anapara)", value: `${formatMoney(brutNet.net)} ₺`, tone: "emphasis" },
    );
  }

  summaryRows.push(
    { label: "Faiz Başlangıç Tarihi", value: fmtDateTR(faizBaslangic) },
    { label: "İcra Takip Tarihi", value: fmtDateTR(icraTakip) },
    { label: "Gün Sayısı", value: `${interestResult.totalDays} gün` },
    { label: "Faiz Türü", value: faizTuruLabel(faizTuru) },
  );

  return (
    <section className={styles.panel} aria-label="Faiz sonuç özeti">
      <h2 className={styles.title}>Faiz Sonuç Özeti</h2>

      <div className={styles.formula}>
        <p>
          <strong>Hesaplama şekli:</strong> Ana Para × Yıllık Faiz Oranı × Gün Sayısı / 36500 = Faiz
        </p>
        {faizTuru === "en_yuksek_mevduat" ? (
          <p>
            Bankalarca mevduatlara uygulanan en yüksek faiz hesaplamasında faiz oranları{" "}
            <span className={styles.mono}>evds3.tcmb.gov.tr</span> güncel verileridir.
          </p>
        ) : null}
      </div>

      <div className={styles.summaryGrid}>
        {summaryRows.map((row) => (
          <div key={row.label} className={styles.summaryRow}>
            <span className={styles.summaryLabel}>{row.label}</span>
            <span
              className={
                row.tone === "deduction"
                  ? `${styles.summaryValue} ${styles.summaryValueDeduction}`
                  : row.tone === "emphasis"
                    ? `${styles.summaryValue} ${styles.summaryValueEmphasis}`
                    : styles.summaryValue
              }
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <p className={styles.periodsTitle}>Faiz Dönemleri</p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Başlangıç Tarihi</th>
              <th>Bitiş Tarihi</th>
              <th className={styles.num}>Gün</th>
              <th className={styles.num}>Oran</th>
              <th className={styles.num}>Faiz Tutarı</th>
            </tr>
          </thead>
          <tbody>
            {interestResult.periods.length > 0 ? (
              interestResult.periods.map((period, index) => (
                <tr key={`${period.startDate}-${period.endDate}-${index}`}>
                  <td>{fmtDateTR(period.startDate)}</td>
                  <td>{fmtDateTR(period.endDate)}</td>
                  <td className={styles.num}>{period.days}</td>
                  <td className={styles.num}>%{period.rate}</td>
                  <td className={styles.num}>{formatMoney(period.interest)} ₺</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className={styles.emptyCell}>
                  Dönem bulunmuyor (gün sayısı 0).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.totals}>
        <div className={styles.totalRow}>
          <span className={styles.totalInterest}>Toplam Faiz Tutarı</span>
          <span className={styles.totalInterest}>{formatMoney(totalInterest)} ₺</span>
        </div>
        <div className={styles.totalRow}>
          <span className={styles.totalGrand}>Takip Toplamı</span>
          <span className={styles.totalGrand}>{formatMoney(takipToplami)} ₺</span>
        </div>
      </div>
    </section>
  );
}
