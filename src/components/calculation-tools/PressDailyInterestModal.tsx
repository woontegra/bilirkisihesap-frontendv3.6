import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DraftDateInput, DraftTextInput } from "@/components/form";
import styles from "./calculationTools.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

function parseAmount(v: string): number {
  return Number(String(v).replace(/\./g, "").replace(",", ".")) || 0;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

function daysBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

function formatDateTr(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

export function PressDailyInterestModal({ open, onClose }: Props) {
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [result, setResult] = useState<{
    days: number;
    dailyInterest: number;
    totalInterest: number;
    total: number;
  } | null>(null);

  const days = useMemo(() => daysBetween(startDate, endDate), [startDate, endDate]);

  if (!open) return null;

  const handleCalculate = () => {
    const principal = parseAmount(amount);
    if (!principal || days <= 0) return;
    const dailyInterest = principal * 0.05;
    const totalInterest = dailyInterest * days;
    setResult({ days, dailyInterest, totalInterest, total: principal + totalInterest });
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="presentation">
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.interestHeader}>
          <h2 className={styles.interestTitle}>Basın İş — Günlük %5 Faiz Hesaplama</h2>
        </div>
        <div className={styles.modalBody}>
          <div>
            <label className={styles.modalLabel} htmlFor="press-interest-amount">
              Alacak tutarı (TL)
            </label>
            <DraftTextInput
              id="press-interest-amount"
              className={styles.modalInput}
              inputMode="decimal"
              placeholder="ör: 20.000,00"
              value={amount}
              onCommit={setAmount}
            />
          </div>
          <div className={styles.interestGrid}>
            <div>
              <label className={styles.modalLabel} htmlFor="press-interest-start">
                Gecikme başlangıcı
              </label>
              <DraftDateInput
                id="press-interest-start"
                className={styles.modalInput}
                value={startDate}
                onCommit={setStartDate}
              />
            </div>
            <div>
              <label className={styles.modalLabel} htmlFor="press-interest-end">
                Gecikme sonu
              </label>
              <DraftDateInput
                id="press-interest-end"
                className={styles.modalInput}
                value={endDate}
                onCommit={setEndDate}
              />
            </div>
          </div>
          {days > 0 ? <p className={styles.daysHint}>Gecikme süresi: {days} gün</p> : null}
          <Button type="button" variant="primary" onClick={handleCalculate} disabled={!amount || days <= 0}>
            Hesapla
          </Button>
          {result ? (
            <div className={styles.resultBox}>
              <div className={styles.resultRow}>
                <span>Gecikme dönemi</span>
                <strong>
                  {formatDateTr(startDate)} – {formatDateTr(endDate)}
                </strong>
              </div>
              <div className={styles.resultRow}>
                <span>Günlük faiz (%5)</span>
                <strong>{formatMoney(result.dailyInterest)} ₺</strong>
              </div>
              <div className={styles.resultRow}>
                <span>Toplam faiz ({result.days} gün)</span>
                <strong>{formatMoney(result.totalInterest)} ₺</strong>
              </div>
              <div className={`${styles.resultRow} ${styles.resultTotal}`}>
                <span>Genel toplam</span>
                <strong>{formatMoney(result.total)} ₺</strong>
              </div>
            </div>
          ) : null}
        </div>
        <div className={styles.modalFooter}>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Kapat
          </Button>
        </div>
      </div>
    </div>
  );
}
