import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Calculator,
  CirclePlay,
  Eye,
  FilePlus2,
  FolderOpen,
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
  AYRIMCILIK_TOUR,
  AYRIMCILIK_TOUR_WELCOME_BODY,
  AYRIMCILIK_TOUR_WELCOME_TITLE,
} from "./guidedTour";
import {
  buildAyrimcilikSaveResult,
  ayrimcilikCaseCrud,
  listAyrimcilikCasesFromBackend,
  mapAyrimcilikFormFromBackend,
  resolveSavedCaseDisplayName,
} from "./backendCase";
import {
  clampYearInDateInput,
  computeAyrimcilik,
  formatDateTR,
  formatMoney,
  isDateOrderInvalid,
} from "./engine";
import { NOTE_BLOCKS, createEmptyForm, snapshotKey, type AyrimcilikForm, type SavedCase } from "./model";
import { clearCorruptCases, deleteCase } from "./storage";
import styles from "./AyrimcilikTazminatiPage.module.css";

const PAGE_TITLE = "Ayrımcılık Tazminatı";
const PREVIEW_TITLE = "Ayrımcılık Tazminatı Rapor";

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

  return <span className={`${className ?? ""} ${flash ? styles.valueFlash : ""}`.trim()}>{value}</span>;
}

function AnimatedMoney({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const reduce =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

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
        <label className={styles.label} htmlFor="ay-save-name">
          Kayıt adı
        </label>
        <input
          id="ay-save-name"
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
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AyrimcilikTazminatiPage() {
  const { success, error: showError, info: toastInfo } = useToast();
  const tour = useGuidedTourController();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");
  const backendLoadedCaseIdRef = useRef<string | null>(null);

  const [form, setForm] = useState<AyrimcilikForm>(createEmptyForm);
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

  const result = useDeferredFormMemo(form, computeAyrimcilik);
  const dirty = snapshotKey(form) !== baseline;

  const reloadCases = useCallback(async () => {
    try {
      const items = await listAyrimcilikCasesFromBackend();
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
        const mapped = mapAyrimcilikFormFromBackend(record.data);
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

  const patch = useCallback(<K extends keyof AyrimcilikForm>(key: K, value: AyrimcilikForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const validateDates = useCallback(
    (start: string, end: string, message: string) => {
      if (isDateOrderInvalid(start, end)) {
        setDateError(message);
        showError(message);
        return false;
      }
      setDateError(null);
      return true;
    },
    [showError],
  );

  /** Draft alanlardaki güncel değerleri forma yazar; motor aynı `computeAyrimcilik` ile çalışmaya devam eder. */
  const handleCalculate = useCallback(() => {
    const read = (id: string, fallback: string) => {
      const el = document.getElementById(id);
      return el instanceof HTMLInputElement ? el.value : fallback;
    };

    const startDate = clampYearInDateInput(read("ay-ise-giris", form.startDate));
    const endDate = clampYearInDateInput(read("ay-isten-cikis", form.endDate));
    const brut = read("ay-brut", form.brut);
    const brutInputForNet = read("ay-brut-net-ops", form.brutInputForNet);

    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();

    setForm((prev) => ({
      ...prev,
      startDate,
      endDate,
      brut,
      brutInputForNet,
    }));

    if (startDate && endDate) {
      validateDates(startDate, endDate, "İşten çıkış tarihi, işe giriş tarihinden önce olamaz.");
    }
  }, [form.brut, form.brutInputForNet, form.endDate, form.startDate, validateDates]);

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
      if (!(result.brutVal > 0)) {
        showError("Geçerli bir brüt ücret giriniz");
        return;
      }

      setCaseSaving(true);
      const wasUpdate = !!(existingId && /^\d+$/.test(existingId));
      const maxAmount = result.coefRows[result.coefRows.length - 1]?.value ?? 0;
      try {
        const record = await ayrimcilikCaseCrud.saveCase(
          name,
          form,
          buildAyrimcilikSaveResult({
            brutForNetConversion: result.brutForNetConversion,
            gelirVergisi: result.gelirVergisi,
            damgaVergisi: result.damgaVergisi,
            netTazminat: result.netTazminat,
            maxAmount,
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
    [form, reloadCases, result, setCaseIdParam, showError, success],
  );

  const handleSaveClick = useCallback(() => {
    if (!(result.brutVal > 0)) {
      showError("Geçerli bir brüt ücret giriniz");
      return;
    }
    if (activeId && activeName && /^\d+$/.test(activeId)) {
      void persist(activeName, activeId);
      return;
    }
    setNameOpen(true);
  }, [activeId, activeName, persist, result.brutVal, showError]);

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
        await ayrimcilikCaseCrud.removeCase(confirmDeleteId);
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

  const defaultBrutPlaceholder =
    result.coefRows.find((row) => row.k === (form.netAyKatsayi ?? 4))?.value ??
    result.brutVal ??
    0;

  const previewSections = useMemo((): PreviewSection[] => {
    const sections: PreviewSection[] = [
      {
        id: "genel",
        title: "Genel Bilgiler",
        headers: ["Alan", "Değer"],
        rows: [
          ["Çıplak Brüt Ücret", result.brutVal ? `${formatMoney(result.brutVal)} ₺` : "—"],
          ["İşe Giriş Tarihi", form.startDate ? formatDateTR(form.startDate) : "—"],
          ["İşten Çıkış Tarihi", form.endDate ? formatDateTR(form.endDate) : "—"],
          ["Çalışma Süresi", result.workPeriod?.label || "—"],
        ],
      },
    ];

    if (result.coefRows.length > 0) {
      sections.push({
        id: "katsayi",
        title: "Ayrımcılık Tazminatı Hesaplama Detayı",
        headers: ["Katsayı", "Hesaplama", "Tutar"],
        rows: result.coefRows.map((row) => [
          `${row.k} ay`,
          `${formatMoney(result.brutVal)} × ${row.k}`,
          `${formatMoney(row.value)} ₺`,
        ]),
      });
    }

    sections.push({
      id: "brutten-nete",
      title: "Brütten Nete",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Seçilen Süre", `${form.netAyKatsayi ?? 4} aylık`],
        ["Brüt Ayrımcılık Tazminatı", `${formatMoney(result.brutForNetConversion)} ₺`],
        [
          `Gelir Vergisi${result.gelirVergisiDilimleri ? ` ${result.gelirVergisiDilimleri}` : ""}`,
          `−${formatMoney(result.gelirVergisi)} ₺`,
        ],
        ["Damga Vergisi (Binde 7,59)", `−${formatMoney(result.damgaVergisi)} ₺`],
        ["Net Ayrımcılık Tazminatı", `${formatMoney(result.netTazminat)} ₺`],
      ],
      lastRowTone: "green",
    });

    return sections;
  }, [form.endDate, form.netAyKatsayi, form.startDate, result]);

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
              1–4 aylık ücret üzerinden ayrımcılık tazminatı hesabı ve brütten nete hesaplama
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
            <span>Brüt ücret</span>
            <span className={styles.quickTotalValue}>
              <AnimatedMoney value={result.brutForNetConversion} /> ₺
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
          <form
            className={styles.calcForm}
            onSubmit={(e) => {
              e.preventDefault();
              handleCalculate();
            }}
          >
            <section className={styles.card} data-tour="ayrimcilik-donem">
              <div className={styles.cardHead}>
                <Calculator size={16} />
                <h2 className={styles.cardTitle}>Tarih bilgileri</h2>
              </div>
              <div className={styles.fields3}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="ay-ise-giris">
                    İşe giriş
                  </label>
                  <DraftDateInput
                    id="ay-ise-giris"
                    max="9999-12-31"
                    className={`${styles.input} ${dateError ? styles.inputError : ""}`}
                    value={form.startDate}
                    onCommit={(value) => {
                      const next = clampYearInDateInput(value);
                      patch("startDate", next);
                      if (next && form.endDate) {
                        validateDates(
                          next,
                          form.endDate,
                          "İşe giriş tarihi, işten çıkış tarihinden sonra olamaz.",
                        );
                      }
                    }}
                    onBlur={() => {
                      if (form.startDate && form.endDate) {
                        validateDates(
                          form.startDate,
                          form.endDate,
                          "İşe giriş tarihi, işten çıkış tarihinden sonra olamaz.",
                        );
                      }
                    }}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="ay-isten-cikis">
                    İşten çıkış
                  </label>
                  <DraftDateInput
                    id="ay-isten-cikis"
                    max="9999-12-31"
                    className={`${styles.input} ${dateError ? styles.inputError : ""}`}
                    value={form.endDate}
                    onCommit={(value) => {
                      const next = clampYearInDateInput(value);
                      patch("endDate", next);
                      if (form.startDate && next) {
                        validateDates(
                          form.startDate,
                          next,
                          "İşten çıkış tarihi, işe giriş tarihinden önce olamaz.",
                        );
                      }
                    }}
                    onBlur={() => {
                      if (form.startDate && form.endDate) {
                        validateDates(
                          form.startDate,
                          form.endDate,
                          "İşten çıkış tarihi, işe giriş tarihinden önce olamaz.",
                        );
                      }
                    }}
                  />
                </div>

                <div className={styles.field}>
                  <span className={styles.label}>Çalışma süresi</span>
                  <div className={styles.readonlyBox}>
                    <FlashValue value={result.workPeriod?.label || "—"} />
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.card} data-tour="ayrimcilik-ucret">
              <div className={styles.cardHead}>
                <Calculator size={16} />
                <h2 className={styles.cardTitle}>Ücret bilgileri</h2>
              </div>
              <div className={styles.fields}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="ay-brut">
                    Çıplak brüt ücret
                  </label>
                  <DraftTextInput
                    id="ay-brut"
                    className={`${styles.input} ${result.asgariUcretHatasi ? styles.inputError : ""}`}
                    inputMode="decimal"
                    placeholder="Örn: 25.000"
                    value={form.brut}
                    onCommit={(value) => patch("brut", value)}
                  />
                  {result.asgariUcretHatasi ? <p className={styles.warn}>{result.asgariUcretHatasi}</p> : null}
                </div>
              </div>

              <Button type="submit" variant="primary" size="md" className={styles.calcSubmit}>
                <Calculator size={16} /> Hesapla
              </Button>

              <div className={styles.coefTable}>
                <div className={styles.coefTableHead}>Tazminat Tutarı (1–4 Aylık Ücret)</div>
                {result.coefRows.length === 0 ? (
                  <p className={styles.emptyCoef}>Brüt ücret girildiğinde satırlar listelenir.</p>
                ) : (
                  <div className={styles.coefTableBody}>
                    {result.coefRows.map((row) => (
                      <div key={row.k} className={styles.coefTableRow}>
                        <span className={styles.coefTableLabel}>{row.label}</span>
                        <span className={styles.coefTableVal}>
                          <FlashValue value={`${formatMoney(row.value)} ₺`} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </form>
        </div>

        <aside className={styles.aside} style={{ display: "grid", gap: "0.85rem", minWidth: 0 }}>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Brütten nete</h2>
            </div>
            <p className={styles.cardHint}>
              Brüt tutardan gelir vergisi ve binde 7,59 oranında damga vergisi kesintisi uygulanır.
            </p>
            <div className={styles.fields} style={{ marginBottom: "0.65rem" }}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ay-brut-net-ops">
                  HÜKMEDİLEN BRÜT TAZMİNAT (OPSİYONEL)
                </label>
                <DraftTextInput
                  id="ay-brut-net-ops"
                  className={styles.input}
                  inputMode="decimal"
                  placeholder={`Varsayılan: ${formatMoney(defaultBrutPlaceholder)}`}
                  value={form.brutInputForNet}
                  onCommit={(value) => patch("brutInputForNet", value)}
                />
              </div>
              <div className={styles.field}>
                <span className={styles.label} id="ay-net-ay-label">
                  Tazminat süresi
                </span>
                <div className={styles.monthPick} role="group" aria-labelledby="ay-net-ay-label">
                  {([1, 2, 3, 4] as const).map((k) => {
                    const active = (form.netAyKatsayi ?? 4) === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        className={`${styles.monthPickBtn} ${active ? styles.monthPickBtnActive : ""}`}
                        aria-pressed={active}
                        onClick={() => patch("netAyKatsayi", k)}
                      >
                        {k} aylık
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className={styles.resultStack}>
              <div className={`${styles.resultCard} ${styles.resultCardAccent}`}>
                <div className={styles.resultLabel}>BRÜT AYRIMCILIK TAZMİNATI</div>
                <div className={styles.resultValue}>
                  <AnimatedMoney value={result.brutForNetConversion} /> ₺
                </div>
              </div>

              <div className={styles.lineList}>
                <div className={styles.line}>
                  <span>
                    Gelir vergisi
                    {result.gelirVergisiDilimleri ? ` ${result.gelirVergisiDilimleri}` : ""}
                  </span>
                  <strong className={styles.deduction}>
                    −<FlashValue value={formatMoney(result.gelirVergisi)} /> ₺
                  </strong>
                </div>
                <div className={styles.line}>
                  <span>Damga vergisi (‰7,59)</span>
                  <strong className={styles.deduction}>
                    −<FlashValue value={formatMoney(result.damgaVergisi)} /> ₺
                  </strong>
                </div>
              </div>

              <div className={`${styles.resultCard} ${styles.resultCardStrong}`}>
                <div className={styles.resultLabel}>NET AYRIMCILIK TAZMİNATI</div>
                <div className={styles.resultValue}>
                  <AnimatedMoney value={result.netTazminat} /> ₺
                </div>
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Hukuki notlar</h2>
            </div>
            <div
              className={styles.notes}
              style={{ maxHeight: "min(50vh, 28rem)", overflowY: "auto", paddingRight: 2 }}
            >
              {NOTE_BLOCKS.map((n, i) => (
                <p key={i} className={`${styles.note} ${n.variant === "alert" ? styles.noteWarn : ""}`}>
                  {n.text}
                </p>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <div
        className={`${styles.stickyBar} ${dirty ? styles.stickyBarDirty : ""}`}
        data-tour="ayrimcilik-kaydet-actions"
      >
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
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSaveClick}
              disabled={caseSaving}
            >
              <Save size={14} />{" "}
              {caseSaving ? "Kaydediliyor…" : activeId && /^\d+$/.test(activeId) ? "Güncelle" : "Kaydet"}
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

      {listOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className={styles.modalTitle} style={{ marginBottom: 0 }}>
                Kayıtlı hesaplamalar
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setListOpen(false)}
                aria-label="Kapat"
              >
                <X size={16} />
              </Button>
            </div>

            {cases.length === 0 ? (
              <p className={styles.helper} style={{ marginTop: "0.85rem" }}>
                Henüz kayıt yok.
              </p>
            ) : (
              <div className={styles.caseList} style={{ marginTop: "0.85rem" }}>
                {cases.map((c) => (
                  <div key={c.id} className={styles.caseItem}>
                    <div style={{ minWidth: 0 }}>
                      <div className={styles.caseName}>{c.name}</div>
                      <div className={styles.caseMeta}>
                        {new Date(c.updatedAt).toLocaleString("tr-TR")} · Net {formatMoney(c.results.netTazminat)} ₺
                      </div>
                    </div>
                    <div className={styles.caseBtns}>
                      <Button type="button" variant="soft" size="sm" onClick={() => openCase(c)}>
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

      <CalculationPreviewModal
        open={previewOpen}
        title={PREVIEW_TITLE}
        sections={previewSections}
        contentId="ayrimcilik-preview"
        onClose={() => setPreviewOpen(false)}
      />

      <GuidedTourHost
        definition={AYRIMCILIK_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={AYRIMCILIK_TOUR_WELCOME_TITLE}
        welcomeBody={AYRIMCILIK_TOUR_WELCOME_BODY}
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

