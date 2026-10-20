import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Newspaper } from "lucide-react";
import { YillikPageView } from "../../lib/YillikPageView";
import { buildBasinGunlukOlmayanYillikPreviewSections } from "../../lib/buildBasinGunlukOlmayanYillikPreviewSections";
import { createEmptyUsedRow } from "../../lib/core";
import { isDateOrderInvalid } from "../../lib/dates";
import { makeYillikBackendConfig } from "../../lib/makeYillikBackendConfig";
import { formatMoney } from "../../lib/money";
import type { CaseListEntry, UsedLeaveRow } from "../../lib/types";
import { useYillikCaseBackend } from "../../lib/useYillikCaseBackend";
import {
  basinGunlukOlmayanSaveGate,
  yillikBasinGunlukOlmayanBackend,
} from "./backendCase";
import { clampYear, computeYillikBasinGunlukOlmayanResult } from "./engine";
import { createEmptyForm, snapshotKey } from "./model";
import { NOTE_BLOCKS } from "./notes";
import { clearCorruptCases, deleteCase, loadCasesSafe } from "./storage";
import styles from "../../lib/YillikPageView.module.css";

const PAGE_TITLE = "Yıllık Ücretli İzin — Basın (Günlük Olmayan)";
const PREVIEW_TITLE = "Yıllık İzin — Basın Günlük Olmayan Raporu";

const backendConfig = makeYillikBackendConfig({
  backend: yillikBasinGunlukOlmayanBackend,
  createEmptyForm,
  snapshotKey,
  loadCasesSafe,
  deleteCase,
  clearCorruptCases,
  getSavePayload: basinGunlukOlmayanSaveGate,
});

export default function YillikBasinGunlukOlmayanPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(createEmptyForm);
  const [dateError, setDateError] = useState<string | null>(null);
  const [baseline, setBaseline] = useState(() => snapshotKey(createEmptyForm()));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);

  const applyLoadedForm = useCallback((loaded: ReturnType<typeof createEmptyForm>) => {
    setForm(loaded);
    setBaseline(snapshotKey(loaded));
    setDateError(null);
  }, []);

  const {
    cases,
    storageError,
    activeId,
    activeName,
    nameOpen,
    setNameOpen,
    listOpen,
    setListOpen,
    confirmDeleteId,
    setConfirmDeleteId,
    caseSaving,
    caseLoading,
    resetActiveCase,
    persist,
    handleSaveClick: saveFromBackend,
    onOpenCase,
    onConfirmDelete,
    clearStorageError,
  } = useYillikCaseBackend(backendConfig, applyLoadedForm);

  const result = useMemo(() => computeYillikBasinGunlukOlmayanResult(form), [form]);
  const dirty = snapshotKey(form) !== baseline;

  const patch = useCallback(<K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "meslegeBaslangic") {
        next.startDate = String(value);
      }
      return next;
    });
  }, []);

  const validateDates = useCallback((start: string, end: string) => {
    if (isDateOrderInvalid(start, end)) {
      setDateError("İşten çıkış tarihi, mesleğe başlangıç tarihinden önce olamaz.");
      return false;
    }
    setDateError(null);
    return true;
  }, []);

  const doNew = useCallback(() => {
    setConfirmNew(false);
    const empty = createEmptyForm();
    setForm(empty);
    resetActiveCase();
    setBaseline(snapshotKey(empty));
    setDateError(null);
  }, [resetActiveCase]);

  const handleNewClick = useCallback(() => {
    if (dirty) setConfirmNew(true);
    else doNew();
  }, [dirty, doNew]);

  const savePayload = useMemo(
    () => ({
      brutIzin: result.brutIzin,
      netIzin: result.netIzin,
      totalEntitlement: result.totalEntitlement,
      remainingDays: result.remainingDays,
      usedTotal: result.usedTotal,
      sgk: result.sgk,
      issizlik: result.issizlik,
      gelirVergisi: result.gelirVergisi,
      damgaVergisi: result.damgaVergisi,
      breakdown: {
        izinGun: result.izinResult.izinGun,
        devre: result.izinResult.devre,
        toplamAy: result.izinResult.toplamAy,
        hafta: result.izinResult.hafta,
      } as Record<string, unknown>,
      startDate: form.meslegeBaslangic || form.startDate,
      endDate: form.endDate,
    }),
    [form.endDate, form.meslegeBaslangic, form.startDate, result],
  );

  const onPersist = useCallback(
    (name: string) => {
      void persist(name, form, snapshotKey(form), savePayload, setBaseline, activeId);
    },
    [activeId, form, persist, savePayload],
  );

  const handleSaveClick = useCallback(() => {
    saveFromBackend(savePayload, form, snapshotKey(form), setBaseline);
  }, [form, saveFromBackend, savePayload]);

  const caseList: CaseListEntry[] = useMemo(
    () =>
      cases.map((c) => ({
        id: c.id,
        name: c.name,
        updatedAt: c.updatedAt,
        subtitle: `${formatMoney(c.results.netIzin)} ₺ net`,
      })),
    [cases],
  );

  const previewSections = useMemo(
    () => buildBasinGunlukOlmayanYillikPreviewSections({ form, result }),
    [form, result],
  );

  const dateFieldsSlot = (
    <div className={styles.fields2Stack}>
      <div className={styles.fields2}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="basin-go-meslege-baslangic">
            Mesleğe başlangıç tarihi
          </label>
          <input
            id="basin-go-meslege-baslangic"
            type="date"
            max="9999-12-31"
            className={`${styles.input} ${dateError ? styles.inputError : ""}`}
            value={form.meslegeBaslangic}
            onChange={(e) => {
              const v = clampYear(e.target.value);
              patch("meslegeBaslangic", v);
              validateDates(v, form.endDate);
            }}
            onBlur={() => validateDates(form.meslegeBaslangic, form.endDate)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="basin-go-isten-cikis">
            İşten çıkış tarihi
          </label>
          <input
            id="basin-go-isten-cikis"
            type="date"
            max="9999-12-31"
            className={`${styles.input} ${dateError ? styles.inputError : ""}`}
            value={form.endDate}
            onChange={(e) => {
              const v = clampYear(e.target.value);
              patch("endDate", v);
              validateDates(form.meslegeBaslangic, v);
            }}
            onBlur={() => validateDates(form.meslegeBaslangic, form.endDate)}
          />
        </div>
      </div>
      <div className={styles.fields2}>
        <div className={styles.field}>
          <span className={styles.label}>Çalışma süresi</span>
          <div className={styles.readonlyBox}>{result.calismaSuresiLabel || "—"}</div>
        </div>
      </div>
    </div>
  );

  const usedRowHandlers = {
    onAddUsedRow: () => setForm((prev) => ({ ...prev, usedRows: [...prev.usedRows, createEmptyUsedRow()] })),
    onUpdateUsedRow: (id: string, patchRow: Partial<UsedLeaveRow>) =>
      setForm((prev) => ({
        ...prev,
        usedRows: prev.usedRows.map((r) => (r.id === id ? { ...r, ...patchRow } : r)),
      })),
    onRemoveUsedRow: (id: string) =>
      setForm((prev) => ({ ...prev, usedRows: prev.usedRows.filter((r) => r.id !== id) })),
    onReplaceUsedRows: (rows: UsedLeaveRow[]) => setForm((prev) => ({ ...prev, usedRows: rows })),
  };

  return (
    <YillikPageView
      guidedTourVariant="basin-gunluk-olmayan"
      icon={Newspaper}
      pageTitle={PAGE_TITLE}
      pageDescription="5953 sayılı Basın İş Kanunu — günlük olmayan gazete işçisi yıllık izin (6 ayda 14 gün kuralı)."
      previewTitle={PREVIEW_TITLE}
      previewContentId="yillik-basin-gunluk-olmayan-preview-content"
      notes={NOTE_BLOCKS}
      headerControls={
        <div className={styles.field}>
          <label className={styles.label} htmlFor="gazeteci-turu-go">
            Gazeteci türü
          </label>
          <select
            id="gazeteci-turu-go"
            className={styles.input}
            value="gunlukOlmayan"
            onChange={(e) => {
              if (e.target.value === "gunluk") navigate("/yillik-izin/basin");
            }}
          >
            <option value="gunluk">Günlük gazete</option>
            <option value="gunlukOlmayan">Günlük olmayan gazete</option>
          </select>
        </div>
      }
      startDate={form.meslegeBaslangic}
      endDate={form.endDate}
      workPeriodLabel={result.calismaSuresiLabel}
      onStartDateChange={() => {}}
      onEndDateChange={() => {}}
      onDateBlur={() => validateDates(form.meslegeBaslangic, form.endDate)}
      dateError={dateError}
      dateFieldsSlot={dateFieldsSlot}
      brut={form.brut}
      onBrutChange={(v) => patch("brut", v)}
      asgariUcretHatasi={result.asgariUcretHatasi}
      usedRows={form.usedRows}
      {...usedRowHandlers}
      usedLeaveSetsModuleId="yillik-izin-basin-gunluk-olmayan-used-leave"
      entitlementLines={result.entitlementLines}
      totalEntitlementLabel="Toplam hak"
      usedTotal={result.usedTotal}
      remainingDays={result.remainingDays}
      formulaText={result.formulaText}
      brutIzin={result.brutIzin}
      sgk={result.sgk}
      issizlik={result.issizlik}
      gelirVergisi={result.gelirVergisi}
      gelirVergisiDilimleri={result.gelirVergisiDilimleri}
      damgaVergisi={result.damgaVergisi}
      netIzin={result.netIzin}
      employerPayment={form.employerPayment}
      onEmployerPaymentChange={(v) => patch("employerPayment", v)}
      dirty={dirty}
      activeName={activeName}
      isUpdate={!!(activeId && activeName)}
      caseSaving={caseSaving}
      caseLoading={caseLoading}
      storageError={storageError}
      onClearStorageError={clearStorageError}
      cases={caseList}
      nameOpen={nameOpen}
      setNameOpen={setNameOpen}
      listOpen={listOpen}
      setListOpen={setListOpen}
      previewOpen={previewOpen}
      setPreviewOpen={setPreviewOpen}
      confirmNew={confirmNew}
      setConfirmNew={setConfirmNew}
      confirmDeleteId={confirmDeleteId}
      setConfirmDeleteId={setConfirmDeleteId}
      onNewClick={handleNewClick}
      onConfirmNew={doNew}
      onSaveClick={handleSaveClick}
      onPersist={onPersist}
      onOpenCase={(id) => onOpenCase(id, setForm, setBaseline, () => setDateError(null))}
      onConfirmDelete={onConfirmDelete}
      previewSections={previewSections}
    />
  );
}
