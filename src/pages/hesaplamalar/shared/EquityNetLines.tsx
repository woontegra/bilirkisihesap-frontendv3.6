import type { ReactNode } from "react";

/** Sayfanın mevcut brütten-nete fonksiyonunun döndürdüğü kesinti dökümü. */
export type GrossNetBreakdown = {
  sgk: number;
  issizlik: number;
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  net: number;
};

export const SON_NET_LABEL = "Hakkaniyet İndirimi ve Mahsuplaşma Sonrası Net Alacak";

export function equityNetPreviewRows(opts: {
  format: (n: number) => string;
  kesinti: GrossNetBreakdown;
  sgkLabel: string;
  issizlikLabel: string;
  damgaLabel: string;
  gelirPrefix?: string;
  currencySuffix?: string;
}): string[][] {
  const suffix = opts.currencySuffix ?? "";
  const fmt = (n: number) => `${opts.format(n)}${suffix}`;
  const dilim = opts.kesinti.gelirVergisiDilimleri
    ? ` ${opts.kesinti.gelirVergisiDilimleri}`
    : "";
  return [
    [opts.sgkLabel, `-${fmt(opts.kesinti.sgk)}`],
    [opts.issizlikLabel, `-${fmt(opts.kesinti.issizlik)}`],
    [`${opts.gelirPrefix ?? "Gelir Vergisi"}${dilim}`.trim(), `-${fmt(opts.kesinti.gelirVergisi)}`],
    [opts.damgaLabel, `-${fmt(opts.kesinti.damgaVergisi)}`],
    [SON_NET_LABEL, fmt(opts.kesinti.net)],
  ];
}

type LineProps = {
  kesinti: GrossNetBreakdown;
  formatMoney: (n: number) => string;
  lineClass: string;
  deductClass?: string;
  netClass?: string;
  sgkLabel: string;
  issizlikLabel: string;
  damgaLabel: string;
  gelirPrefix?: string;
  /** Kesinti satırının kendisine eklenen sınıf (ör. kırmızı satır). */
  deductRowClass?: string;
  renderNet?: (formatted: string) => ReactNode;
};

/** Son Brüt üzerinden, sayfanın kendi brütten-nete kalemleri. */
export function EquityNetLines({
  kesinti,
  formatMoney,
  lineClass,
  deductClass,
  netClass,
  sgkLabel,
  issizlikLabel,
  damgaLabel,
  gelirPrefix = "Gelir Vergisi",
  deductRowClass,
  renderNet,
}: LineProps) {
  const dilim = kesinti.gelirVergisiDilimleri ? ` ${kesinti.gelirVergisiDilimleri}` : "";
  const netText = `${formatMoney(kesinti.net)} ₺`;
  const rowClass = deductRowClass ? `${lineClass} ${deductRowClass}` : lineClass;
  return (
    <>
      <div className={rowClass}>
        <span>{sgkLabel}</span>
        <span className={deductClass}>-{formatMoney(kesinti.sgk)} ₺</span>
      </div>
      <div className={rowClass}>
        <span>{issizlikLabel}</span>
        <span className={deductClass}>-{formatMoney(kesinti.issizlik)} ₺</span>
      </div>
      <div className={rowClass}>
        <span>
          {gelirPrefix}
          {dilim}
        </span>
        <span className={deductClass}>-{formatMoney(kesinti.gelirVergisi)} ₺</span>
      </div>
      <div className={rowClass}>
        <span>{damgaLabel}</span>
        <span className={deductClass}>-{formatMoney(kesinti.damgaVergisi)} ₺</span>
      </div>
      <div className={netClass ? `${lineClass} ${netClass}` : lineClass}>
        <span>{SON_NET_LABEL}</span>
        {renderNet ? renderNet(netText) : <strong>{netText}</strong>}
      </div>
    </>
  );
}
