import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Calculator, CirclePlay, Eye, FilePlus2, FolderOpen, Save, Scale, Trash2, X } from "lucide-react";
import { ApiError } from "@/api/client";
import { getSavedCase } from "@/api/savedCases";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { DraftDateInput, DraftTextInput } from "@/components/form";
import { GuidedTourHost, useGuidedTourController } from "@/components/guided-tour";
import tourStyles from "@/components/guided-tour/GuidedTour.module.css";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import { useCalculationTools } from "@/context/CalculationToolsContext";
import { useDeferredFormMemo } from "@/hooks/useDeferredFormMemo";
import { useCalculationCaseBinding } from "@/hooks/useCalculationCaseBinding";
import { createIcraGuidedTour, icraWelcomeCopy } from "./guidedTour";
import {
  buildIcraSaveResult,
  getIcraCaseCrud,
  listIcraCasesFromBackend,
  mapIcraFormFromBackend,
  resolveSavedCaseDisplayName,
} from "./backendCase";
import {
  calculateInterest,
  type InterestType,
} from "./lib/interestCalculator";
import { useDepositInterestRates } from "./lib/useDepositInterestRates";
import {
  buildSegmentedBreakdownRows,
  breakdownRowToPreview,
  computeDamgaOnly,
  computeNetFromGrossSingle,
  computeStandartBrutNetFromGross,
  formatMoney,
  hasTwoPeriods,
  parseNum,
  type SegmentedNetPanel,
} from "./lib/brutNet";
import {
  createEmptyForm,
  snapshotKey,
  type IcraForm,
  type IcraVariant,
  type SavedCase,
} from "./model";
import { clearCorruptCases, deleteCase } from "./storage";
import { InterestResultPanel } from "./InterestResultPanel";
import { fmtDateTR } from "./lib/format";
import pageStyles from "./IcraVariantPage.module.css";
import styles from "../kotu-niyet-tazminati/KotuNiyetTazminatiPage.module.css";

export type { IcraVariant };

type Props = {
  variant: IcraVariant;
  title: string;
  backTo?: string;
};

const VARIANT_DESCRIPTIONS: Record<IcraVariant, string> = {
  damga:
    "Yalnızca damga vergisi kesintisi uygulanır. Yasal faiz veya bankalarca mevduatlara uygulanan en yüksek faiz (TCMB EVDS) ile faiz hesabı yapılır.",
  "gelir-damga":
    "Brütten nete çeviri, asgari ücret gelir/damga vergi istisnası dahil hesaplanır. Çift asgari ücret dönemi olan yıllarda dönem seçimi uygulanır.",
  "istisnali-full":
    "Brütten nete çeviri (asgari ücret gelir/damga vergi istisnası dahil) hesaplaması.",
  "istisnasiz-full":
    "Brütten nete çeviri, standart fazla mesai hesaplamasıyla aynıdır (SGK %14 ve işsizlik %1 matrahtan düşülür; gelir vergisi yıla göre kademeli; damga binde 7,59; asgari ücret vergi istisnası uygulanmaz). Çift asgari dönemli yıllarda referans dönemi seçilebilir.",
};

const SEGMENTED_GROSS_LABEL: Partial<Record<IcraVariant, string>> = {
  "istisnali-full": "Brüt ücret",
};

const GROSS_INPUT_LABEL: Partial<Record<IcraVariant, string>> = {
  "istisnali-full": "Brüt ücret",
};

function computeBrutNet(
  variant: IcraVariant,
  gross: number,
  year: number,
  period: 1 | 2,
): SegmentedNetPanel | { gross: number; damgaVergisi: number; net: number } {
  if (gross <= 0) {
    return variant === "damga"
      ? { gross: 0, damgaVergisi: 0, net: 0 }
      : {
          gross: 0,
          sgk: 0,
          issizlik: 0,
          gelirVergisiBrut: 0,
          gelirVergisiIstisna: 0,
          gelirVergisi: 0,
          damgaVergisiBrut: 0,
          damgaVergisiIstisna: 0,
          damgaVergisi: 0,
          net: 0,
          gelirVergisiDilimleri: "",
        };
  }
  if (variant === "damga") return computeDamgaOnly(gross);
  if (variant === "istisnasiz-full") return computeStandartBrutNetFromGross(gross, year);
  return computeNetFromGrossSingle(gross, year, period);
}

function NameModal({
  open,
  initial,
  onClose,
  onConfirm,
}: {
  open: boolean;
  initial: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  if (!open) return null;
  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalCard}>
        <h3 className={styles.modalTitle}>Kaydı adlandır</h3>
        <label className={styles.label} htmlFor="icra-save-name">
          Kayıt adı
        </label>
        <input
          id="icra-save-name"
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onConfirm(name.trim());
          }}
        />
        <div className={styles.modalActions}>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="button" variant="primary" size="sm" disabled={!name.trim()} onClick={() => onConfirm(name.trim())}>
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function IcraVariantPage({ variant, title, backTo = "/icra-takip-brutten-nete" }: Props) {
  const { success, error: showError, info: toastInfo } = useToast();
  const { beginNewCalculation } = useCalculationTools();
  const tour = useGuidedTourController();
  const tourDefinition = useMemo(() => createIcraGuidedTour(variant), [variant]);
  const welcomeCopy = useMemo(() => icraWelcomeCopy(variant), [variant]);
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");
  const backendLoadedCaseIdRef = useRef<string | null>(null);

  const [form, setForm] = useState<IcraForm>(createEmptyForm);
  const [cases, setCases] = useState<SavedCase[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  useCalculationCaseBinding(activeId);
  const [baseline, setBaseline] = useState(() => snapshotKey(createEmptyForm()));
  const [nameOpen, setNameOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [caseSaving, setCaseSaving] = useState(false);

  useEffect(() => {
    document.title = `${title} | Bilirkişi Hesap`;
  }, [title]);

  const setCaseIdParam = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("caseId", id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const { grossVal, brutNet, netTutar } = useDeferredFormMemo(form, (f) => {
    const gross = parseNum(f.grossForNet);
    const panel = computeBrutNet(variant, gross, f.year, f.period);
    return { grossVal: gross, brutNet: panel, netTutar: panel.net };
  });

  const twoPeriods = hasTwoPeriods(form.year);
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(
    () => Array.from({ length: currentYear - 2009 }, (_, i) => currentYear - i),
    [currentYear],
  );

  const segmentedBreakdown = useMemo(() => {
    if (!("sgk" in brutNet) || grossVal <= 0) return [];
    return buildSegmentedBreakdownRows(brutNet, {
      grossLabel: SEGMENTED_GROSS_LABEL[variant] ?? "Brüt alacak",
      netLabel:
        variant === "istisnasiz-full"
          ? "Ödenecek net tutar"
          : variant === "gelir-damga" || variant === "istisnali-full"
            ? "Net tutar (anapara)"
            : "Ödenecek net tutar",
    });
  }, [brutNet, grossVal, variant]);

  const interestType: InterestType = form.faizTuru === "yasal" ? "LEGAL_INTEREST" : "HIGHEST_DEPOSIT_INTEREST";
  const depositEnabled = interestType === "HIGHEST_DEPOSIT_INTEREST";
  const {
    periods: depositInterestPeriods,
    loading: depositLoading,
    error: depositInterestError,
  } = useDepositInterestRates({
    enabled: depositEnabled,
    startDate: form.faizBaslangic,
    endDate: form.icraTakip,
    principal: netTutar,
  });

  const interestResult = useMemo(() => {
    if (netTutar <= 0 || !form.faizBaslangic || !form.icraTakip) return null;
    if (depositEnabled && depositInterestError) {
      return { ok: false as const, message: depositInterestError };
    }
    if (depositEnabled && depositLoading) return null;
    return calculateInterest({
      principal: netTutar,
      startDate: form.faizBaslangic,
      endDate: form.icraTakip,
      interestType,
      depositInterestRates: depositEnabled ? depositInterestPeriods : undefined,
    });
  }, [
    netTutar,
    form.faizBaslangic,
    form.icraTakip,
    interestType,
    depositEnabled,
    depositInterestPeriods,
    depositInterestError,
    depositLoading,
  ]);

  const isInterestOk = interestResult?.ok === true;
  const interestWarning = interestResult && !interestResult.ok ? interestResult.message : null;
  const totalInterest = isInterestOk ? interestResult.totalInterest : 0;
  const totalDays = isInterestOk ? interestResult.totalDays : 0;
  const takipToplami = isInterestOk ? netTutar + totalInterest : netTutar;
  const dirty = snapshotKey(form) !== baseline;

  const reloadCases = useCallback(async () => {
    try {
      const items = await listIcraCasesFromBackend(variant);
      setStorageError(null);
      setCases(items);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Kayıtlar yüklenemedi";
      setStorageError(message);
      setCases([]);
    }
  }, [variant]);

  useEffect(() => {
    reloadCases();
  }, [reloadCases]);

  useEffect(() => {
    if (!caseIdParam) {
      backendLoadedCaseIdRef.current = null;
      return;
    }
    if (backendLoadedCaseIdRef.current === caseIdParam) return;
    const numericId = Number(caseIdParam);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      showError("Geçersiz kayıt kimliği");
      return;
    }
    let cancelled = false;
    void getSavedCase(numericId)
      .then((record) => {
        if (cancelled) return;
        const mapped = mapIcraFormFromBackend(record.data);
        if (!mapped) {
          showError("Kayıt formu okunamadı");
          return;
        }
        setForm(mapped);
        setActiveId(String(numericId));
        setActiveName(resolveSavedCaseDisplayName(record));
        setBaseline(snapshotKey(mapped));
        backendLoadedCaseIdRef.current = caseIdParam;
        success(`Kayıt yüklendi: ${resolveSavedCaseDisplayName(record)}`);
        const next = new URLSearchParams(searchParams);
        next.delete("caseId");
        setSearchParams(next, { replace: true });
      })
      .catch(() => {
        if (!cancelled) {
          backendLoadedCaseIdRef.current = null;
          showError("Kayıt yüklenemedi");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [caseIdParam, searchParams, setSearchParams, showError, success]);

  const applyCase = (c: SavedCase) => {
    setForm({ ...c.form });
    setActiveId(c.id);
    setActiveName(c.name);
    setBaseline(snapshotKey(c.form));
    setListOpen(false);
  };

  const resetForm = () => {
    beginNewCalculation();
    const empty = createEmptyForm();
    setForm(empty);
    setActiveId(null);
    setActiveName(null);
    setBaseline(snapshotKey(empty));
  };

  const handleSave = useCallback(
    async (name: string, existingId?: string | null) => {
      if (!isInterestOk) {
        showError("Önce geçerli bir faiz hesaplaması yapın");
        return;
      }
      const results = { netTutar, totalInterest, takipToplami, totalDays };
      setCaseSaving(true);
      const wasUpdate = !!(existingId && /^\d+$/.test(existingId));
      try {
        const record = await getIcraCaseCrud(variant).saveCase(
          name,
          form,
          buildIcraSaveResult(grossVal, results),
          existingId,
        );
        const recordId = String(record.id);
        setActiveId(recordId);
        setActiveName(resolveSavedCaseDisplayName(record));
        setBaseline(snapshotKey(form));
        setCaseIdParam(recordId);
        backendLoadedCaseIdRef.current = recordId;
        setNameOpen(false);
        await reloadCases();
        success(wasUpdate ? "Kayıt güncellendi" : "Kayıt kaydedildi");
      } catch (error) {
        showError(
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Kayıt yapılamadı",
        );
      } finally {
        setCaseSaving(false);
      }
    },
    [
      form,
      grossVal,
      isInterestOk,
      netTutar,
      reloadCases,
      setCaseIdParam,
      showError,
      success,
      takipToplami,
      totalDays,
      totalInterest,
      variant,
    ],
  );

  const previewSections = useMemo((): PreviewSection[] => {
    const kesintiRows: string[][] =
      variant === "damga"
        ? [
            ["Brüt alacak", `${formatMoney(grossVal)} ₺`],
            ...( "damgaVergisi" in brutNet
              ? [["Damga vergisi (binde 7,59)", `−${formatMoney(brutNet.damgaVergisi)} ₺`]]
              : []),
            ["Net tutar (anapara)", `${formatMoney(netTutar)} ₺`],
          ]
        : [
            ["Yıl / dönem", `${form.year} / ${form.period}`],
            ...segmentedBreakdown.map(breakdownRowToPreview),
          ];

    const sections: PreviewSection[] = [
      {
        id: "kesinti",
        title: "Brütten nete çevir",
        headers: ["Kalem", "Tutar"],
        rows: kesintiRows,
        lastRowTone: "green",
      },
      {
        id: "faiz-meta",
        title: "Faiz hesaplama verileri",
        headers: ["Kalem", "Değer"],
        rows: [
          ["Faiz başlangıç", fmtDateTR(form.faizBaslangic)],
          ["İcra takip", fmtDateTR(form.icraTakip)],
          [
            "Faiz türü",
            form.faizTuru === "yasal" ? "Yasal Faiz" : "Bankalarca Mevduatlara Uygulanan En Yüksek Faiz",
          ],
          ["Gün sayısı", isInterestOk ? `${totalDays} gün` : "—"],
        ],
      },
    ];

    if (isInterestOk && interestResult?.ok) {
      sections.push({
        id: "faiz-donemleri",
        title: "Faiz dönemleri",
        headers: ["Başlangıç", "Bitiş", "Gün", "Oran", "Faiz tutarı"],
        rows: interestResult.periods.map((p) => [
          fmtDateTR(p.startDate),
          fmtDateTR(p.endDate),
          String(p.days),
          `%${p.rate}`,
          `${formatMoney(p.interest)} ₺`,
        ]),
      });
      sections.push({
        id: "faiz-toplam",
        title: "Faiz toplamları",
        headers: ["Kalem", "Tutar"],
        rows: [
          ["Toplam faiz tutarı", `${formatMoney(totalInterest)} ₺`],
          ["Takip toplamı", `${formatMoney(takipToplami)} ₺`],
        ],
        lastRowTone: "blue",
      });
    }

    return sections;
  }, [
    brutNet,
    form,
    grossVal,
    interestResult,
    isInterestOk,
    netTutar,
    takipToplami,
    totalDays,
    segmentedBreakdown,
    totalInterest,
    variant,
  ]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroIcon} aria-hidden>
            <Scale size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p className={styles.helper}>
              <Link to={backTo}>← İcra Takip Brütten Nete</Link>
            </p>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.desc}>{VARIANT_DESCRIPTIONS[variant]}</p>
          </div>
        </div>
        <div className={styles.heroAside}>
          {activeName ? (
            <div className={styles.recordBadge}>
              <span>{activeName}</span>
            </div>
          ) : null}
          <div className={styles.quickTotal}>
            <span>{isInterestOk ? "Takip toplamı" : "Net tutar"}</span>
            <span className={styles.quickTotalValue}>
              {formatMoney(isInterestOk ? takipToplami : netTutar)} ₺
            </span>
          </div>
          <div className={styles.heroActions}>
            <Button
              type="button"
              variant="soft"
              size="sm"
              className={tourStyles.howToBtn}
              onClick={() => tour.openTour(0)}
              aria-label="Nasıl kullanılır? Etkileşimli kılavuzu başlat"
            >
              <CirclePlay size={14} /> Nasıl kullanılır?
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setListOpen(true)}>
              <FolderOpen size={14} /> Kayıtlar
            </Button>
            <Button
              type="button"
              variant="soft"
              size="sm"
              onClick={() => (dirty ? setConfirmNew(true) : resetForm())}
            >
              <FilePlus2 size={14} /> Yeni Hesaplama
            </Button>
          </div>
        </div>
      </header>

      {storageError ? (
        <div className={styles.storageBanner}>
          {storageError}{" "}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              clearCorruptCases(variant);
              setStorageError(null);
              reloadCases();
            }}
          >
            Temizle
          </Button>
        </div>
      ) : null}

      <div className={styles.layout}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <Calculator size={16} />
            <h2 className={styles.cardTitle}>Brütten nete çevir</h2>
          </div>
          <div className={styles.fields}>
            <div data-tour="icra-ucret">
              <label className={styles.label} htmlFor="icra-brut">
                {GROSS_INPUT_LABEL[variant] ?? "Brüt alacak tutarı"}
              </label>
              <DraftTextInput
                id="icra-brut"
                className={styles.input}
                inputMode="decimal"
                placeholder="Örn: 30.000,00"
                value={form.grossForNet}
                onCommit={(value) => setForm((f) => ({ ...f, grossForNet: value }))}
              />
            </div>

            {variant !== "damga" ? (
              <div data-tour="icra-donem">
                <div>
                  <label className={styles.label} htmlFor="icra-yil">
                    Gelir vergisi yılı
                  </label>
                  <select
                    id="icra-yil"
                    className={styles.input}
                    value={form.year}
                    onChange={(e) => {
                      const nextYear = Number(e.target.value);
                      setForm((f) => ({
                        ...f,
                        year: nextYear,
                        period: hasTwoPeriods(nextYear) ? f.period : 2,
                      }));
                    }}
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
                {twoPeriods ? (
                  <div>
                    <label className={styles.label} htmlFor="icra-period">
                      {variant === "istisnasiz-full" ? "Dönem (referans)" : "Dönem"}
                    </label>
                    <select
                      id="icra-period"
                      className={styles.input}
                      value={form.period}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, period: Number(e.target.value) === 1 ? 1 : 2 }))
                      }
                    >
                      <option value={1}>Oca–Haz</option>
                      <option value={2}>Tem–Ara</option>
                    </select>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className={pageStyles.brutBreakdown}>
            {variant === "damga" ? (
              <div className={pageStyles.breakdownRow}>
                <span className={pageStyles.breakdownLabel}>Brüt alacak tutarı</span>
                <span className={pageStyles.breakdownValue}>{formatMoney(grossVal)} ₺</span>
              </div>
            ) : null}
            {variant === "damga" && "damgaVergisi" in brutNet ? (
              <div className={pageStyles.breakdownRow}>
                <span className={pageStyles.breakdownLabel}>Damga vergisi (binde 7,59)</span>
                <span className={`${pageStyles.breakdownValue} ${pageStyles.breakdownDeduction}`}>
                  −{formatMoney(brutNet.damgaVergisi)} ₺
                </span>
              </div>
            ) : null}
            {segmentedBreakdown.map((row) => (
              <div
                key={row.label}
                className={`${pageStyles.breakdownRow}${row.emphasize ? ` ${pageStyles.breakdownEmphasis}` : ""}`}
              >
                <span className={pageStyles.breakdownLabel}>{row.label}</span>
                <span
                  className={`${pageStyles.breakdownValue} ${
                    row.display === "deduction"
                      ? pageStyles.breakdownDeduction
                      : row.display === "positive"
                        ? pageStyles.breakdownPositive
                        : row.display === "net"
                          ? pageStyles.breakdownNet
                          : ""
                  }`}
                >
                  {row.display === "positive" ? "+" : row.display === "deduction" ? "−" : ""}
                  {formatMoney(row.amount)} ₺
                </span>
              </div>
            ))}
            {variant === "damga" ? (
              <div className={pageStyles.breakdownRow}>
                <span className={pageStyles.breakdownLabel}>Net tutar (anapara)</span>
                <span className={`${pageStyles.breakdownValue} ${pageStyles.breakdownNet}`}>
                  {formatMoney(netTutar)} ₺
                </span>
              </div>
            ) : null}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Faiz</h2>
          </div>
          <div className={styles.fields} data-tour="icra-faiz">
            <div>
              <label className={styles.label} htmlFor="icra-faiz-bas">
                Faiz başlangıç tarihi
              </label>
              <DraftDateInput
                id="icra-faiz-bas"
                max="9999-12-31"
                className={styles.input}
                value={form.faizBaslangic}
                onCommit={(value) => setForm((f) => ({ ...f, faizBaslangic: value }))}
              />
            </div>
            <div>
              <label className={styles.label} htmlFor="icra-takip-tarih">
                İcra takip tarihi
              </label>
              <DraftDateInput
                id="icra-takip-tarih"
                max="9999-12-31"
                className={styles.input}
                value={form.icraTakip}
                onCommit={(value) => setForm((f) => ({ ...f, icraTakip: value }))}
              />
            </div>
            <div>
              <label className={styles.label} htmlFor="icra-faiz-turu">
                Faiz türü
              </label>
              <select
                id="icra-faiz-turu"
                className={styles.input}
                value={form.faizTuru}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    faizTuru: e.target.value as "yasal" | "en_yuksek_mevduat",
                  }))
                }
              >
                <option value="yasal">Yasal Faiz</option>
                <option value="en_yuksek_mevduat">
                  Bankalarca mevduatlara uygulanan en yüksek faiz
                </option>
              </select>
            </div>
          </div>
          {form.faizTuru === "en_yuksek_mevduat" ? (
            <p className={styles.note}>
              Faiz oranları{" "}
              <span style={{ fontFamily: "monospace" }}>evds3.tcmb.gov.tr</span> güncel verilerinden alınır.
            </p>
          ) : null}
          {depositLoading ? <p className={styles.helper}>Mevduat faiz oranları yükleniyor…</p> : null}
          {interestWarning ? <p className={styles.helper}>{interestWarning}</p> : null}
          {isInterestOk && interestResult?.ok ? (
            <div className={styles.resultCard} style={{ marginTop: "0.85rem" }}>
              <div className={styles.helper}>
                Faiz gün: {totalDays} · Faiz: {formatMoney(totalInterest)} ₺
              </div>
              <div className={styles.resultLabel}>Takip toplamı</div>
              <div className={styles.resultValue}>{formatMoney(takipToplami)} ₺</div>
            </div>
          ) : null}
        </section>
      </div>

      {isInterestOk && interestResult?.ok ? (
        <InterestResultPanel
          variant={variant}
          grossVal={grossVal}
          brutNet={brutNet}
          faizBaslangic={form.faizBaslangic}
          icraTakip={form.icraTakip}
          faizTuru={form.faizTuru}
          interestResult={interestResult}
          totalInterest={totalInterest}
          takipToplami={takipToplami}
        />
      ) : null}

      <div
        className={`${styles.stickyBar} ${dirty ? styles.stickyBarDirty : ""}`}
        data-tour="icra-kaydet-actions"
      >
        <div className={styles.stickyInner}>
          <div className={styles.stickyStatus}>
            {dirty ? "Kaydedilmemiş değişiklikler var" : activeName ? `Kayıt: ${activeName}` : "Yeni hesaplama"}
          </div>
          <div className={styles.stickyActions}>
            <Button type="button" variant="soft" size="sm" onClick={() => setPreviewOpen(true)} disabled={grossVal <= 0}>
              <Eye size={14} /> Önizleme
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => (dirty ? setConfirmNew(true) : resetForm())}>
              <FilePlus2 size={14} /> Yeni
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={caseSaving || !isInterestOk}
              onClick={() => {
                if (activeId && activeName && /^\d+$/.test(activeId)) {
                  void handleSave(activeName, activeId);
                  return;
                }
                setNameOpen(true);
              }}
            >
              <Save size={14} />{" "}
              {caseSaving ? "Kaydediliyor…" : activeId && /^\d+$/.test(activeId) ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>

      <NameModal
        open={nameOpen}
        initial={activeName ?? title}
        onClose={() => setNameOpen(false)}
        onConfirm={(name) => void handleSave(name, null)}
      />

      {listOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className={styles.modalTitle}>Kayıtlı hesaplamalar</h3>
              <Button type="button" variant="ghost" size="icon" onClick={() => setListOpen(false)} aria-label="Kapat">
                <X size={16} />
              </Button>
            </div>
            {cases.length === 0 ? (
              <p className={styles.helper}>Henüz kayıt yok.</p>
            ) : (
              <div className={styles.caseList}>
                {cases.map((c) => (
                  <div key={c.id} className={styles.caseItem}>
                    <div style={{ minWidth: 0 }}>
                      <div className={styles.caseName}>{c.name}</div>
                      <div className={styles.caseMeta}>
                        {new Date(c.updatedAt).toLocaleString("tr-TR")} · Net {formatMoney(c.results.netTutar)} ₺
                      </div>
                    </div>
                    <div className={styles.caseBtns}>
                      <Button type="button" variant="soft" size="sm" onClick={() => applyCase(c)}>
                        Aç
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="icon"
                        aria-label="Sil"
                        onClick={() => setConfirmDeleteId(c.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmNew}
        title="Yeni hesaplama"
        description="Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?"
        confirmLabel="Devam et"
        onConfirm={() => {
          setConfirmNew(false);
          resetForm();
        }}
        onCancel={() => setConfirmNew(false)}
      />
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Kaydı sil"
        description="Bu kayıt kalıcı olarak silinecek."
        confirmLabel="Sil"
        danger
        onConfirm={async () => {
          if (!confirmDeleteId) return;
          try {
            if (/^\d+$/.test(confirmDeleteId)) {
              await getIcraCaseCrud(variant).removeCase(confirmDeleteId);
            } else {
              deleteCase(variant, confirmDeleteId);
            }
            if (activeId === confirmDeleteId) resetForm();
            setConfirmDeleteId(null);
            await reloadCases();
            success("Kayıt silindi");
          } catch (error) {
            showError(
              error instanceof ApiError
                ? error.message
                : error instanceof Error
                  ? error.message
                  : "Kayıt silinemedi",
            );
          }
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <CalculationPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={`${title} — Önizleme`}
        sections={previewSections}
        contentId={`icra-${variant}-preview`}
      />

      <GuidedTourHost
        definition={tourDefinition}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={welcomeCopy.title}
        welcomeBody={welcomeCopy.body}
        welcomeStartLabel="Başlat"
        welcomeLaterLabel="Kendim devam edeceğim"
        initialStepIndex={tour.resumeStepIndex}
        onCollectingComplete={() => {
          tour.completeTour();
          toastInfo("Kılavuz tamamlandı. Hesaplamanızı önizleyebilir veya kaydedebilirsiniz.");
        }}
        paused={previewOpen || nameOpen || listOpen}
      />
    </div>
  );
}
