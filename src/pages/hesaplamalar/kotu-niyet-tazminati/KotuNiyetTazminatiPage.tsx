import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
  Scale,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { ApiError } from "@/api/client";
import { getSavedCase } from "@/api/savedCases";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { DraftDateInput, DraftTextInput } from "@/components/form";
import { GuidedTourHost, useGuidedTourController } from "@/components/guided-tour";
import tourStyles from "@/components/guided-tour/GuidedTour.module.css";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import { useCalculationCaseBinding } from "@/hooks/useCalculationCaseBinding";
import { useDeferredFormMemo } from "@/hooks/useDeferredFormMemo";
import {
  KOTU_NIYET_TOUR,
  KOTU_NIYET_TOUR_WELCOME_BODY,
  KOTU_NIYET_TOUR_WELCOME_TITLE,
} from "./guidedTour";
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
import {
  buildKotuNiyetSaveResult,
  kotuNiyetCaseCrud,
  listKotuNiyetCasesFromBackend,
  mapKotuNiyetFormFromBackend,
  resolveSavedCaseDisplayName,
} from "./backendCase";
import {
  clampYear,
  computeEklentiResult,
  computeKotuNiyet,
  formatDateTR,
  formatMoney,
  isDateOrderInvalid,
  KOTU_NIYET_CARPAN,
} from "./engine";
import {
  createEmptyForm,
  newLocalId,
  NOTE_BLOCKS,
  snapshotKey,
  type KotuNiyetForm,
  type SavedCase,
} from "./model";
import { clearCorruptCases, deleteCase } from "./storage";
import styles from "./KotuNiyetTazminatiPage.module.css";

const PAGE_TITLE = "Kötü Niyet Tazminatı";
const PREVIEW_TITLE = "Kötü Niyet Tazminatı Rapor";
const EXTRA_SETS_MODULE_ID = "kotu-niyet-tazminati";

type WageFieldKey = "prim" | "ikramiye" | "yol" | "yemek";
type EklentiTarget = { kind: "field"; field: WageFieldKey } | { kind: "extra"; id: string };

const WAGE_LABELS: Record<WageFieldKey, string> = {
  prim: "Prim",
  ikramiye: "İkramiye",
  yol: "Yol",
  yemek: "Yemek",
};

function eklentiKeyOf(t: EklentiTarget): string {
  return t.kind === "field" ? `field:${t.field}` : `extra:${t.id}`;
}

function emptyMonths(): string[] {
  return Array.from({ length: 12 }, () => "");
}

function FlashValue({ value, className }: { value: string; className?: string }) {
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
  return (
    <span className={`${className ?? ""} ${flash ? styles.valueFlash : ""}`.trim()}>{value}</span>
  );
}

function AnimatedMoney({ value }: { value: number }) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animate from last displayed
  }, [value, reduce]);

  return <>{formatMoney(display)}</>;
}

function NameModal({
  open,
  initial,
  title = "Kaydı adlandır",
  fieldLabel = "Kayıt adı",
  onClose,
  onConfirm,
}: {
  open: boolean;
  initial: string;
  title?: string;
  fieldLabel?: string;
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
        <h3 className={styles.modalTitle}>{title}</h3>
        <label className={styles.label} htmlFor="kn-save-name">
          {fieldLabel}
        </label>
        <input
          id="kn-save-name"
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

export default function KotuNiyetTazminatiPage() {
  const { success, error: showError, info: toastInfo } = useToast();
  const tour = useGuidedTourController();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");
  const backendLoadedCaseIdRef = useRef<string | null>(null);
  const [form, setForm] = useState<KotuNiyetForm>(createEmptyForm);
  const [dateError, setDateError] = useState<string | null>(null);
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
  const [eklentiFor, setEklentiFor] = useState<EklentiTarget | null>(null);
  const [eklentiMonths, setEklentiMonths] = useState<Record<string, string[]>>({});
  const [extraSaveOpen, setExtraSaveOpen] = useState(false);
  const [extraImportOpen, setExtraImportOpen] = useState(false);
  const [savedExtraSets, setSavedExtraSets] = useState<LocalExtraSet[]>([]);
  const [caseSaving, setCaseSaving] = useState(false);

  useEffect(() => {
    document.title = `${PAGE_TITLE} | Bilirkişi Hesap`;
  }, []);

  const setCaseIdParam = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("caseId", id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const result = useDeferredFormMemo(form, computeKotuNiyet);
  const dirty = snapshotKey(form) !== baseline;

  const refreshExtraSets = useCallback(async () => {
    setSavedExtraSets(await listLocalExtraSets(EXTRA_SETS_MODULE_ID));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const merged = await tryMergeLegacyExtraSets(EXTRA_SETS_MODULE_ID);
      if (cancelled) return;
      if (merged && merged.imported > 0) {
        success(`${merged.imported} eski ekstra set hesaba aktarıldı`);
      }
      await refreshExtraSets();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshExtraSets, success]);

  const hasExtraSetData =
    !!(form.prim || form.ikramiye || form.yol || form.yemek) || form.extras.length > 0;

  const openExtraImport = () => {
    void refreshExtraSets().then(() => setExtraImportOpen(true));
  };

  const persistExtraSet = (name: string) => {
    void (async () => {
      try {
        const items = collectExtraSetItems(
        { prim: form.prim, ikramiye: form.ikramiye, yol: form.yol, yemek: form.yemek },
        form.extras,
      );
        await upsertLocalExtraSet(EXTRA_SETS_MODULE_ID, name, items);
        await refreshExtraSets();
        setExtraSaveOpen(false);
        success("Ekstra hesaplamalar kaydedildi");
      } catch (err) {
        showError(err instanceof Error ? err.message : "Kaydedilemedi");
      }
    })();
  };

  const importExtraSet = (set: LocalExtraSet) => {
    const { wage, extras } = applyExtraSetItems(set.data);
    setForm((prev) => ({ ...prev, ...wage, extras }));
    setExtraImportOpen(false);
    success("Ekstra hesaplamalar yüklendi");
  };

  const removeExtraSet = (id: string) => {
    void (async () => {
      await deleteLocalExtraSet(EXTRA_SETS_MODULE_ID, id);
      await refreshExtraSets();
      success("Set silindi");
    })();
  };

  const rescanLegacy = async () => {
    const merged = await tryMergeLegacyExtraSets(EXTRA_SETS_MODULE_ID, { force: true });
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
      setForm((prev) => ({ ...prev, [eklentiFor.field]: formatted }));
    } else {
      setForm((prev) => ({
        ...prev,
        extras: prev.extras.map((e) => (e.id === eklentiFor.id ? { ...e, value: formatted } : e)),
      }));
    }
    setEklentiFor(null);
  };

  const eklentiKey = eklentiFor ? eklentiKeyOf(eklentiFor) : null;
  const eklentiPreview = eklentiKey ? computeEklentiResult(eklentiMonths[eklentiKey] ?? emptyMonths()) : 0;

  const reloadCases = useCallback(async () => {
    try {
      const items = await listKotuNiyetCasesFromBackend();
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
  }, []);

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
        const mapped = mapKotuNiyetFormFromBackend(record.data);
        if (!mapped) {
          showError("Kayıt formu okunamadı");
          return;
        }
        setForm(mapped);
        setActiveId(String(numericId));
        setActiveName(resolveSavedCaseDisplayName(record));
        setBaseline(snapshotKey(mapped));
        setDateError(null);
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

  const patch = useCallback(<K extends keyof KotuNiyetForm>(key: K, value: KotuNiyetForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const validateDates = useCallback(
    (start: string, end: string) => {
      if (isDateOrderInvalid(start, end)) {
        setDateError("İşten çıkış tarihi, işe giriş tarihinden önce olamaz.");
        showError("İşten çıkış tarihi, işe giriş tarihinden önce olamaz.");
        return false;
      }
      setDateError(null);
      return true;
    },
    [showError],
  );

  const handleNew = useCallback(() => {
    if (dirty) {
      setConfirmNew(true);
      return;
    }
    setForm(createEmptyForm());
    setActiveId(null);
    setActiveName(null);
    setBaseline(snapshotKey(createEmptyForm()));
    setDateError(null);
  }, [dirty]);

  const doNew = useCallback(() => {
    setConfirmNew(false);
    setForm(createEmptyForm());
    setActiveId(null);
    setActiveName(null);
    setBaseline(snapshotKey(createEmptyForm()));
    setDateError(null);
  }, []);

  const persist = useCallback(
    async (name: string, existingId?: string | null) => {
      if (!(result.brutAmount > 0)) {
        showError("Önce geçerli bir hesaplama yapın");
        return;
      }
      setCaseSaving(true);
      const wasUpdate = !!(existingId && /^\d+$/.test(existingId));
      try {
        const record = await kotuNiyetCaseCrud.saveCase(
          name,
          form,
          buildKotuNiyetSaveResult({
            toplamBrut: result.toplamBrut,
            brutAmount: result.brutAmount,
            netAmount: result.netAmount,
            weeks: result.weeks,
          }),
          existingId,
        );
        const recordId = String(record.id);
        setActiveId(recordId);
        setActiveName(resolveSavedCaseDisplayName(record));
        setBaseline(snapshotKey(form));
        setCaseIdParam(recordId);
        backendLoadedCaseIdRef.current = recordId;
        await reloadCases();
        success(wasUpdate ? "Kayıt güncellendi" : "Kayıt kaydedildi");
        setNameOpen(false);
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
    [form, result, reloadCases, setCaseIdParam, showError, success],
  );

  const handleSaveClick = useCallback(() => {
    if (!(result.brutAmount > 0)) {
      showError("Önce geçerli bir hesaplama yapın");
      return;
    }
    if (activeId && activeName && /^\d+$/.test(activeId)) {
      void persist(activeName, activeId);
      return;
    }
    setNameOpen(true);
  }, [activeId, activeName, persist, result.brutAmount, showError]);

  const openCase = useCallback(
    (c: SavedCase) => {
      const next = { ...createEmptyForm(), ...c.form };
      setForm(next);
      setActiveId(c.id);
      setActiveName(c.name);
      setBaseline(snapshotKey(next));
      setDateError(null);
      setListOpen(false);
      success(`Kayıt açıldı: ${c.name}`);
    },
    [success],
  );

  const doDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    try {
      if (/^\d+$/.test(confirmDeleteId)) {
        await kotuNiyetCaseCrud.removeCase(confirmDeleteId);
      } else {
        deleteCase(confirmDeleteId);
      }
      if (activeId === confirmDeleteId) {
        setActiveId(null);
        setActiveName(null);
      }
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
  }, [activeId, confirmDeleteId, reloadCases, showError, success]);

  const addExtra = useCallback(() => {
    setForm((prev) => ({ ...prev, extras: [...prev.extras, { id: newLocalId("extra"), label: "", value: "" }] }));
  }, []);

  const updateExtra = useCallback((id: string, patchValue: Partial<{ label: string; value: string }>) => {
    setForm((prev) => ({
      ...prev,
      extras: prev.extras.map((it) => (it.id === id ? { ...it, ...patchValue } : it)),
    }));
  }, []);

  const removeExtra = useCallback((id: string) => {
    setForm((prev) => ({ ...prev, extras: prev.extras.filter((it) => it.id !== id) }));
  }, []);

  const previewSections = useMemo((): PreviewSection[] => {
    return [
      {
        id: "genel",
        title: "Genel Bilgiler",
        headers: ["Alan", "Değer"],
        rows: [
          ["İşe Giriş", form.startDate ? formatDateTR(form.startDate) : "—"],
          ["İşten Çıkış", form.endDate ? formatDateTR(form.endDate) : "—"],
          ["Çalışma Süresi", result.workPeriod.label],
          ["Aylık Toplam Ücret (giydirilmiş)", `${formatMoney(result.toplamBrut)} ₺`],
          ["İhbar Süresi (Hafta)", String(result.weeks)],
          [
            "Hesaplama",
            result.toplamBrut > 0
              ? `(${formatMoney(result.toplamBrut)} ₺ / 30 × ${result.weeks} × 7 × ${KOTU_NIYET_CARPAN})`
              : "—",
          ],
        ],
      },
      {
        id: "hesap",
        title: "Kötü Niyet Tazminatı Hesaplama Detayı",
        headers: ["Kalem", "Değer"],
        rows: [
          ["Günlük Ücret", `${formatMoney(result.toplamBrut)} ₺ / 30 = ${formatMoney(result.gunlukUcret)} ₺`],
          [
            "İhbar Süresi Tutarı",
            `${formatMoney(result.gunlukUcret)} ₺ × ${result.weeks} × 7 = ${formatMoney(result.ihbarTutari)} ₺`,
          ],
          [
            `Kötü Niyet Tazminatı (×${KOTU_NIYET_CARPAN})`,
            `${formatMoney(result.brutAmount)} ₺`,
          ],
        ],
        lastRowTone: "blue",
      },
      {
        id: "brutten-nete",
        title: "Brütten Nete",
        headers: ["Kalem", "Tutar"],
        rows: [
          ["Brüt Kötü Niyet Tazminatı", `${formatMoney(result.brutAmount)} ₺`],
          ["Damga Vergisi (Binde 7,59)", `−${formatMoney(result.damgaVergisi)} ₺`],
          ["Net Kötü Niyet Tazminatı", `${formatMoney(result.netAmount)} ₺`],
        ],
        lastRowTone: "green",
      },
    ];
  }, [form.endDate, form.startDate, result]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroIcon} aria-hidden>
            <Scale size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 className={styles.title}>{PAGE_TITLE}</h1>
            <p className={styles.desc}>
              İhbar süresinin 3 katı tutarında kötü niyet tazminatı; giydirilmiş brüt ücret ve kıdem süresine göre
              hesaplanır. Yalnızca damga vergisi kesilir.
            </p>
            <div className={styles.privacyBadge}>
              <ShieldCheck size={12} /> Veriler hesabınıza güvenli şekilde kaydedilir
            </div>
          </div>
        </div>
        <div className={styles.heroAside}>
          {activeName ? (
            <div className={styles.recordBadge}>
              <span>{activeName}</span>
            </div>
          ) : null}
          <div className={styles.quickTotal}>
            <span>Net kötü niyet tazminatı</span>
            <span className={styles.quickTotalValue}>
              <AnimatedMoney value={result.netAmount} /> ₺
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
            <Button type="button" variant="soft" size="sm" onClick={handleNew}>
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
              clearCorruptCases();
              setStorageError(null);
              reloadCases();
            }}
          >
            Temizle
          </Button>
        </div>
      ) : null}

      <div className={styles.layout}>
        <div style={{ display: "grid", gap: "0.85rem", minWidth: 0 }}>
          <section className={styles.card} data-tour="kotu-niyet-donem">
            <div className={styles.cardHead}>
              <Calculator size={16} />
              <h2 className={styles.cardTitle}>Ücret ve çalışma bilgileri</h2>
            </div>
            <p className={styles.cardHint}>
              Aylık giydirilmiş brüt ücret ve çalışma süresi; ihbar haftası bu süreye göre belirlenir.
            </p>
            <div className={styles.fields3}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="kn-ise-giris">
                  İşe giriş
                </label>
                <DraftDateInput
                  id="kn-ise-giris"
                  max="9999-12-31"
                  className={`${styles.input} ${dateError ? styles.inputError : ""}`}
                  value={form.startDate}
                  onCommit={(value) => {
                    const next = clampYear(value);
                    patch("startDate", next);
                    if (next && form.endDate) validateDates(next, form.endDate);
                  }}
                  onBlur={() => {
                    if (form.startDate && form.endDate) validateDates(form.startDate, form.endDate);
                  }}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="kn-isten-cikis">
                  İşten çıkış
                </label>
                <DraftDateInput
                  id="kn-isten-cikis"
                  max="9999-12-31"
                  className={`${styles.input} ${dateError ? styles.inputError : ""}`}
                  value={form.endDate}
                  onCommit={(value) => {
                    const next = clampYear(value);
                    patch("endDate", next);
                    if (form.startDate && next) validateDates(form.startDate, next);
                  }}
                  onBlur={() => {
                    if (form.startDate && form.endDate) validateDates(form.startDate, form.endDate);
                  }}
                />
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Çalışma süresi</span>
                <div className={styles.readonlyBox}>
                  <FlashValue value={result.workPeriod.label || "—"} />
                </div>
              </div>
            </div>
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
            <div className={styles.fields}>
              <div className={styles.field} data-tour="kotu-niyet-ucret">
                <label className={styles.label} htmlFor="kn-brut">
                  Çıplak brüt ücret
                </label>
                <DraftTextInput
                  id="kn-brut"
                  className={styles.input}
                  inputMode="decimal"
                  placeholder="Örn: 25.000"
                  value={form.brut}
                  onCommit={(value) => patch("brut", value)}
                />
              </div>
            </div>
            <div data-tour="kotu-niyet-kalemler">
            <div className={styles.wageGrid} style={{ marginTop: "0.6rem" }}>
              {(["prim", "ikramiye", "yol", "yemek"] as const).map((key) => (
                <div key={key} className={styles.wageRow}>
                  <label className={styles.label} htmlFor={`kn-${key}`}>
                    {WAGE_LABELS[key]}
                  </label>
                  <DraftTextInput
                    id={`kn-${key}`}
                    className={styles.input}
                    inputMode="decimal"
                    placeholder="0"
                    value={form[key]}
                    onCommit={(value) => patch(key, value)}
                  />
                  <Button type="button" variant="soft" size="sm" onClick={() => openEklenti({ kind: "field", field: key })}>
                    <Calculator size={13} /> Eklenti Hesapla
                  </Button>
                </div>
              ))}
            </div>
            {form.extras.length > 0 ? (
              <div className={styles.extrasGrid} style={{ marginTop: "0.6rem" }}>
                {form.extras.map((it) => (
                  <div key={it.id} className={styles.extraRow}>
                    <DraftTextInput
                      className={styles.input}
                      placeholder="Kalem adı"
                      value={it.label}
                      onCommit={(value) => updateExtra(it.id, { label: value })}
                    />
                    <DraftTextInput
                      className={styles.input}
                      inputMode="decimal"
                      placeholder="Tutar"
                      value={it.value}
                      onCommit={(value) => updateExtra(it.id, { value })}
                    />
                    <Button type="button" variant="soft" size="sm" onClick={() => openEklenti({ kind: "extra", id: it.id })}>
                      <Calculator size={13} /> Eklenti Hesapla
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label="Kalemi sil" onClick={() => removeExtra(it.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <Button type="button" variant="ghost" size="sm" onClick={addExtra} style={{ marginTop: "0.6rem" }}>
              <Plus size={14} /> Ek Ücret Kalemi
            </Button>
            </div>
          </section>
        </div>

        <aside className={styles.aside} style={{ display: "grid", gap: "0.85rem", minWidth: 0 }}>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Özet</h2>
            </div>
            <div className={styles.lineList}>
              <div className={styles.line}>
                <span>İhbar süresi</span>
                <strong>{result.weeks} hafta</strong>
              </div>
              <div className={styles.line}>
                <span>Hesap</span>
                <strong className={styles.helper}>
                  ({formatMoney(result.toplamBrut)} / 30 × {result.weeks} × 7 × {KOTU_NIYET_CARPAN})
                </strong>
              </div>
              <div className={styles.line}>
                <span>Günlük ücret</span>
                <strong>{formatMoney(result.gunlukUcret)} ₺</strong>
              </div>
              <div className={styles.line}>
                <span>İhbar tutarı</span>
                <strong>{formatMoney(result.ihbarTutari)} ₺</strong>
              </div>
            </div>
            <div className={`${styles.resultCard} ${styles.resultCardAccent}`} style={{ marginTop: "0.6rem" }}>
              <div className={styles.resultLabel}>Brüt kötü niyet tazminatı</div>
              <div className={styles.resultValue}>
                <AnimatedMoney value={result.brutAmount} /> ₺
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Brütten nete</h2>
            </div>
            <div className={styles.lineList}>
              <div className={styles.line}>
                <span>Brüt</span>
                <strong>
                  <FlashValue value={`${formatMoney(result.brutAmount)} ₺`} />
                </strong>
              </div>
              <div className={styles.line}>
                <span>Damga (binde 7,59)</span>
                <strong className={styles.deduction}>-{formatMoney(result.damgaVergisi)} ₺</strong>
              </div>
            </div>
            <div className={`${styles.resultCard} ${styles.resultCardStrong}`} style={{ marginTop: "0.6rem" }}>
              <div className={styles.resultLabel}>Net kötü niyet tazminatı</div>
              <div className={styles.resultValue}>
                <AnimatedMoney value={result.netAmount} /> ₺
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Hukuki notlar</h2>
            </div>
            <div className={styles.notes}>
              {NOTE_BLOCKS.map((text, i) => (
                <p key={i} className={styles.note}>
                  {text}
                </p>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <div className={`${styles.stickyBar} ${dirty ? styles.stickyBarDirty : ""}`} data-tour="kotu-niyet-kaydet-actions">
        <div className={styles.stickyInner}>
          <div className={styles.stickyStatus}>
            {dirty ? "Kaydedilmemiş değişiklikler var" : activeName ? `Kayıt: ${activeName}` : "Yeni hesaplama"}
          </div>
          <div className={styles.stickyActions}>
            <Button type="button" variant="soft" size="sm" onClick={() => setPreviewOpen(true)}>
              <Eye size={14} /> Önizleme
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleNew}>
              <FilePlus2 size={14} /> Yeni
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={handleSaveClick} disabled={caseSaving}>
              <Save size={14} /> {caseSaving ? "Kaydediliyor…" : activeId && /^\d+$/.test(activeId) ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>

      <NameModal
        open={nameOpen}
        initial={activeName || PAGE_TITLE}
        onClose={() => setNameOpen(false)}
        onConfirm={(name) => void persist(name, null)}
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
                        {new Date(c.updatedAt).toLocaleString("tr-TR")} · Net {formatMoney(c.results.netAmount)} ₺
                      </div>
                    </div>
                    <div className={styles.caseBtns}>
                      <Button type="button" variant="soft" size="sm" onClick={() => openCase(c)}>
                        Aç
                      </Button>
                      <Button type="button" variant="danger" size="icon" aria-label="Sil" onClick={() => setConfirmDeleteId(c.id)}>
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
        description="Kaydedilmemiş veriler silinecek. Devam edilsin mi?"
        confirmLabel="Devam et"
        onConfirm={doNew}
        onCancel={() => setConfirmNew(false)}
      />
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Kaydı sil"
        description="Bu kayıt kalıcı olarak silinecek."
        confirmLabel="Sil"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {eklentiFor && eklentiKey ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setEklentiFor(null)}>
          <div
            className={`${styles.modalCard} ${styles.modalWide}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.modalTitle}>Eklenti hesaplama</h3>
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
        open={previewOpen}
        title={PREVIEW_TITLE}
        sections={previewSections}
        contentId="kotu-niyet-preview"
        onClose={() => setPreviewOpen(false)}
      />

      <GuidedTourHost
        definition={KOTU_NIYET_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={KOTU_NIYET_TOUR_WELCOME_TITLE}
        welcomeBody={KOTU_NIYET_TOUR_WELCOME_BODY}
        welcomeStartLabel="Başlat"
        welcomeLaterLabel="Kendim devam edeceğim"
        initialStepIndex={tour.resumeStepIndex}
        onCollectingComplete={() => {
          tour.completeTour();
          toastInfo("Kılavuz tamamlandı. Hesaplamanızı önizleyebilir veya kaydedebilirsiniz.");
        }}
        paused={
          previewOpen ||
          nameOpen ||
          listOpen ||
          extraSaveOpen ||
          extraImportOpen ||
          !!eklentiFor ||
          confirmNew ||
          !!confirmDeleteId
        }
      />
    </div>
  );
}
