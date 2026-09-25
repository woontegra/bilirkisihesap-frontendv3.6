/**
 * İhbar Tazminatı — 7 varyant için paylaşılan sunum (presentational) bileşeni.
 * İş mantığı İÇERMEZ: tüm state ve hesap her varyantın kendi Page.tsx'inde tutulur,
 * burada yalnızca kontrollü (controlled) alanlar ve düzen (layout) render edilir.
 * Yalnızca ihbar-tazminati modülü içinde paylaşılır.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Calculator,
  CirclePlay,
  Download,
  Eye,
  FilePlus2,
  FolderOpen,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { GuidedTourHost, useGuidedTourController } from "@/components/guided-tour";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import {
  applyExtraSetItems,
  collectExtraSetItems,
  tryMergeLegacyExtraSets,
} from "@/lib/localExtraSetsHelpers";
import {
  deleteLocalExtraSet,
  listLocalExtraSets,
  type LocalExtraSet,
  upsertLocalExtraSet,
} from "@/lib/localExtraSetsStore";
import { computeEklentiResult } from "./core";
import {
  createIhbarGuidedTour,
  IHBAR_TOUR_WELCOME_BODY,
  IHBAR_TOUR_WELCOME_TITLE,
} from "./guidedTour";
import { formatMoney } from "./money";
import type { CaseListEntry, ExtraItem, NoteBlock } from "./types";
import styles from "./IhbarPageView.module.css";
import tourStyles from "@/components/guided-tour/GuidedTour.module.css";

export function FlashValue({ value, className }: { value: string; className?: string }) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), 450);
      return () => window.clearTimeout(t);
    }
  }, [value]);
  return <span className={`${className ?? ""} ${flash ? styles.valueFlash : ""}`.trim()}>{value}</span>;
}

export function AnimatedMoney({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const from = display;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const dur = 380;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animate from last displayed value
  }, [value, reduce]);

  return <>{formatMoney(display)}</>;
}

function NameModal({
  open,
  initial,
  title = "Kaydı adlandır",
  fieldLabel = "Kayıt adı",
  busyLabel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  initial: string;
  title?: string;
  fieldLabel?: string;
  busyLabel?: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  if (!open) return null;
  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div
        className={styles.modalCard}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={styles.modalTitle}>{title}</h3>
        <label className={styles.label} htmlFor="ihbar-save-name">
          {fieldLabel}
        </label>
        <input
          id="ihbar-save-name"
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
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!name.trim()}
            onClick={() => onConfirm(name.trim())}
          >
            {busyLabel ?? "Kaydet"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export type WageFieldKey = "prim" | "ikramiye" | "yol" | "yemek";

export type IhbarPageViewProps = {
  pageTitle: string;
  pageDescription: string;
  icon: LucideIcon;
  previewTitle: string;
  previewContentId: string;

  startDate: string;
  endDate: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onDateBlur: () => void;
  dateError: string | null;
  startDateLabel?: string;
  endDateLabel?: string;
  workPeriodLabel: string;

  extraDateField?: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    helper?: string;
    resultLabel: string;
    resultValue: string;
  };

  brut: string;
  onBrutChange: (v: string) => void;
  asgariUcretHatasi: string | null;
  wage: Record<WageFieldKey, string>;
  onWageChange: (field: WageFieldKey, value: string) => void;
  extras: ExtraItem[];
  onAddExtra: () => void;
  onUpdateExtra: (id: string, patch: Partial<ExtraItem>) => void;
  onRemoveExtra: (id: string) => void;
  /** Ekstra set içe aktarımında sabit ücret + extras’ı tek seferde yazar. */
  onReplaceExtrasAndWage?: (wage: Record<WageFieldKey, string>, extras: ExtraItem[]) => void;
  /** Lokal ekstra set deposu anahtarı (varsayılan: ihbar-tazminati). */
  extraSetsModuleId?: string;
  removingExtraIds: string[];
  toplamBrut: number;

  ihbarSuresiLabel: string;
  formulaText: string;
  brutSonuc: number;
  gelirVergisi: number;
  gelirVergisiDilimleri?: string;
  damgaVergisi: number;
  net: number;

  notes: NoteBlock[];

  activeName: string | null;
  dirty: boolean;
  isUpdate: boolean;
  cases: CaseListEntry[];
  storageError: string | null;
  onClearStorageError: () => void;

  nameOpen: boolean;
  setNameOpen: (v: boolean) => void;
  listOpen: boolean;
  setListOpen: (v: boolean) => void;
  previewOpen: boolean;
  setPreviewOpen: (v: boolean) => void;
  confirmNew: boolean;
  setConfirmNew: (v: boolean) => void;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (v: string | null) => void;

  onNewClick: () => void;
  onConfirmNew: () => void;
  onSaveClick: () => void;
  onPersist: (name: string) => void;
  onOpenCase: (id: string) => void;
  onConfirmDelete: () => void;

  previewSections: PreviewSection[];
  extraCard?: ReactNode;
  caseSaving?: boolean;
  caseLoading?: boolean;
  /**
   * Sayfa bazlı kılavuz persistence anahtarı (örn. ihbar-30isci).
   * Kıdem anahtarlarıyla çakışmamalı; her ihbar varyantı ayrı olmalı.
   */
  guidedTourId: string;
};

const WAGE_LABELS: Record<WageFieldKey, string> = {
  prim: "Prim",
  ikramiye: "İkramiye",
  yol: "Yol",
  yemek: "Yemek",
};

type EklentiTarget = { kind: "field"; field: WageFieldKey } | { kind: "extra"; id: string };

function eklentiKeyOf(target: EklentiTarget): string {
  return target.kind === "field" ? `field:${target.field}` : `extra:${target.id}`;
}

function emptyMonths(): string[] {
  return Array.from({ length: 12 }, () => "");
}

export function IhbarPageView(props: IhbarPageViewProps) {
  const Icon = props.icon;
  const { success, error: showError, info: toastInfo } = useToast();
  const extraSetsModuleId = props.extraSetsModuleId ?? "ihbar-tazminati";
  const tour = useGuidedTourController();
  const tourDefinition = useMemo(
    () => createIhbarGuidedTour(props.guidedTourId),
    [props.guidedTourId],
  );
  const [eklentiFor, setEklentiFor] = useState<EklentiTarget | null>(null);
  const [eklentiMonths, setEklentiMonths] = useState<Record<string, string[]>>({});
  const [extraSaveOpen, setExtraSaveOpen] = useState(false);
  const [extraImportOpen, setExtraImportOpen] = useState(false);
  const [savedExtraSets, setSavedExtraSets] = useState<LocalExtraSet[]>([]);

  const refreshExtraSets = useCallback(async () => {
    setSavedExtraSets(await listLocalExtraSets(extraSetsModuleId));
  }, [extraSetsModuleId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const merged = await tryMergeLegacyExtraSets(extraSetsModuleId);
      if (cancelled) return;
      if (merged && merged.imported > 0) {
        success(`${merged.imported} eski ekstra set hesaba aktarıldı`);
      }
      await refreshExtraSets();
    })();
    return () => {
      cancelled = true;
    };
  }, [extraSetsModuleId, refreshExtraSets, success]);

  const hasExtraSetData =
    !!(props.wage.prim || props.wage.ikramiye || props.wage.yol || props.wage.yemek) ||
    props.extras.length > 0;

  const openExtraImport = () => {
    void refreshExtraSets().then(() => setExtraImportOpen(true));
  };

  const persistExtraSet = (name: string) => {
    void (async () => {
      try {
        const items = collectExtraSetItems(props.wage, props.extras);
        await upsertLocalExtraSet(extraSetsModuleId, name, items);
        await refreshExtraSets();
        setExtraSaveOpen(false);
        success("Ekstra hesaplamalar kaydedildi");
      } catch (err) {
        showError(err instanceof Error ? err.message : "Kaydedilemedi");
      }
    })();
  };

  const importExtraSet = (set: LocalExtraSet) => {
    if (!props.onReplaceExtrasAndWage) {
      showError("Bu sayfada set içe aktarma desteklenmiyor");
      return;
    }
    const { wage, extras } = applyExtraSetItems(set.data);
    props.onReplaceExtrasAndWage(wage, extras);
    setExtraImportOpen(false);
    success("Ekstra hesaplamalar yüklendi");
  };

  const removeExtraSet = (id: string) => {
    void (async () => {
      await deleteLocalExtraSet(extraSetsModuleId, id);
      await refreshExtraSets();
      success("Set silindi");
    })();
  };

  const rescanLegacy = async () => {
    const merged = await tryMergeLegacyExtraSets(extraSetsModuleId, { force: true });
    await refreshExtraSets();
    if (!merged) {
      success("Hesap setleri kullanılıyor (eski sunucu setleri alınamadı)");
      return;
    }
    success(
      merged.imported > 0
        ? `${merged.imported} set eklendi (${merged.skipped} atlandı)`
        : `Yeni set yok (${merged.skipped} atlandı)`,
    );
  };

  const openEklenti = (target: EklentiTarget) => {
    const key = eklentiKeyOf(target);
    setEklentiMonths((prev) => (prev[key] ? prev : { ...prev, [key]: emptyMonths() }));
    setEklentiFor(target);
  };

  const applyEklenti = () => {
    if (!eklentiFor) return;
    const key = eklentiKeyOf(eklentiFor);
    const months = eklentiMonths[key] ?? emptyMonths();
    const formatted = formatMoney(computeEklentiResult(months) || 0);
    if (eklentiFor.kind === "field") {
      props.onWageChange(eklentiFor.field, formatted);
    } else {
      props.onUpdateExtra(eklentiFor.id, { value: formatted });
    }
    setEklentiFor(null);
  };

  const eklentiKey = eklentiFor ? eklentiKeyOf(eklentiFor) : null;
  const eklentiPreview = eklentiKey ? computeEklentiResult(eklentiMonths[eklentiKey] ?? emptyMonths()) : 0;
  const eklentiTitle = (() => {
    if (!eklentiFor) return "Eklenti hesaplama";
    if (eklentiFor.kind === "extra") return "Eklenti hesaplama";
    return `${WAGE_LABELS[eklentiFor.field]} için eklenti hesapla`;
  })();

  return (
    <div className={styles.page} aria-busy={props.caseLoading || undefined}>
      {props.caseLoading ? (
        <div className={styles.privacyBadge} role="status">
          Sunucu kaydı yükleniyor…
        </div>
      ) : null}
      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroIcon} aria-hidden>
            <Icon size={22} />
          </div>
          <div>
            <h1 className={styles.title}>{props.pageTitle}</h1>
            <p className={styles.desc}>{props.pageDescription}</p>
            <div className={styles.privacyBadge}>
              <ShieldCheck size={14} />
              <span>Veriler hesabınıza güvenli şekilde kaydedilir</span>
            </div>
          </div>
        </div>
        <div className={styles.heroAside}>
          {props.activeName ? (
            <div className={styles.recordBadge}>
              <FolderOpen size={13} />
              <span>{props.activeName}</span>
              {props.dirty ? <em>· değişti</em> : null}
            </div>
          ) : null}
          <div className={styles.heroActions}>
            <Button
              type="button"
              variant="soft"
              size="sm"
              className={tourStyles.howToBtn}
              onClick={() => tour.openTour(0)}
              aria-label="Nasıl kullanılır? Etkileşimli kılavuzu başlat"
            >
              <CirclePlay size={14} />
              Nasıl kullanılır?
            </Button>
            <Button type="button" variant="soft" size="sm" onClick={() => props.setListOpen(true)}>
              <FolderOpen size={14} />
              Kayıtlar ({props.cases.length})
            </Button>
            <Button type="button" variant="soft" size="sm" onClick={props.onNewClick}>
              <FilePlus2 size={14} />
              Yeni Hesaplama
            </Button>
          </div>
        </div>
      </header>

      {props.storageError ? (
        <div className={styles.storageBanner} role="alert">
          <p>{props.storageError}</p>
          <Button type="button" variant="soft" size="sm" onClick={props.onClearStorageError}>
            Temizle ve devam et
          </Button>
        </div>
      ) : null}

      <div className={styles.layout}>
        <div style={{ display: "grid", gap: "0.85rem", minWidth: 0 }}>
          <section className={styles.card} data-tour="ihbar-tarihler">
            <div className={styles.cardHead}>
              <Calculator size={16} />
              <h2 className={styles.cardTitle}>Tarih bilgileri</h2>
            </div>
            <div className={styles.fields3}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ihbar-start-date">
                  {props.startDateLabel ?? "İşe giriş"}
                </label>
                <input
                  id="ihbar-start-date"
                  type="date"
                  max="9999-12-31"
                  className={`${styles.input} ${props.dateError ? styles.inputError : ""}`}
                  value={props.startDate}
                  onChange={(e) => props.onStartDateChange(e.target.value)}
                  onBlur={props.onDateBlur}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ihbar-end-date">
                  {props.endDateLabel ?? "İşten çıkış"}
                </label>
                <input
                  id="ihbar-end-date"
                  type="date"
                  max="9999-12-31"
                  className={`${styles.input} ${props.dateError ? styles.inputError : ""}`}
                  value={props.endDate}
                  onChange={(e) => props.onEndDateChange(e.target.value)}
                  onBlur={props.onDateBlur}
                />
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Çalışma süresi</span>
                <div className={styles.readonlyBox}>
                  <FlashValue value={props.workPeriodLabel || "—"} />
                </div>
              </div>
            </div>
            {props.dateError ? <p className={styles.warn}>{props.dateError}</p> : null}

            {props.extraDateField ? (
              <div className={styles.extraDateBlock}>
                <div className={styles.fields2}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="ihbar-extra-date">
                      {props.extraDateField.label}
                    </label>
                    <input
                      id="ihbar-extra-date"
                      type="date"
                      max="9999-12-31"
                      className={styles.input}
                      value={props.extraDateField.value}
                      onChange={(e) => props.extraDateField?.onChange(e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <span className={styles.label}>{props.extraDateField.resultLabel}</span>
                    <div className={styles.readonlyBox}>
                      <FlashValue value={props.extraDateField.resultValue || "—"} />
                    </div>
                  </div>
                </div>
                {props.extraDateField.helper ? (
                  <p className={styles.helper}>{props.extraDateField.helper}</p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className={styles.card}>
            <div className={styles.cardTitleRow}>
              <div className={styles.cardHead} style={{ marginBottom: 0 }}>
                <Calculator size={16} />
                <h2 className={styles.cardTitle}>Ücret kalemleri</h2>
              </div>
              <div className={styles.inlineActions}>
                <Button type="button" variant="soft" size="sm" onClick={openExtraImport}>
                  <Download size={14} /> İçe Aktar
                </Button>
                <Button
                  type="button"
                  variant="soft"
                  size="sm"
                  onClick={() => setExtraSaveOpen(true)}
                  disabled={!hasExtraSetData}
                >
                  <Save size={14} /> Kaydet
                </Button>
              </div>
            </div>
            <div className={styles.fields} data-tour="ihbar-brut">
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ihbar-brut">
                  Brüt ücret
                </label>
                <div className={styles.inputWrap}>
                  <input
                    id="ihbar-brut"
                    className={`${styles.inputBare} ${props.asgariUcretHatasi ? styles.inputError : ""}`}
                    inputMode="decimal"
                    placeholder="0,00"
                    value={props.brut}
                    onChange={(e) => props.onBrutChange(e.target.value)}
                  />
                  <span className={styles.currency} aria-hidden>
                    ₺
                  </span>
                </div>
                {props.asgariUcretHatasi ? <p className={styles.warn}>{props.asgariUcretHatasi}</p> : null}
              </div>
            </div>

            <div data-tour="ihbar-ekstra">
            <div className={styles.wageGrid}>
              {(Object.keys(WAGE_LABELS) as WageFieldKey[]).map((field) => (
                <div key={field} className={styles.fixedExtraRow}>
                  <input
                    className={styles.fixedExtraLabel}
                    value={WAGE_LABELS[field]}
                    readOnly
                    aria-label={`${WAGE_LABELS[field]} kalemi`}
                  />
                  <div className={styles.inputWrap}>
                    <input
                      className={styles.inputBare}
                      inputMode="decimal"
                      value={props.wage[field]}
                      onChange={(e) => props.onWageChange(field, e.target.value)}
                      placeholder="0,00"
                      aria-label={`${WAGE_LABELS[field]} tutarı`}
                    />
                    <span className={styles.currency} aria-hidden>
                      ₺
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.eklentiBtn}
                    onClick={() => openEklenti({ kind: "field", field })}
                    title="12 aylık eklenti hesabı"
                  >
                    Eklenti Hesapla
                  </button>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => props.onWageChange(field, "")}
                    aria-label={`${WAGE_LABELS[field]} tutarını temizle`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className={styles.extraList}>
              {props.extras.map((item) => (
                <div
                  key={item.id}
                  className={`${styles.extraRow} ${props.removingExtraIds.includes(item.id) ? styles.extraRowLeaving : ""}`}
                >
                  <input
                    className={styles.extraName}
                    value={item.label}
                    onChange={(e) => props.onUpdateExtra(item.id, { label: e.target.value })}
                    placeholder="Kalem adı"
                    aria-label="Kalem adı"
                  />
                  <div className={styles.inputWrap}>
                    <input
                      className={styles.inputBare}
                      inputMode="decimal"
                      value={item.value}
                      onChange={(e) => props.onUpdateExtra(item.id, { value: e.target.value })}
                      placeholder="0,00"
                      aria-label={`${item.label || "Kalem"} tutarı`}
                    />
                    <span className={styles.currency} aria-hidden>
                      ₺
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.eklentiBtn}
                    onClick={() => openEklenti({ kind: "extra", id: item.id })}
                    title="12 aylık eklenti hesabı"
                  >
                    Eklenti Hesapla
                  </button>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => props.onRemoveExtra(item.id)}
                    aria-label={`${item.label || "Kalem"} sil`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button type="button" className={styles.addRowBtn} onClick={props.onAddExtra}>
                <Plus size={14} /> Kalem ekle
              </button>
            </div>
            </div>

            <div className={styles.grossSummary}>
              <span>Toplam brüt</span>
              <FlashValue value={`${formatMoney(props.toplamBrut)} ₺`} />
            </div>
          </section>

          {props.extraCard}
        </div>

        <aside className={styles.aside} style={{ display: "grid", gap: "0.85rem", minWidth: 0 }}>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Hesaplama</h2>
            </div>
            <div className={styles.lineList}>
              <div className={styles.line}>
                <span>İhbar süresi</span>
                <strong>{props.ihbarSuresiLabel}</strong>
              </div>
              <div className={styles.line}>
                <span>Formül</span>
                <span className={styles.formulaText}>{props.formulaText}</span>
              </div>
            </div>
            <div className={styles.resultStack} style={{ marginTop: "0.6rem" }}>
              <div className={`${styles.resultCard} ${styles.resultCardAccent}`}>
                <div className={styles.resultLabel}>Brüt ihbar tazminatı</div>
                <div className={styles.resultValue}>
                  <AnimatedMoney value={props.brutSonuc} /> ₺
                </div>
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Brütten nete</h2>
            </div>
            <div className={styles.resultStack}>
              <div className={styles.lineList}>
                <div className={styles.line}>
                  <span>Brüt ihbar tazminatı</span>
                  <strong>
                    <FlashValue value={formatMoney(props.brutSonuc)} /> ₺
                  </strong>
                </div>
                <div className={styles.line}>
                  <span>
                    Gelir vergisi{props.gelirVergisiDilimleri ? ` ${props.gelirVergisiDilimleri}` : ""}
                  </span>
                  <strong className={styles.deduction}>
                    −<FlashValue value={formatMoney(props.gelirVergisi)} /> ₺
                  </strong>
                </div>
                <div className={styles.line}>
                  <span>Damga vergisi (‰7,59)</span>
                  <strong className={styles.deduction}>
                    −<FlashValue value={formatMoney(props.damgaVergisi)} /> ₺
                  </strong>
                </div>
              </div>
              <div className={`${styles.resultCard} ${styles.resultCardStrong}`}>
                <div className={styles.resultLabel}>Net ihbar tazminatı</div>
                <div className={styles.resultValue}>
                  <AnimatedMoney value={props.net} /> ₺
                </div>
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Hukuki notlar</h2>
            </div>
            <div className={styles.notes}>
              {props.notes.map((n, i) => {
                if (n.kind === "heading") {
                  return (
                    <p key={i} className={styles.noteHeading}>
                      {n.text}
                    </p>
                  );
                }
                return (
                  <p
                    key={i}
                    className={`${styles.note} ${n.kind === "li" ? styles.noteLi : ""} ${n.emphasis === "warning" ? styles.noteWarn : ""}`}
                  >
                    {n.text}
                  </p>
                );
              })}
            </div>
          </section>
        </aside>
      </div>

      <div
        className={`${styles.stickyBar} ${props.dirty ? styles.stickyBarDirty : ""}`}
        data-tour="ihbar-kaydet-actions"
      >
        <div className={styles.stickyInner}>
          <p className={styles.stickyStatus}>
            {props.dirty
              ? "Kaydedilmemiş değişiklikler var"
              : props.activeName
                ? "Tüm değişiklikler kaydedildi"
                : "Hazır"}
          </p>
          <div className={styles.stickyActions}>
            <Button type="button" variant="soft" size="sm" onClick={() => props.setPreviewOpen(true)}>
              <Eye size={14} />
              Önizleme
            </Button>
            <Button type="button" variant="soft" size="sm" onClick={props.onNewClick}>
              <FilePlus2 size={14} />
              Yeni
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={props.onSaveClick}
              disabled={props.caseSaving}
            >
              <Save size={14} />
              {props.caseSaving ? "Kaydediliyor…" : props.isUpdate ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>

      <NameModal
        open={props.nameOpen}
        initial={props.activeName || props.pageTitle}
        onClose={() => props.setNameOpen(false)}
        onConfirm={props.onPersist}
      />

      <NameModal
        open={extraSaveOpen}
        initial=""
        title="Ekstra Hesaplamaları Kaydet"
        fieldLabel="Set adı"
        onClose={() => setExtraSaveOpen(false)}
        onConfirm={persistExtraSet}
      />

      {extraImportOpen ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setExtraImportOpen(false)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
              <h3 className={styles.modalTitle}>Kaydedilmiş Setleri İçe Aktar</h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => void rescanLegacy()} title="Sunucudaki eski setleri yeniden tara">
                <RefreshCw size={14} /> Yeniden tara
              </Button>
            </div>
            {savedExtraSets.length === 0 ? (
              <p className={styles.helper}>
                Kaydedilmiş set yok. Ücret kalemlerindeki “Kaydet” ile mevcut kalemleri saklayabilirsiniz.
              </p>
            ) : (
              <ul className={styles.setList}>
                {savedExtraSets.map((set) => (
                  <li key={set.id} className={styles.setRow}>
                    <div className={styles.setInfo}>
                      <strong>{set.name}</strong>
                      <span>{set.data.length} kalem</span>
                    </div>
                    <div className={styles.inlineActions}>
                      <Button type="button" variant="soft" size="sm" onClick={() => importExtraSet(set)}>
                        <Download size={13} /> İçe aktar
                      </Button>
                      <Button type="button" variant="danger" size="sm" onClick={() => removeExtraSet(set.id)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.modalActions}>
              <Button type="button" variant="soft" size="sm" onClick={() => setExtraImportOpen(false)}>
                Kapat
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {props.listOpen ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => props.setListOpen(false)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className={styles.modalTitle}>Kayıtlı hesaplamalar</h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => props.setListOpen(false)}
                aria-label="Kapat"
              >
                <X size={16} />
              </Button>
            </div>
            {props.cases.length === 0 ? (
              <p className={styles.helper}>Henüz kayıt yok.</p>
            ) : (
              <div className={styles.caseList}>
                {props.cases.map((c) => (
                  <div key={c.id} className={styles.caseItem}>
                    <div style={{ minWidth: 0 }}>
                      <div className={styles.caseName}>{c.name}</div>
                      <div className={styles.caseMeta}>
                        {new Date(c.updatedAt).toLocaleString("tr-TR")} · {c.subtitle}
                      </div>
                    </div>
                    <div className={styles.caseBtns}>
                      <Button type="button" variant="soft" size="sm" onClick={() => props.onOpenCase(c.id)}>
                        Aç
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="icon"
                        aria-label="Sil"
                        onClick={() => props.setConfirmDeleteId(c.id)}
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
        open={props.confirmNew}
        title="Yeni hesaplama"
        description="Kaydedilmemiş veriler silinecek. Devam edilsin mi?"
        confirmLabel="Devam et"
        onConfirm={props.onConfirmNew}
        onCancel={() => props.setConfirmNew(false)}
      />
      <ConfirmDialog
        open={!!props.confirmDeleteId}
        title="Kaydı sil"
        description="Bu kayıt kalıcı olarak silinecek."
        confirmLabel="Sil"
        danger
        onConfirm={props.onConfirmDelete}
        onCancel={() => props.setConfirmDeleteId(null)}
      />

      {eklentiFor && eklentiKey ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setEklentiFor(null)}>
          <div
            className={`${styles.modalCard} ${styles.modalWide}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.modalTitle}>{eklentiTitle}</h3>
            <p className={styles.helper}>Son 12 aylık bordro tutarlarını girin. Formül: (toplam / 360) × 30</p>
            <div className={styles.monthGrid}>
              {(eklentiMonths[eklentiKey] ?? emptyMonths()).map((value, index) => (
                <label key={index} className={styles.monthField}>
                  <span>{index + 1}. ay</span>
                  <input
                    className={styles.input}
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEklentiMonths((prev) => ({
                        ...prev,
                        [eklentiKey]: (prev[eklentiKey] ?? emptyMonths()).map((m, i) => (i === index ? v : m)),
                      }));
                    }}
                    placeholder="1.250,00"
                  />
                </label>
              ))}
            </div>
            <p className={styles.helper} style={{ marginTop: "0.5rem" }}>
              Sonuç: <strong>{formatMoney(eklentiPreview)} ₺</strong>
            </p>
            <div className={styles.modalActions}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEklentiFor(null)}>
                İptal
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={applyEklenti}>
                Uygula
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <CalculationPreviewModal
        open={props.previewOpen}
        title={props.previewTitle}
        sections={props.previewSections}
        contentId={props.previewContentId}
        onClose={() => props.setPreviewOpen(false)}
      />

      <GuidedTourHost
        definition={tourDefinition}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={IHBAR_TOUR_WELCOME_TITLE}
        welcomeBody={IHBAR_TOUR_WELCOME_BODY}
        welcomeStartLabel="Başlat"
        welcomeLaterLabel="Kendim devam edeceğim"
        welcomeNeverLabel="Bir daha gösterme"
        initialStepIndex={tour.resumeStepIndex}
        onCollectingComplete={() => {
          tour.completeTour();
          toastInfo("Kılavuz tamamlandı. Hesaplamanızı önizleyebilir veya kaydedebilirsiniz.");
        }}
        paused={props.previewOpen}
      />
    </div>
  );
}
