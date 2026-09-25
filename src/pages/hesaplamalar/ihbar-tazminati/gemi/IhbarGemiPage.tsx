import { useCallback, useMemo, useState } from "react";
import { Anchor } from "lucide-react";
import type { PreviewSection } from "@/components/calculation-preview";
import { useToast } from "@/context/ToastContext";
import { newLocalId } from "../lib/caseStorage";
import { ihbarGemiBackend } from "../lib/ihbarBackendInstances";
import { makeIhbarBackendConfig } from "../lib/makeIhbarBackendConfig";
import { IhbarPageView, type WageFieldKey } from "../lib/IhbarPageView";
import { useIhbarCaseBackend } from "../lib/useIhbarCaseBackend";
import type { ExtraItem } from "../lib/types";
import { clampYear, computeIhbarGemiResult, formatDateTR, formatMoney, isDateOrderInvalid, parseNum } from "./engine";
import { createEmptyForm, snapshotKey, type IhbarGemiForm } from "./model";
import { NOTE_BLOCKS } from "./notes";
import { clearCorruptCases, deleteCase, loadCasesSafe } from "./storage";
import styles from "./IhbarGemiPage.module.css";

const PAGE_TITLE = "İhbar Tazminatı — Gemi Adamları";
const PREVIEW_TITLE = "İhbar Tazminatı — Gemi Adamları Raporu";

const backendConfig = makeIhbarBackendConfig({
  backend: ihbarGemiBackend,
  createEmptyForm,
  snapshotKey,
  loadCasesSafe,
  deleteCase,
  clearCorruptCases,
});

export default function IhbarGemiPage() {
  const { error: showError } = useToast();
  const [form, setForm] = useState<IhbarGemiForm>(createEmptyForm);
  const [dateError, setDateError] = useState<string | null>(null);
  const [baseline, setBaseline] = useState(() => snapshotKey(createEmptyForm()));
  const [removingExtraIds, setRemovingExtraIds] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);

  const applyLoadedForm = useCallback((loaded: IhbarGemiForm) => {
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
  } = useIhbarCaseBackend(backendConfig, applyLoadedForm);

  const result = useMemo(() => computeIhbarGemiResult(form), [form]);
  const dirty = snapshotKey(form) !== baseline;

  const patch = useCallback(<K extends keyof IhbarGemiForm>(key: K, value: IhbarGemiForm[K]) => {
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

  const doNew = useCallback(() => {
    setConfirmNew(false);
    setForm(createEmptyForm());
    resetActiveCase();
    setBaseline(snapshotKey(createEmptyForm()));
    setDateError(null);
  }, [resetActiveCase]);

  const handleNewClick = useCallback(() => {
    if (dirty) {
      setConfirmNew(true);
      return;
    }
    doNew();
  }, [dirty, doNew]);

  const onPersist = useCallback(
    (name: string) => {
      void persist(name, form, snapshotKey(form), result, setBaseline);
    },
    [form, persist, result],
  );

  const handleSaveClick = useCallback(() => {
    saveFromBackend(result, form, snapshotKey(form), setBaseline);
  }, [form, result, saveFromBackend]);

  const openCase = useCallback(
    (id: string) => {
      onOpenCase(id, setForm, setBaseline, () => setDateError(null));
    },
    [onOpenCase],
  );

  const onAddExtra = useCallback(() => {
    setForm((prev) => ({ ...prev, extras: [...prev.extras, { id: newLocalId("extra"), label: "", value: "" }] }));
  }, []);

  const onUpdateExtra = useCallback((id: string, patchValue: Partial<ExtraItem>) => {
    setForm((prev) => ({
      ...prev,
      extras: prev.extras.map((it) => (it.id === id ? { ...it, ...patchValue } : it)),
    }));
  }, []);

  const onRemoveExtra = useCallback((id: string) => {
    setRemovingExtraIds((prev) => [...prev, id]);
    window.setTimeout(() => {
      setForm((prev) => ({ ...prev, extras: prev.extras.filter((it) => it.id !== id) }));
      setRemovingExtraIds((prev) => prev.filter((x) => x !== id));
    }, 220);
  }, []);

  const onWageChange = useCallback((field: WageFieldKey, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const onReplaceExtrasAndWage = useCallback((wage: Record<WageFieldKey, string>, nextExtras: ExtraItem[]) => {
    setForm((prev) => ({ ...prev, ...wage, extras: nextExtras }));
  }, []);

  const previewSections = useMemo((): PreviewSection[] => {
    const sections: PreviewSection[] = [
      {
        id: "tarih",
        title: "Tarih Bilgileri",
        headers: ["İşe Giriş", "İşten Çıkış", "Çalışma Süresi"],
        rows: [[formatDateTR(form.startDate), formatDateTR(form.endDate), result.workPeriod.label]],
      },
    ];

    sections.push({
      id: "ucret",
      title: "Ücret Kalemleri",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Çıplak Brüt", `${formatMoney(parseNum(form.brut))} ₺`],
        ["Prim", `${formatMoney(parseNum(form.prim))} ₺`],
        ["İkramiye", `${formatMoney(parseNum(form.ikramiye))} ₺`],
        ["Yol", `${formatMoney(parseNum(form.yol))} ₺`],
        ["Yemek", `${formatMoney(parseNum(form.yemek))} ₺`],
        ...form.extras.map((it) => [it.label || "Ekstra", `${formatMoney(parseNum(it.value))} ₺`]),
        ["Toplam Brüt", `${formatMoney(result.toplamBrut)} ₺`],
      ],
      lastRowTone: "blue",
    });

    sections.push({
      id: "hesap",
      title: "İhbar Tazminatı Hesaplaması",
      headers: ["Kalem", "Değer"],
      rows: [
        ["İhbar Süresi", result.ihbarSuresiLabel],
        ["Hesaplama", result.formulaText],
        ["Toplam İhbar Tazminatı", `${formatMoney(result.brut)} ₺`],
      ],
      lastRowTone: "blue",
    });

    sections.push({
      id: "brutten-nete",
      title: "Brüt'ten Net'e",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Brüt İhbar Tazminatı", `${formatMoney(result.brut)} ₺`],
        ["Gelir Vergisi", `-${formatMoney(result.gelirVergisi)} ₺`],
        ["Damga Vergisi (Binde 7,59)", `-${formatMoney(result.damgaVergisi)} ₺`],
        ["Net İhbar Tazminatı", `${formatMoney(result.net)} ₺`],
      ],
      lastRowTone: "green",
    });

    return sections;
  }, [form, result]);

  return (
    <div className={styles.wrap}>
      <IhbarPageView
        pageTitle={PAGE_TITLE}
        pageDescription="Deniz İş Kanunu m.16 kapsamında gemiadamları için ihbar süresi (2/4/6/8 hafta) ve tazminat hesabı."
        icon={Anchor}
        previewTitle={PREVIEW_TITLE}
        previewContentId="ihbar-gemi-preview"
        guidedTourId="ihbar-gemi"
        startDate={form.startDate}
        endDate={form.endDate}
        onStartDateChange={(v) => patch("startDate", clampYear(v))}
        onEndDateChange={(v) => patch("endDate", clampYear(v))}
        onDateBlur={() => {
          if (form.startDate && form.endDate) validateDates(form.startDate, form.endDate);
        }}
        dateError={dateError}
        workPeriodLabel={result.workPeriod.label}
        brut={form.brut}
        onBrutChange={(v) => patch("brut", v)}
        asgariUcretHatasi={result.asgariUcretHatasi}
        wage={{ prim: form.prim, ikramiye: form.ikramiye, yol: form.yol, yemek: form.yemek }}
        onWageChange={onWageChange}
        onReplaceExtrasAndWage={onReplaceExtrasAndWage}
        extras={form.extras}
        onAddExtra={onAddExtra}
        onUpdateExtra={onUpdateExtra}
        onRemoveExtra={onRemoveExtra}
        removingExtraIds={removingExtraIds}
        toplamBrut={result.toplamBrut}
        ihbarSuresiLabel={result.ihbarSuresiLabel}
        formulaText={result.formulaText}
        brutSonuc={result.brut}
        gelirVergisi={result.gelirVergisi}
        gelirVergisiDilimleri={result.gelirVergisiDilimleri}
        damgaVergisi={result.damgaVergisi}
        net={result.net}
        notes={NOTE_BLOCKS}
        activeName={activeName}
        dirty={dirty}
        isUpdate={!!activeId}
        cases={cases.map((c) => ({
          id: c.id,
          name: c.name,
          updatedAt: c.updatedAt,
          subtitle: `Net ${formatMoney(c.results.net)} ₺`,
        }))}
        storageError={storageError}
        onClearStorageError={clearStorageError}
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
        onOpenCase={openCase}
        onConfirmDelete={onConfirmDelete}
        previewSections={previewSections}
        caseSaving={caseSaving}
        caseLoading={caseLoading}
      />
    </div>
  );
}
