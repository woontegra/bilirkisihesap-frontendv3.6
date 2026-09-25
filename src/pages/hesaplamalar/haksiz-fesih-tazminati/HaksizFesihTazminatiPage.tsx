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
  HAKSIZ_FESIH_TOUR,
  HAKSIZ_FESIH_TOUR_WELCOME_BODY,
  HAKSIZ_FESIH_TOUR_WELCOME_TITLE,
} from "./guidedTour";
import {
  buildHaksizFesihSaveResult,
  haksizFesihCaseCrud,
  listHaksizFesihCasesFromBackend,
  mapHaksizFesihFormFromBackend,
  resolveSavedCaseDisplayName,
} from "./backendCase";
import {
  KATSAYILAR,
  clampYearInDateInput,
  computeHaksizFesih,
  formatDateTR,
  formatMoney,
  isDateOrderInvalid,
} from "./engine";
import {
  NOTE_BLOCKS,
  createEmptyForm,
  snapshotKey,
  type HaksizFesihForm,
  type SavedCase,
} from "./model";
import { clearCorruptCases, deleteCase } from "./storage";
import styles from "./HaksizFesihTazminatiPage.module.css";

const PAGE_TITLE = "Haksız Fesih Tazminatı";
const PREVIEW_TITLE = "Haksız Fesih Tazminatı Rapor";

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
        <label className={styles.label} htmlFor="hf-save-name">
          Kayıt adı
        </label>
        <input
          id="hf-save-name"
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

export default function HaksizFesihTazminatiPage() {
  const { success, error: showError, info: toastInfo } = useToast();
  const tour = useGuidedTourController();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");
  const backendLoadedCaseIdRef = useRef<string | null>(null);
  const [form, setForm] = useState<HaksizFesihForm>(createEmptyForm);
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

  const result = useDeferredFormMemo(form, computeHaksizFesih);
  const dirty = snapshotKey(form) !== baseline;

  const reloadCases = useCallback(async () => {
    try {
      const items = await listHaksizFesihCasesFromBackend();
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

  /* Profil → Kaydedilen Hesaplamalar: ?caseId= ile backend kaydını aç */
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
        const mapped = mapHaksizFesihFormFromBackend(record.data);
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

  const patch = useCallback(<K extends keyof HaksizFesihForm>(key: K, value: HaksizFesihForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  /** DraftTextInput blur/Enter beklemeden brüt ücreti forma işler (Hesapla). */
  const handleCalculateWage = useCallback(() => {
    const el = document.getElementById("hf-brut") as HTMLInputElement | null;
    const next = (el?.value ?? form.brut).trim();
    patch("brut", next);
    el?.blur();
  }, [form.brut, patch]);

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
      if (!(result.brutVal > 0)) {
        showError("Geçerli bir brüt ücret giriniz");
        return;
      }
      setCaseSaving(true);
      const wasUpdate = !!(existingId && /^\d+$/.test(existingId));
      const maxAmount = result.coefRows[result.coefRows.length - 1]?.value ?? 0;
      try {
        const record = await haksizFesihCaseCrud.saveCase(
          name,
          form,
          buildHaksizFesihSaveResult({
            brutForNet: result.brutForNet,
            netTazminat: result.netTazminat,
            mahsupSonrasiNet: result.mahsupSonrasiNet,
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
    [form, result, reloadCases, setCaseIdParam, showError, success],
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
        await haksizFesihCaseCrud.removeCase(confirmDeleteId);
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
    result.coefRows.find((row) => row.k === (form.netAyKatsayi ?? 6))?.value ??
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
          [
            "İşçiye Ödenen Tutar",
            result.odenenVal > 0 ? `${formatMoney(result.odenenVal)} ₺` : "—",
          ],
        ],
      },
    ];

    if (result.coefRows.length > 0) {
      sections.push({
        id: "katsayi",
        title: "Haksız Fesih Tazminatı Hesaplama Detayı",
        headers: ["Katsayı", "Hesaplama", "Tutar"],
        rows: result.coefRows.map((row) => [
          `${row.k} ay`,
          `${formatMoney(result.brutVal)} × ${row.k}`,
          `${formatMoney(row.value)} ₺`,
        ]),
      });
    }

    const netRows: string[][] = [
      ["Seçilen Süre", `${form.netAyKatsayi ?? 6} aylık`],
      ["Brüt Haksız Fesih Tazminatı", `${formatMoney(result.brutForNet)} ₺`],
      ["Damga Vergisi (Binde 7,59)", `−${formatMoney(result.damgaVergisi)} ₺`],
      ["Net Haksız Fesih Tazminatı", `${formatMoney(result.netTazminat)} ₺`],
    ];
    if (result.odenenVal > 0) {
      netRows.push(
        ["İşçiye Ödenen Tutar (Mahsup)", `−${formatMoney(result.odenenVal)} ₺`],
        ["Mahsup Sonrası Net Tutar", `${formatMoney(result.mahsupSonrasiNet)} ₺`],
      );
    }
    sections.push({
      id: "brutten-nete",
      title: "Brütten Nete",
      headers: ["Kalem", "Tutar"],
      rows: netRows,
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
              TBK m.438/3 kapsamında hâkimin takdirine bağlı olarak belirlenebilen, işçinin altı aylık
              ücretini aşamayacak tazminat hesabı. Damga vergisi (binde 7,59) ve mahsup hesabı.
              Hesaplama cihazınızda yapılır; kayıtlar hesabınıza yazılır.
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
              <AnimatedMoney value={result.brutForNet} /> ₺
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
          <section className={styles.card} data-tour="haksiz-fesih-donem">
            <div className={styles.cardHead}>
              <Calculator size={16} />
              <h2 className={styles.cardTitle}>Tarih bilgileri</h2>
            </div>
            <div className={styles.fields3}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="hf-ise-giris">
                  İşe giriş
                </label>
                <DraftDateInput
                  id="hf-ise-giris"
                  max="9999-12-31"
                  className={`${styles.input} ${dateError ? styles.inputError : ""}`}
                  value={form.startDate}
                  onCommit={(value) => {
                    const next = clampYearInDateInput(value);
                    patch("startDate", next);
                    if (next && form.endDate) validateDates(next, form.endDate);
                  }}
                  onBlur={() => {
                    if (form.startDate && form.endDate) validateDates(form.startDate, form.endDate);
                  }}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="hf-isten-cikis">
                  İşten çıkış
                </label>
                <DraftDateInput
                  id="hf-isten-cikis"
                  max="9999-12-31"
                  className={`${styles.input} ${dateError ? styles.inputError : ""}`}
                  value={form.endDate}
                  onCommit={(value) => {
                    const next = clampYearInDateInput(value);
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
                  <FlashValue value={result.workPeriod?.label || "—"} />
                </div>
              </div>
            </div>
          </section>

          <section className={styles.card} data-tour="haksiz-fesih-ucret">
            <div className={styles.cardHead}>
              <Calculator size={16} />
              <h2 className={styles.cardTitle}>Ücret bilgileri</h2>
            </div>
            <div className={styles.fields}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="hf-brut">
                  Çıplak brüt ücret
                </label>
                <DraftTextInput
                  id="hf-brut"
                  className={`${styles.input} ${result.asgariUcretHatasi ? styles.inputError : ""}`}
                  inputMode="decimal"
                  placeholder="Örn: 25.000"
                  value={form.brut}
                  onCommit={(value) => patch("brut", value)}
                />
                {result.asgariUcretHatasi ? (
                  <p className={styles.warn}>{result.asgariUcretHatasi}</p>
                ) : null}
              </div>
            </div>

            <div className={styles.calcActions}>
              <Button type="button" variant="primary" size="sm" onClick={handleCalculateWage}>
                <Calculator size={14} /> Hesapla
              </Button>
            </div>

            <div className={styles.coefTable}>
              <div className={styles.coefTableHead}>Takdiri Tazminat (1–6 Aylık Ücret)</div>
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

          <section className={styles.card} data-tour="haksiz-fesih-mahsup">
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Mahsup</h2>
            </div>
            <div className={styles.fields}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="hf-mahsup">
                  İşçiye ödenen tutar (mahsup)
                </label>
                <DraftTextInput
                  id="hf-mahsup"
                  className={styles.input}
                  inputMode="decimal"
                  placeholder="Örn: 50.000"
                  value={form.odenenTutar}
                  onCommit={(value) => patch("odenenTutar", value)}
                />
                <p className={styles.helper}>Varsa net tazminattan mahsup edilir.</p>
              </div>
            </div>
          </section>
        </div>

        <aside className={styles.aside} style={{ display: "grid", gap: "0.85rem", minWidth: 0 }}>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Brütten nete</h2>
            </div>
            <p className={styles.cardHint}>
              Brüt tutardan yalnızca binde 7,59 oranında damga vergisi kesintisi uygulanır.
            </p>
            <div className={styles.fields} style={{ marginBottom: "0.65rem" }}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="hf-brut-net-ops">
                  Brüt tutar (opsiyonel)
                </label>
                <DraftTextInput
                  id="hf-brut-net-ops"
                  className={styles.input}
                  inputMode="decimal"
                  placeholder={`Varsayılan: ${formatMoney(defaultBrutPlaceholder)}`}
                  value={form.brutInputForNet}
                  onCommit={(value) => patch("brutInputForNet", value)}
                />
              </div>
              <div className={styles.field}>
                <span className={styles.label} id="hf-net-ay-label">
                  Tazminat süresi
                </span>
                <div className={styles.monthPick} role="group" aria-labelledby="hf-net-ay-label">
                  {KATSAYILAR.map((k) => {
                    const active = (form.netAyKatsayi ?? 6) === k;
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
                <div className={styles.resultLabel}>Brüt haksız fesih</div>
                <div className={styles.resultValue}>
                  <AnimatedMoney value={result.brutForNet} /> ₺
                </div>
              </div>
              <div className={styles.lineList}>
                <div className={styles.line}>
                  <span>Damga vergisi (‰7,59)</span>
                  <strong className={styles.deduction}>
                    −
                    <FlashValue value={formatMoney(result.damgaVergisi)} /> ₺
                  </strong>
                </div>
              </div>
              <div className={`${styles.resultCard} ${styles.resultCardStrong}`}>
                <div className={styles.resultLabel}>Net tazminat</div>
                <div className={styles.resultValue}>
                  <AnimatedMoney value={result.netTazminat} /> ₺
                </div>
              </div>
              {result.odenenVal > 0 ? (
                <>
                  <div className={styles.lineList}>
                    <div className={styles.line}>
                      <span>Mahsup</span>
                      <strong className={styles.deduction}>
                        −
                        <FlashValue value={formatMoney(result.odenenVal)} /> ₺
                      </strong>
                    </div>
                  </div>
                  <div className={`${styles.resultCard} ${styles.resultCardStrong}`}>
                    <div className={styles.resultLabel}>Mahsup sonrası net</div>
                    <div className={styles.resultValue}>
                      <AnimatedMoney value={result.mahsupSonrasiNet} /> ₺
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Hukuki notlar</h2>
            </div>
            <div className={styles.notes}>
              {NOTE_BLOCKS.map((n, i) => (
                <p key={i} className={`${styles.note} ${n.emphasis === "warning" ? styles.noteWarn : ""}`}>
                  {n.text}
                </p>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <div
        className={`${styles.stickyBar} ${dirty ? styles.stickyBarDirty : ""}`}
        data-tour="haksiz-fesih-kaydet-actions"
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
            <Button type="button" variant="primary" size="sm" onClick={handleSaveClick} disabled={caseSaving}>
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
                        {new Date(c.updatedAt).toLocaleString("tr-TR")} · Net{" "}
                        {formatMoney(c.results.netTazminat)} ₺
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
        contentId="haksiz-fesih-preview"
        onClose={() => setPreviewOpen(false)}
      />

      <GuidedTourHost
        definition={HAKSIZ_FESIH_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={HAKSIZ_FESIH_TOUR_WELCOME_TITLE}
        welcomeBody={HAKSIZ_FESIH_TOUR_WELCOME_BODY}
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
