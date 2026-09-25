import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FilePlus2,
  FolderOpen,
  Pencil,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import {
  formatFloorDisplay,
  formatMoneyInput,
  parseMoneyInput,
  sanitizeMoneyTyping,
} from "./money";
import type { ManuelBrutCatalogPeriod, ManuelBrutTemplate } from "./model";
import { formatPeriodLabel, getManuelBrutPeriodCatalog } from "./periodCatalog";
import {
  addTemplate,
  clearCorruptStorage,
  deleteTemplate,
  loadTemplatesSafe,
  updateTemplate,
} from "./storage";
import {
  buildPeriodsMap,
  collectPeriodFloorErrors,
  findFloorViolations,
  formatFloorViolationMessage,
  formatPeriodFloorError,
  periodsEqual,
} from "./validation";
import styles from "./ManualBrutWagePage.module.css";

type PendingNav =
  | { kind: "select"; id: string }
  | { kind: "new" }
  | null;

type YearFilter = "all" | "filled" | "empty";

function formatUpdatedAt(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ManualBrutWagePage() {
  const toast = useToast();
  const catalog = useMemo(() => getManuelBrutPeriodCatalog(), []);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ManuelBrutTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [periodInputs, setPeriodInputs] = useState<Record<string, string>>({});
  const [periodErrors, setPeriodErrors] = useState<Record<string, string>>({});
  const [baseline, setBaseline] = useState<{ name: string; periods: Record<string, number> }>({
    name: "",
    periods: {},
  });
  const [listOpen, setListOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingNav, setPendingNav] = useState<PendingNav>(null);
  const [saveFlash, setSaveFlash] = useState(false);
  const [formPulse, setFormPulse] = useState(false);
  const [yearQuery, setYearQuery] = useState("");
  const [yearFilter, setYearFilter] = useState<YearFilter>("all");
  const [fillFlashYear, setFillFlashYear] = useState<number | null>(null);

  const reload = useCallback(async () => {
    const result = await loadTemplatesSafe();
    if (!result.ok) {
      setStorageError(result.reason);
      setTemplates([]);
      return [] as ManuelBrutTemplate[];
    }
    setStorageError(null);
    setTemplates(result.templates);
    return result.templates;
  }, []);

  const applyEditor = useCallback((tmpl: ManuelBrutTemplate | null) => {
    if (!tmpl) {
      setName("");
      setPeriodInputs({});
      setPeriodErrors({});
      setBaseline({ name: "", periods: {} });
      return;
    }
    const next: Record<string, string> = {};
    for (const [key, amount] of Object.entries(tmpl.periods)) {
      next[key] = formatMoneyInput(amount);
    }
    setName(tmpl.name);
    setPeriodInputs(next);
    setPeriodErrors({});
    setBaseline({ name: tmpl.name, periods: { ...tmpl.periods } });
    setFormPulse(true);
    window.setTimeout(() => setFormPulse(false), 520);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await reload();
      if (cancelled) return;
      if (list[0]) {
        setSelectedId(list[0].id);
        applyEditor(list[0]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload, applyEditor]);

  const isDirty = useMemo(() => {
    const current = buildPeriodsMap(periodInputs);
    const nameChanged = name.trim() !== baseline.name.trim();
    return nameChanged || !periodsEqual(current, baseline.periods);
  }, [name, periodInputs, baseline]);

  const filledCount = useMemo(
    () => Object.values(buildPeriodsMap(periodInputs)).length,
    [periodInputs],
  );

  const totalPeriods = useMemo(
    () => catalog.reduce((sum, y) => sum + y.periods.length, 0),
    [catalog],
  );

  const yearRows = useMemo(() => {
    return catalog.map(({ year, periods }) => {
      const filled = periods.filter((p) => parseMoneyInput(periodInputs[p.key] ?? "") > 0).length;
      const hasError = periods.some((p) => Boolean(periodErrors[p.key]));
      return {
        year,
        periods,
        filled,
        total: periods.length,
        hasError,
        isFilled: filled > 0,
        isComplete: filled === periods.length && filled > 0,
      };
    });
  }, [catalog, periodInputs, periodErrors]);

  const visibleYears = useMemo(() => {
    const q = yearQuery.trim();
    return yearRows.filter((row) => {
      if (q && !String(row.year).includes(q)) return false;
      if (yearFilter === "filled" && !row.isFilled) return false;
      if (yearFilter === "empty" && row.isFilled) return false;
      return true;
    });
  }, [yearRows, yearQuery, yearFilter]);

  const requestNav = (next: PendingNav) => {
    if (isDirty) {
      setPendingNav(next);
      setDiscardOpen(true);
      return;
    }
    commitNav(next);
  };

  const commitNav = (next: PendingNav) => {
    if (!next) return;
    if (next.kind === "new") {
      setSelectedId(null);
      applyEditor(null);
      setListOpen(false);
      return;
    }
    const tmpl = templates.find((t) => t.id === next.id) ?? null;
    setSelectedId(next.id);
    applyEditor(tmpl);
    setListOpen(false);
  };

  const handlePeriodChange = (key: string, value: string, year: number) => {
    const sanitized = sanitizeMoneyTyping(value);
    const wasEmpty = !parseMoneyInput(periodInputs[key] ?? "");
    const willFill = parseMoneyInput(sanitized) > 0;
    setPeriodInputs((prev) => ({ ...prev, [key]: sanitized }));
    if (wasEmpty && willFill) {
      setFillFlashYear(year);
      window.setTimeout(() => setFillFlashYear((y) => (y === year ? null : y)), 650);
    }
    setPeriodErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handlePeriodBlur = (
    period: ManuelBrutCatalogPeriod,
    year: number,
    totalInYear: number,
    raw: string,
  ) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setPeriodErrors((prev) => {
        if (!prev[period.key]) return prev;
        const next = { ...prev };
        delete next[period.key];
        return next;
      });
      return;
    }
    const amount = parseMoneyInput(trimmed);
    if (amount <= 0) return;
    if (amount < period.floorBrut) {
      const message = formatPeriodFloorError(year, period.indexInYear, totalInYear, period.floorBrut);
      setPeriodErrors((prev) => ({ ...prev, [period.key]: message }));
      toast.error(message);
      return;
    }
    setPeriodInputs((prev) => ({
      ...prev,
      [period.key]: formatMoneyInput(amount),
    }));
    setPeriodErrors((prev) => {
      if (!prev[period.key]) return prev;
      const next = { ...prev };
      delete next[period.key];
      return next;
    });
  };

  const handleSave = async () => {
    const periods = buildPeriodsMap(periodInputs);
    const floorErrors = collectPeriodFloorErrors(catalog, periodInputs);
    if (Object.keys(floorErrors).length > 0) {
      setPeriodErrors(floorErrors);
      toast.error(Object.values(floorErrors)[0] ?? "Asgari ücretin altında");
      return;
    }
    setPeriodErrors({});
    if (!name.trim()) {
      toast.error("Kaydetmeden önce bir şablon adı girin.");
      return;
    }
    if (Object.keys(periods).length === 0) {
      toast.error("2010–2026 aralığından en az bir brüt değer doldurulmalı.");
      return;
    }
    const violations = findFloorViolations(periods);
    if (violations.length > 0) {
      toast.error(formatFloorViolationMessage(violations[0]));
      return;
    }

    try {
      if (selectedId) {
        const ok = await updateTemplate(selectedId, name, periods);
        if (!ok) {
          toast.error("Kaydedilemedi. Aynı isimde başka şablon olabilir.");
          return;
        }
        const list = await reload();
        const updated = list.find((t) => t.id === selectedId) ?? null;
        applyEditor(updated);
        setSaveFlash(true);
        window.setTimeout(() => setSaveFlash(false), 700);
        toast.success("Şablon güncellendi");
        return;
      }

      const created = await addTemplate(name, periods);
      if (!created) {
        toast.error("Kaydedilemedi. Aynı isimde şablon var veya geçerli ücret girilmedi.");
        return;
      }
      await reload();
      setSelectedId(created.id);
      applyEditor(created);
      setSaveFlash(true);
      window.setTimeout(() => setSaveFlash(false), 700);
      toast.success("Şablon kaydedildi");
    } catch {
      toast.error("Şablon kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.");
    }
  };

  const handleReset = () => {
    if (selectedId) {
      const tmpl = templates.find((t) => t.id === selectedId) ?? null;
      applyEditor(tmpl);
    } else {
      applyEditor(null);
    }
    toast.info("Değişiklikler sıfırlandı");
  };

  const openDelete = (id: string) => {
    setDeleteTargetId(id);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    const id = deleteTargetId ?? selectedId;
    if (!id) return;
    try {
      await deleteTemplate(id);
      const list = await reload();
      if (selectedId === id) {
        const next = list[0] ?? null;
        setSelectedId(next?.id ?? null);
        applyEditor(next);
      }
      setDeleteOpen(false);
      setDeleteTargetId(null);
      toast.success("Şablon silindi");
    } catch {
      toast.error("Şablon silinemedi. Bağlantınızı kontrol edip tekrar deneyin.");
    }
  };

  const selectedTemplate = templates.find((t) => t.id === selectedId);
  const deleteTargetName =
    templates.find((t) => t.id === (deleteTargetId ?? selectedId))?.name ?? "bu şablon";

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroIcon} aria-hidden>
            <Wallet size={22} />
          </div>
          <div className={styles.heroCopy}>
            <h1 className={styles.title}>Manuel Brüt Ücret Şablonları</h1>
            <p className={styles.desc}>
              Asgari ücret kullanmayan işçiler için 2010–2026 dönem brüt ücretlerini kaydedin. Altı
              aylık dönemlerde yıl başına iki alan açılır.
            </p>
            <div className={styles.privacyBadge}>
              <ShieldCheck size={14} />
              <span>Veriler hesabınıza güvenli şekilde kaydedilir</span>
            </div>
          </div>
        </div>
        <div className={styles.heroAside}>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Aktif şablon</span>
            <strong className={styles.summaryValue}>
              {selectedTemplate?.name || (name.trim() ? name : "Yeni şablon")}
            </strong>
            <span className={styles.summaryMeta}>
              {filledCount}/{totalPeriods} dönem dolu
              {isDirty ? " · kaydedilmedi" : ""}
            </span>
          </div>
          <Button variant="primary" size="sm" onClick={() => requestNav({ kind: "new" })}>
            <FilePlus2 size={14} />
            Yeni şablon
          </Button>
        </div>
      </header>

      {storageError ? (
        <div className={styles.storageBanner} role="alert">
          <p>{storageError}</p>
          <Button
            variant="soft"
            size="sm"
            onClick={() => {
              clearCorruptStorage();
              setStorageError(null);
              void (async () => {
                await reload();
                setSelectedId(null);
                applyEditor(null);
                toast.info("Önbellek temizlendi; yeniden yükleniyor");
              })();
            }}
          >
            Yeniden dene
          </Button>
        </div>
      ) : null}

      <div className={styles.layout}>
        <aside className={`${styles.sidebar} ${listOpen ? styles.sidebarOpen : ""}`}>
          <div className={styles.sidebarHead}>
            <div>
              <h2>Kayıtlı şablonlar</h2>
              <p className={styles.sidebarSub}>{templates.length} kayıt</p>
            </div>
            <Button variant="soft" size="sm" onClick={() => requestNav({ kind: "new" })}>
              <FilePlus2 size={14} />
              Yeni
            </Button>
          </div>

          {templates.length === 0 ? (
            <div className={styles.emptyList}>
              <div className={styles.emptyIcon}>
                <FolderOpen size={24} strokeWidth={1.5} />
              </div>
              <p>Henüz şablon yok</p>
              <span>Yeni şablon oluşturarak dönem brütlerini kaydedin. Kayıtlar bu tarayıcıda kalır.</span>
              <Button variant="primary" size="sm" onClick={() => requestNav({ kind: "new" })}>
                İlk şablonu oluştur
              </Button>
            </div>
          ) : (
            <ul className={styles.templateList}>
              {templates.map((t, i) => (
                <li key={t.id} style={{ animationDelay: `${70 + i * 45}ms` }}>
                  <div
                    className={
                      selectedId === t.id
                        ? `${styles.templateCard} ${styles.templateActive} ${saveFlash && selectedId === t.id ? styles.templateSaved : ""}`
                        : styles.templateCard
                    }
                  >
                    <button
                      type="button"
                      className={styles.templateSelect}
                      onClick={() => requestNav({ kind: "select", id: t.id })}
                    >
                      <span className={styles.templateName}>{t.name}</span>
                      <span className={styles.templateMeta}>
                        {Object.keys(t.periods).length} dönem · {formatUpdatedAt(t.updatedAt)}
                      </span>
                    </button>
                    <div className={styles.templateActions}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title="Düzenle"
                        aria-label={`${t.name} düzenle`}
                        onClick={() => requestNav({ kind: "select", id: t.id })}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                        title="Sil"
                        aria-label={`${t.name} sil`}
                        onClick={() => openDelete(t.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {listOpen ? (
          <button
            type="button"
            className={styles.backdrop}
            aria-label="Listeyi kapat"
            onClick={() => setListOpen(false)}
          />
        ) : null}

        <section className={`${styles.editor} ${formPulse ? styles.editorPulse : ""}`}>
          <div className={styles.mobileListToggle}>
            <Button variant="soft" size="sm" onClick={() => setListOpen(true)}>
              <FolderOpen size={14} />
              {selectedTemplate?.name || "Şablon listesi"}
            </Button>
            <Button variant="soft" size="sm" onClick={() => requestNav({ kind: "new" })}>
              <FilePlus2 size={14} />
              Yeni
            </Button>
          </div>

          <div className={styles.nameCard}>
            <label className={styles.fieldLabel} htmlFor="manuel-brut-template-name">
              Şablon adı
            </label>
            <input
              id="manuel-brut-template-name"
              className={styles.nameInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn. Davacı A — fabrika ücretleri"
              autoComplete="off"
            />
            <p className={styles.hint}>
              {selectedId ? "Mevcut şablon düzenleniyor" : "Yeni şablon oluşturuluyor"} ·{" "}
              {filledCount > 0 ? `${filledCount} dönem dolu` : "En az bir dönem girin"}
            </p>
          </div>

          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <Search size={14} aria-hidden />
              <input
                type="search"
                className={styles.searchInput}
                placeholder="Yıl ara…"
                value={yearQuery}
                onChange={(e) => setYearQuery(e.target.value)}
                aria-label="Yıl ara"
              />
            </div>
            <div className={styles.filterGroup} role="group" aria-label="Yıl filtresi">
              {(
                [
                  ["all", "Tümü"],
                  ["filled", "Dolu"],
                  ["empty", "Boş"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={yearFilter === id ? styles.filterActive : styles.filterBtn}
                  onClick={() => setYearFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className={styles.filterCount}>{visibleYears.length} yıl</span>
          </div>

          <div className={styles.periodGrid}>
            {visibleYears.length === 0 ? (
              <div className={styles.filterEmpty}>
                Filtreye uyan yıl yok. Aramayı veya filtreyi temizleyin.
              </div>
            ) : (
              visibleYears.map((row, yearIndex) => (
                <article
                  key={row.year}
                  className={[
                    styles.yearCard,
                    row.isComplete ? styles.yearCardComplete : "",
                    row.isFilled && !row.isComplete ? styles.yearCardPartial : "",
                    row.hasError ? styles.yearCardError : "",
                    fillFlashYear === row.year ? styles.yearCardFlash : "",
                    styles.yearCardVisible,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ animationDelay: `${80 + yearIndex * 32}ms` }}
                >
                  <header className={styles.yearHead}>
                    <div>
                      <h3>{row.year}</h3>
                      <span className={styles.yearSub}>
                        {row.total === 1 ? "Tek dönem" : `${row.total} dönem`}
                      </span>
                    </div>
                    <span
                      className={
                        row.isComplete
                          ? styles.statusComplete
                          : row.isFilled
                            ? styles.statusPartial
                            : styles.statusEmpty
                      }
                    >
                      {row.filled}/{row.total} dolu
                    </span>
                  </header>
                  <div
                    className={
                      row.total > 1 ? styles.periodRowDual : styles.periodRowSingle
                    }
                  >
                    {row.periods.map((period) => (
                      <label key={period.key} className={styles.periodField}>
                        <span className={styles.periodLabel}>
                          {formatPeriodLabel(row.year, period.indexInYear, row.total)}
                        </span>
                        <span className={styles.floorBadge}>
                          Asgari {formatFloorDisplay(period.floorBrut)} ₺
                        </span>
                        <div
                          className={
                            periodErrors[period.key]
                              ? `${styles.inputWrap} ${styles.inputWrapError}`
                              : styles.inputWrap
                          }
                        >
                          <input
                            type="text"
                            inputMode="decimal"
                            value={periodInputs[period.key] ?? ""}
                            onChange={(e) =>
                              handlePeriodChange(period.key, e.target.value, row.year)
                            }
                            onBlur={(e) =>
                              handlePeriodBlur(
                                period,
                                row.year,
                                row.total,
                                e.currentTarget.value,
                              )
                            }
                            className={styles.periodInput}
                            placeholder="0,00"
                            aria-invalid={periodErrors[period.key] ? true : undefined}
                            aria-describedby={
                              periodErrors[period.key] ? `${period.key}-err` : undefined
                            }
                          />
                          <span className={styles.currency} aria-hidden>
                            ₺
                          </span>
                        </div>
                        {periodErrors[period.key] ? (
                          <span id={`${period.key}-err`} className={styles.periodError}>
                            {periodErrors[period.key]}
                          </span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <div
        className={[
          styles.stickyBar,
          isDirty ? styles.stickyBarDirty : "",
          saveFlash ? styles.stickyBarSaved : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className={styles.stickyInner}>
          <p className={styles.stickyStatus}>
            {isDirty ? (
              <>Kaydedilmemiş değişiklikler var</>
            ) : (
              <>Tüm değişiklikler kaydedildi</>
            )}
          </p>
          <div className={styles.stickyActions}>
            <Button variant="soft" size="sm" onClick={handleReset} disabled={!isDirty}>
              <RotateCcw size={14} />
              Sıfırla
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              className={saveFlash ? styles.saveBtnFlash : undefined}
            >
              <Save size={14} />
              {selectedId ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Şablonu sil"
        description={`“${deleteTargetName}” hesabınızdan silinecek. Bu işlem geri alınamaz.`}
        confirmLabel="Sil"
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteTargetId(null);
        }}
      />

      <ConfirmDialog
        open={discardOpen}
        title="Kaydedilmemiş değişiklikler"
        description="Şablon değiştirirseniz kaydedilmemiş brüt ücret girişleri kaybolur. Devam edilsin mi?"
        confirmLabel="Değişiklikleri at"
        cancelLabel="Düzenlemeye dön"
        danger
        onConfirm={() => {
          setDiscardOpen(false);
          commitNav(pendingNav);
          setPendingNav(null);
        }}
        onCancel={() => {
          setDiscardOpen(false);
          setPendingNav(null);
        }}
      />
    </div>
  );
}
