import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Calculator,
  CirclePlay,
  Coins,
  Eye,
  FilePlus2,
  FolderOpen,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { ApiError } from "@/api/client";
import { getSavedCase } from "@/api/savedCases";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { DraftTextInput } from "@/components/form";
import { GuidedTourHost, useGuidedTourController } from "@/components/guided-tour";
import tourStyles from "@/components/guided-tour/GuidedTour.module.css";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import { useCalculationCaseBinding } from "@/hooks/useCalculationCaseBinding";
import {
  PRIM_ALACAGI_TOUR,
  PRIM_ALACAGI_TOUR_WELCOME_BODY,
  PRIM_ALACAGI_TOUR_WELCOME_TITLE,
} from "./guidedTour";
import {
  buildPrimAlacagiSaveResult,
  listPrimAlacagiCasesFromBackend,
  mapPrimFormFromBackend,
  primAlacagiCaseCrud,
  resolveSavedCaseDisplayName,
} from "./backendCase";
import { computePrim, formatMoney, validatePrimForm } from "./engine";
import { createEmptyForm, createEmptyRow, NOTE_TEXT, snapshotKey, type PrimForm, type SavedCase } from "./model";
import { clearCorruptCases, deleteCase } from "./storage";
import styles from "./PrimAlacagiPage.module.css";

const PAGE_TITLE = "Prim Alacağı";
const PREVIEW_TITLE = "Prim Alacağı Rapor";

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
        <label className={styles.label} htmlFor="pr-save-name">
          Kayıt adı
        </label>
        <input
          id="pr-save-name"
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

export default function PrimAlacagiPage() {
  const { success, error: showError, info: toastInfo } = useToast();
  const tour = useGuidedTourController();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");
  const backendLoadedCaseIdRef = useRef<string | null>(null);
  const [form, setForm] = useState<PrimForm>(createEmptyForm);
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

  const result = useMemo(() => computePrim(form), [form]);
  const dirty = snapshotKey(form) !== baseline;

  const reloadCases = useCallback(async () => {
    try {
      const items = await listPrimAlacagiCasesFromBackend();
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

  /* Profil → Kaydedilen Hesaplamalar: ?caseId= ile backend kaydını aç (yalnızca form; hesap lokal) */
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
        const mapped = mapPrimFormFromBackend(record.data);
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

  const patchRow = useCallback((id: string, field: "principal" | "percent", value: string) => {
    setForm((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    }));
  }, []);

  const addRow = useCallback(() => {
    setForm((prev) => ({ ...prev, rows: [...prev.rows, createEmptyRow()] }));
  }, []);

  const removeRow = useCallback((id: string) => {
    setForm((prev) => ({ ...prev, rows: prev.rows.filter((r) => r.id !== id) }));
  }, []);

  const setBrutInputForNet = useCallback((value: string) => {
    setForm((prev) => ({ ...prev, brutInputForNet: value }));
  }, []);

  const handleNew = useCallback(() => {
    if (dirty) {
      setConfirmNew(true);
      return;
    }
    setForm(createEmptyForm());
    setActiveId(null);
    setActiveName(null);
    setBaseline(snapshotKey(createEmptyForm()));
  }, [dirty]);

  const doNew = useCallback(() => {
    setConfirmNew(false);
    setForm(createEmptyForm());
    setActiveId(null);
    setActiveName(null);
    setBaseline(snapshotKey(createEmptyForm()));
  }, []);

  const persist = useCallback(
    async (name: string, existingId?: string | null) => {
      const validation = validatePrimForm(form);
      if (!validation.isValid) {
        showError(validation.errors[0] || "Form hatası");
        return;
      }
      setCaseSaving(true);
      const wasUpdate = !!(existingId && /^\d+$/.test(existingId));
      try {
        const record = await primAlacagiCaseCrud.saveCase(
          name,
          form,
          buildPrimAlacagiSaveResult(result.total, result.netTotal),
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
    const validation = validatePrimForm(form);
    if (!validation.isValid) {
      showError(validation.errors[0] || "Form hatası");
      return;
    }
    if (activeId && activeName && /^\d+$/.test(activeId)) {
      void persist(activeName, activeId);
      return;
    }
    setNameOpen(true);
  }, [activeId, activeName, form, persist, showError]);

  const openCase = useCallback(
    (c: SavedCase) => {
      const next = { ...createEmptyForm(), ...c.form };
      setForm(next);
      setActiveId(c.id);
      setActiveName(c.name);
      setBaseline(snapshotKey(next));
      setListOpen(false);
      success(`Kayıt açıldı: ${c.name}`);
    },
    [success],
  );

  const doDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    try {
      if (/^\d+$/.test(confirmDeleteId)) {
        await primAlacagiCaseCrud.removeCase(confirmDeleteId);
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

  const previewSections = useMemo((): PreviewSection[] => {
    const sections: PreviewSection[] = [
      {
        id: "genel",
        title: "Genel Bilgiler",
        headers: ["Alan", "Değer"],
        rows: [
          ["Toplam Prim Kalemi", String(form.rows.length)],
          ["Toplam Prim Alacağı", result.total ? `${formatMoney(result.total)} ₺` : "—"],
        ],
      },
      {
        id: "detay",
        title: "Prim Alacağı Detayı",
        headers: ["#", "Prim Matrahı (Brüt Ücret)", "Prim Oranı (%)", "Prim Tutarı"],
        rows: [
          ...result.rows.map((row, idx) => [
            String(idx + 1),
            row.principal > 0 ? `${formatMoney(row.principal)} ₺` : "—",
            row.percent > 0 ? `%${formatMoney(row.percent)}` : "—",
            `${formatMoney(row.amount)} ₺`,
          ]),
          ["", "", "TOPLAM:", `${formatMoney(result.total)} ₺`],
        ],
        lastRowTone: "blue",
      },
      {
        id: "brutten-nete",
        title: "Brütten Nete",
        headers: ["Kalem", "Tutar"],
        rows: [
          ["Brüt Prim Alacağı", `${formatMoney(result.brutForNetConversion)} ₺`],
          ["Damga Vergisi (Binde 7,59)", `−${formatMoney(result.damgaVergisi)} ₺`],
          ["Net Prim Alacağı", `${formatMoney(result.netTotal)} ₺`],
        ],
        lastRowTone: "green",
      },
    ];
    return sections;
  }, [form.rows.length, result]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroIcon} aria-hidden>
            <Coins size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 className={styles.title}>{PAGE_TITLE}</h1>
            <p className={styles.desc}>
              Sözleşme/toplu iş sözleşmesi kapsamında hak edilen prim kalemleri ve brütten nete
              çevrimi (damga vergisi binde 7,59). Hesaplama cihazınızda yapılır; kayıtlar hesabınıza yazılır.
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
            <span>Net prim alacağı</span>
            <span className={styles.quickTotalValue}>
              <AnimatedMoney value={result.netTotal} /> ₺
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
          <section className={styles.card} data-tour="prim-alacagi-kalemler">
            <div className={styles.cardHead}>
              <Calculator size={16} />
              <h2 className={styles.cardTitle}>Prim kalemleri</h2>
            </div>
            <div className={styles.rowsGrid}>
              {form.rows.map((r, idx) => {
                const rowResult = result.rows[idx];
                return (
                  <div key={r.id} className={styles.primRow} data-tour-prim-row>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor={`pr-principal-${r.id}`}>
                        Prim Matrahı (Brüt Ücret)
                      </label>
                      <DraftTextInput
                        id={`pr-principal-${r.id}`}
                        className={styles.input}
                        inputMode="decimal"
                        placeholder="Örn: 50.000"
                        value={r.principal}
                        onCommit={(value) => patchRow(r.id, "principal", value)}
                      />
                    </div>
                    <div className={styles.field} style={{ maxWidth: "7rem" }}>
                      <label className={styles.label} htmlFor={`pr-percent-${r.id}`}>
                        Prim Oranı (%)
                      </label>
                      <DraftTextInput
                        id={`pr-percent-${r.id}`}
                        className={styles.input}
                        inputMode="decimal"
                        placeholder="10"
                        value={r.percent}
                        onCommit={(value) => patchRow(r.id, "percent", value)}
                      />
                    </div>
                    <div className={styles.field} style={{ minWidth: "8rem" }}>
                      <span className={styles.label}>Prim Tutarı</span>
                      <div className={styles.readonlyBox}>
                        <FlashValue value={`${formatMoney(rowResult?.amount ?? 0)} ₺`} />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Satırı sil"
                      onClick={() => removeRow(r.id)}
                      disabled={form.rows.length <= 1}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                );
              })}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={addRow} style={{ marginTop: "0.6rem" }}>
              <Plus size={14} /> Satır Ekle
            </Button>
          </section>
        </div>

        <aside className={styles.aside} style={{ display: "grid", gap: "0.85rem", minWidth: 0 }}>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Toplam prim alacağı</h2>
            </div>
            <div className={`${styles.resultCard} ${styles.resultCardAccent}`}>
              <div className={styles.resultLabel}>Toplam Prim</div>
              <div className={styles.resultValue}>
                <AnimatedMoney value={result.total} /> ₺
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Brütten nete</h2>
            </div>
            <p className={styles.cardHint}>
              Brüt tutardan yalnızca binde 7,59 oranında damga vergisi kesintisi uygulanır. Gelir
              vergisi uygulanmaz.
            </p>
            <div className={styles.field} style={{ marginTop: "0.6rem" }}>
              <label className={styles.label} htmlFor="pr-brut-net-ops">
                Brüt tutar (opsiyonel)
              </label>
              <DraftTextInput
                id="pr-brut-net-ops"
                className={styles.input}
                inputMode="decimal"
                placeholder={`Varsayılan: ${formatMoney(result.total)}`}
                value={form.brutInputForNet}
                onCommit={setBrutInputForNet}
              />
              <p className={styles.helper}>Boş bırakırsanız toplam prim alacağı kullanılır.</p>
            </div>
            <div className={styles.resultStack} style={{ marginTop: "0.6rem" }}>
              <div className={styles.lineList}>
                <div className={styles.line}>
                  <span>Brüt Prim Alacağı</span>
                  <strong>
                    <FlashValue value={`${formatMoney(result.brutForNetConversion)} ₺`} />
                  </strong>
                </div>
                <div className={styles.line}>
                  <span>Damga vergisi (‰7,59)</span>
                  <strong className={styles.deduction}>
                    −
                    <FlashValue value={formatMoney(result.damgaVergisi)} /> ₺
                  </strong>
                </div>
              </div>
              <div className={`${styles.resultCard} ${styles.resultCardStrong}`}>
                <div className={styles.resultLabel}>Net prim alacağı</div>
                <div className={styles.resultValue}>
                  <AnimatedMoney value={result.netTotal} /> ₺
                </div>
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Hukuki notlar</h2>
            </div>
            <div className={styles.notes}>
              <p className={styles.note}>{NOTE_TEXT}</p>
            </div>
          </section>
        </aside>
      </div>

      <div
        className={`${styles.stickyBar} ${dirty ? styles.stickyBarDirty : ""}`}
        data-tour="prim-alacagi-kaydet-actions"
      >
        <div className={styles.stickyInner}>
          <div className={styles.stickyStatus}>
            {dirty
              ? "Kaydedilmemiş değişiklikler var"
              : activeName
                ? `Kayıt: ${activeName}`
                : "Yeni hesaplama"}
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

      {listOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className={styles.modalTitle}>Kayıtlı hesaplamalar</h3>
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
              <p className={styles.helper}>Henüz kayıt yok.</p>
            ) : (
              <div className={styles.caseList}>
                {cases.map((c) => (
                  <div key={c.id} className={styles.caseItem}>
                    <div style={{ minWidth: 0 }}>
                      <div className={styles.caseName}>{c.name}</div>
                      <div className={styles.caseMeta}>
                        {new Date(c.updatedAt).toLocaleString("tr-TR")} · Net{" "}
                        {formatMoney(c.results.netTotal)} ₺
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
        contentId="prim-alacagi-preview"
        onClose={() => setPreviewOpen(false)}
      />

      <GuidedTourHost
        definition={PRIM_ALACAGI_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={PRIM_ALACAGI_TOUR_WELCOME_TITLE}
        welcomeBody={PRIM_ALACAGI_TOUR_WELCOME_BODY}
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
