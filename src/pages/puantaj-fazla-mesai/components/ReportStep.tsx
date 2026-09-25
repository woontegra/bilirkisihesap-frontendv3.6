import { FileClock, Printer } from "lucide-react";
import type { CalcSettings, PuantajFmResult } from "../model";
import { REPORT_DISCLAIMER } from "../model";
import { printReport } from "../reportPrint";
import {
  breakRuleLabel,
  buildCetvelRows,
  buildOffCetvelSummary,
  dateRangeLabel,
  estimatePageCount,
  todayTR,
} from "../reportCetvel";
import { formatNumber } from "../format";
import pageStyles from "../PuantajFmPage.module.css";
import styles from "./ReportCetvel.module.css";

type Props = {
  results: PuantajFmResult[];
  fileName: string;
  templateName: string | null;
  settings: CalcSettings;
  katsayi: number;
};

export default function ReportStep({ results, fileName, templateName, settings, katsayi }: Props) {
  if (results.length === 0) {
    return (
      <section className={`${pageStyles.card} ${pageStyles.stepPanel}`}>
        <p className={pageStyles.empty}>Henüz hesaplama yapılmadı.</p>
      </section>
    );
  }

  const meta = { fileName, templateName, settings, katsayi };

  return (
    <section className={`${pageStyles.card} ${pageStyles.stepPanel}`}>
      <div className={styles.wrap}>
        <div className={styles.head}>
          <h2 className={styles.title}>
            <FileClock size={18} /> Rapor — Fazla Mesai Hesap Cetveli
          </h2>
          <button
            type="button"
            className={`${pageStyles.btn} ${pageStyles.btnPrimary}`}
            onClick={() => printReport(results, meta)}
          >
            <Printer size={14} /> Yazdır / PDF (A4 Dikey)
          </button>
        </div>

        {results.map((result) => {
          const rows = buildCetvelRows(result);
          const summary = buildOffCetvelSummary(result);
          const pages = estimatePageCount(rows.length);
          return (
            <div key={result.personelAdSoyad} className={styles.personBlock}>
              <h3 className={styles.personTitle}>
                PUANTAJ KAYITLARINA GÖRE FAZLA MESAİ HESAP CETVELİ
              </h3>

              <table className={styles.infoTable}>
                <tbody>
                  <tr>
                    <td>
                      <b>Personel</b>
                      {result.personelAdSoyad}
                    </td>
                    <td>
                      <b>Bölüm</b>
                      {result.birim || "—"}
                    </td>
                    <td>
                      <b>Pozisyon</b>
                      {result.pozisyon || "—"}
                    </td>
                    <td>
                      <b>Hesaplama Tarih Aralığı</b>
                      {dateRangeLabel(result, settings)}
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <b>Kaynak Dosya</b>
                      {fileName || "—"}
                    </td>
                    <td>
                      <b>Hesaplama Tarihi</b>
                      {todayTR()}
                    </td>
                    <td>
                      <b>Haftalık Yasal Sınır</b>
                      {formatNumber(settings.weeklyLimit, 1)} saat
                    </td>
                    <td>
                      <b>Ara Dinlenme Kuralı</b>
                      {breakRuleLabel(settings)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={4}>
                      <b>Katsayı</b>
                      {formatNumber(katsayi, 2)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className={styles.miniSummary}>
                <MiniChip label="Hesaplanan FM" value={summary.hesaplananToplamFm} />
                <MiniChip label="OFF gün" value={String(summary.toplamMahsupGun)} />
                <MiniChip label="OFF mahsup" value={summary.toplamOffMahsup} />
                <MiniChip label="Mahsup sonrası FM" value={summary.mahsupSonrasiFm} accent />
                <MiniChip label="Nihai sonuç" value={summary.nihaiSonuc} accent />
              </div>

              <div className={styles.scroll}>
                <table className={styles.cetvel}>
                  <thead>
                    <tr>
                      <th>Dönem</th>
                      <th>Tarih</th>
                      <th>Gün</th>
                      <th>Aylık Puantaja Göre Çalışılan Saat</th>
                      <th>Ara Dinlenme</th>
                      <th>Aylık Puantaja Göre Çalışılan Net Saat</th>
                      <th>11 Saati Aşan Günlük Fazla Mesai</th>
                      <th>45 Saati Aşan Haftalık Fazla Mesai</th>
                      <th>Bayram Günleri</th>
                      <th>Bayram Günü Tam/Yarım</th>
                      <th>Bayram Çalışması Var/Yok</th>
                      <th>Bayram Çalışması</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      if (r.kind === "weekTotal") {
                        return (
                          <tr key={r.key} className={styles.weekTotal}>
                            <td colSpan={5} className={styles.weekLabel}>
                              <b>{r.weekLabelTitle}</b>
                              {r.weekLabelRange ? ` - ${r.weekLabelRange}` : ""}
                            </td>
                            <td className={styles.num}>{r.netSaat}</td>
                            <td className={styles.num}>{r.gunluk11Asim}</td>
                            <td className={styles.num}>{r.haftalik45Asim}</td>
                            <td />
                            <td />
                            <td />
                            <td className={styles.num}>{r.bayramCalismasi}</td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={r.key}>
                          <td>{r.donem}</td>
                          <td>{r.tarih}</td>
                          <td>{r.gun}</td>
                          <td className={styles.saat}>{r.calisilanSaat}</td>
                          <td className={styles.num}>{r.araDinlenme}</td>
                          <td className={styles.num}>{r.netSaat}</td>
                          <td className={styles.num}>{r.gunluk11Asim}</td>
                          <td className={styles.num}>{r.haftalik45Asim}</td>
                          <td>{r.bayramGunleri}</td>
                          <td>{r.bayramTamYarim}</td>
                          <td>{r.bayramCalismaVarYok}</td>
                          <td className={styles.num}>{r.bayramCalismasi}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <h4 className={pageStyles.cardHint} style={{ fontWeight: 700, margin: 0 }}>
                Hesap Özeti
              </h4>
              <table className={styles.summaryTable}>
                <tbody>
                  <tr>
                    <td>Hesaplanan toplam fazla mesai</td>
                    <td>{summary.hesaplananToplamFm}</td>
                  </tr>
                  <tr>
                    <td>Açık OFF günleri</td>
                    <td>{summary.acikOffGun}</td>
                  </tr>
                  <tr>
                    <td>Kullanıcı tarafından OFF kabul edilen Fazla Mesai İzni günleri</td>
                    <td>{summary.kullaniciOffGun}</td>
                  </tr>
                  <tr>
                    <td>Toplam mahsup günü</td>
                    <td>{summary.toplamMahsupGun}</td>
                  </tr>
                  <tr>
                    <td>OFF gün karşılığı</td>
                    <td>{summary.offGunKarsiligi}</td>
                  </tr>
                  <tr>
                    <td>Toplam OFF mahsubu</td>
                    <td>{summary.toplamOffMahsup}</td>
                  </tr>
                  <tr>
                    <td>Mahsup sonrası fazla mesai</td>
                    <td>{summary.mahsupSonrasiFm}</td>
                  </tr>
                  <tr>
                    <td>Hakkaniyet indirimi</td>
                    <td>{summary.hakkaniyetIndirimi}</td>
                  </tr>
                  <tr className={styles.grand}>
                    <td>Nihai sonuç</td>
                    <td>{summary.nihaiSonuc}</td>
                  </tr>
                </tbody>
              </table>

              <p className={styles.pageHint}>
                A4 dikey · {rows.length} satır · tahmini ~{pages} sayfa (yoğunluk ≈ 90 satır/sayfa) ·
                3 ay ≈ {estimatePageCount(90)} syf · 1 yıl ≈ {estimatePageCount(365)} syf · 5 yıl ≈{" "}
                {estimatePageCount(365 * 5)} syf
              </p>
            </div>
          );
        })}

        <p className={styles.disclaimer}>{REPORT_DISCLAIMER}</p>
      </div>
    </section>
  );
}

function MiniChip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`${styles.miniChip} ${accent ? styles.miniChipAccent : ""}`}>
      <div className={styles.miniChipLabel}>{label}</div>
      <div className={styles.miniChipValue}>{value}</div>
    </div>
  );
}
