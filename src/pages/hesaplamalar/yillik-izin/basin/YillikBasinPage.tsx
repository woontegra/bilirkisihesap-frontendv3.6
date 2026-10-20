import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Newspaper } from "lucide-react";
import { YillikPageView } from "../lib/YillikPageView";
import { buildBasinGunlukYillikPreviewSections } from "../lib/buildBasinGunlukYillikPreviewSections";
import { createEmptyUsedRow } from "../lib/core";
import { isDateOrderInvalid } from "../lib/dates";
import { makeYillikBackendConfig } from "../lib/makeYillikBackendConfig";
import { formatMoney } from "../lib/money";
import type { CaseListEntry, UsedLeaveRow } from "../lib/types";
import { useYillikCaseBackend } from "../lib/useYillikCaseBackend";
import { basinYillikSaveGate, yillikBasinBackend } from "./backendCase";
import { clampYear, computeYillikBasinResult } from "./engine";
import { createEmptyForm, snapshotKey } from "./model";
import { NOTE_BLOCKS } from "./notes";
import { clearCorruptCases, deleteCase, loadCasesSafe } from "./storage";
import styles from "../lib/YillikPageView.module.css";

const PAGE_TITLE = "Yıllık Ücretli İzin — Basın (Günlük Gazete)";
const PREVIEW_TITLE = "Yıllık İzin — Basın Günlük Gazete Raporu";

const backendConfig = makeYillikBackendConfig({
  backend: yillikBasinBackend,
  createEmptyForm,
  snapshotKey,
  loadCasesSafe,
  deleteCase,
  clearCorruptCases,
  getSavePayload: basinYillikSaveGate,
});

export default function YillikBasinPage() {
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

  const result = useMemo(() => computeYillikBasinResult(form), [form]);
  const dirty = snapshotKey(form) !== baseline;

  const patch = useCallback(<K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const validateDates = useCallback((start: string, end: string) => {
    if (isDateOrderInvalid(start, end)) {
      setDateError("İşten çıkış tarihi, işe giriş tarihinden önce olamaz.");
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
      breakdown: result.basinDetail as unknown as Record<string, unknown>,
      startDate: form.startDate,
      endDate: form.endDate,
    }),
    [form.endDate, form.startDate, result],
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
    () => buildBasinGunlukYillikPreviewSections({ form, result }),
    [form, result],
  );

  const meslekKidemiUyarisi = useMemo(() => {
    if (!form.meslegeBaslangic || !form.endDate) return null;
    if (isDateOrderInvalid(form.meslegeBaslangic, form.endDate)) {
      return "Mesleğe başlangıç tarihi, işten çıkış tarihinden sonra olamaz.";
    }
    return null;
  }, [form.endDate, form.meslegeBaslangic]);

  const dateFieldsSlot = (
    <div className={styles.fields2Stack}>
      {result.basinDetail.aciklama ? (
        <p className={styles.warn}>{result.basinDetail.aciklama}</p>
      ) : null}
      <div className={styles.fields2}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="basin-meslege-baslangic">
            Mesleğe başlangıç tarihi
          </label>
          <input
            id="basin-meslege-baslangic"
            type="date"
            max="9999-12-31"
            className={styles.input}
            value={form.meslegeBaslangic}
            onChange={(e) => patch("meslegeBaslangic", clampYear(e.target.value))}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.label}>İşyerindeki çalışma süresi</span>
          <div className={styles.readonlyBox}>{result.isyeriCalismaLabel || "—"}</div>
        </div>
      </div>
      <div className={styles.fields2}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="basin-ise-giris">
            İşe giriş tarihi
          </label>
          <input
            id="basin-ise-giris"
            type="date"
            max="9999-12-31"
            className={`${styles.input} ${dateError ? styles.inputError : ""}`}
            value={form.startDate}
            onChange={(e) => {
              patch("startDate", clampYear(e.target.value));
              validateDates(clampYear(e.target.value), form.endDate);
            }}
            onBlur={() => validateDates(form.startDate, form.endDate)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="basin-isten-cikis">
            İşten çıkış tarihi
          </label>
          <input
            id="basin-isten-cikis"
            type="date"
            max="9999-12-31"
            className={`${styles.input} ${dateError ? styles.inputError : ""}`}
            value={form.endDate}
            onChange={(e) => {
              patch("endDate", clampYear(e.target.value));
              validateDates(form.startDate, clampYear(e.target.value));
            }}
            onBlur={() => validateDates(form.startDate, form.endDate)}
          />
        </div>
      </div>
      <div className={styles.fields2}>
        <div className={styles.field}>
          <span className={styles.label}>Meslekteki kıdem süresi</span>
          <div className={styles.readonlyBox}>{result.meslekKidemiLabel || "—"}</div>
          {meslekKidemiUyarisi ? <p className={styles.warn}>{meslekKidemiUyarisi}</p> : null}
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
      guidedTourVariant="basin"
      icon={Newspaper}
      pageTitle={PAGE_TITLE}
      pageDescription="5953 sayılı Basın İş Kanunu — günlük gazete işçisi yıllık izin (4/6 hafta kuralı)."
      previewTitle={PREVIEW_TITLE}
      previewContentId="yillik-basin-preview-content"
      notes={NOTE_BLOCKS}
      headerControls={
        <div className={styles.field}>
          <label className={styles.label} htmlFor="gazeteci-turu">
            Gazeteci türü
          </label>
          <select
            id="gazeteci-turu"
            className={styles.input}
            value="gunluk"
            onChange={(e) => {
              if (e.target.value === "gunlukOlmayan") navigate("/yillik-izin/basin/gunluk-olmayan");
            }}
          >
            <option value="gunluk">Günlük gazete</option>
            <option value="gunlukOlmayan">Günlük olmayan gazete</option>
          </select>
        </div>
      }
      startDate={form.startDate}
      endDate={form.endDate}
      workPeriodLabel={result.isyeriCalismaLabel}
      onStartDateChange={() => {}}
      onEndDateChange={() => {}}
      onDateBlur={() => validateDates(form.startDate, form.endDate)}
      dateError={dateError}
      dateFieldsSlot={dateFieldsSlot}
      brut={form.brut}
      onBrutChange={(v) => patch("brut", v)}
      asgariUcretHatasi={result.asgariUcretHatasi}
      usedRows={form.usedRows}
      {...usedRowHandlers}
      usedLeaveSetsModuleId="yillik-izin-basin-used-leave"
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
