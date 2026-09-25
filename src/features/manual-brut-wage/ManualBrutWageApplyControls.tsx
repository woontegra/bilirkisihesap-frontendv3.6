/**
 * Kayıtlı manuel brüt şablonunu cetvel satırlarına uygular / kaldırır.
 * V3 ManualBrutWageApplyControls davranışı; V3.5 tasarım token’larıyla.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ManuelBrutTemplate } from "@/pages/araclar/manuel-brut-ucret/model";
import {
  applyManualWagePeriodsToRowBruts,
  countFilledPeriods,
  formatManualPeriodLabel,
  getManualBrutTemplate,
  loadManualBrutTemplates,
  type ManualBrutRowStub,
} from "./manualBrutApply";
import styles from "./ManualBrutWageApplyControls.module.css";

export type ManualBrutWageApplyControlsProps = {
  rows: ManualBrutRowStub[];
  onApplyBrutsByRowId: (brutById: Record<string, number>) => void;
  manualBrutActive?: boolean;
  onDeactivateManualBrut?: () => void;
  success: (title: string, description?: string) => void;
  error?: (title: string, description?: string) => void;
};

export function ManualBrutWageApplyControls({
  rows,
  onApplyBrutsByRowId,
  manualBrutActive = false,
  onDeactivateManualBrut,
  success,
  error,
}: ManualBrutWageApplyControlsProps) {
  const [showModal, setShowModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templatesList, setTemplatesList] = useState<ManuelBrutTemplate[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedPeriods, setSelectedPeriods] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!showModal) return;
    let cancelled = false;
    setLoadingList(true);
    (async () => {
      try {
        const list = await loadManualBrutTemplates();
        if (cancelled) return;
        setTemplatesList(list);
        setSelectedTemplateId((prev) => (list.some((t) => t.id === prev) ? prev : list[0]?.id ?? ""));
      } catch {
        if (!cancelled) {
          setTemplatesList([]);
          error?.("Şablonlar yüklenemedi.", "Bağlantınızı kontrol edip tekrar deneyin.");
        }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showModal, error]);

  useEffect(() => {
    if (!showModal || !selectedTemplateId) {
      setSelectedPeriods({});
      return;
    }
    let cancelled = false;
    (async () => {
      const tmpl = await getManualBrutTemplate(selectedTemplateId);
      if (cancelled) return;
      setSelectedPeriods(tmpl?.periods ?? {});
    })();
    return () => {
      cancelled = true;
    };
  }, [showModal, selectedTemplateId, templatesList]);

  const openModal = useCallback(() => {
    setShowModal(true);
  }, []);

  const handleMainButtonClick = useCallback(() => {
    if (manualBrutActive) {
      onDeactivateManualBrut?.();
      success("Manuel ücret kaldırıldı", "Brüt ücretler satır tarihlerine göre asgari ücrete döner.");
      return;
    }
    openModal();
  }, [manualBrutActive, onDeactivateManualBrut, success, openModal]);

  const handleApply = useCallback(async () => {
    const tmpl = await getManualBrutTemplate(selectedTemplateId);
    const periods = tmpl?.periods;
    if (!periods || !Object.keys(periods).length) {
      error?.("Manuel ücret şablonu bulunamadı.", "Silinmiş veya geçersiz şablon.");
      return;
    }
    const { brutById, applied, skipped } = applyManualWagePeriodsToRowBruts(periods, rows);
    onApplyBrutsByRowId(brutById);
    success(`${applied} satıra manuel ücret aktarıldı, ${skipped} satırda uygun ücret bulunamadı.`);
    setShowModal(false);
  }, [rows, selectedTemplateId, onApplyBrutsByRowId, success, error]);

  const previewRows = useMemo(() => {
    if (!showModal || !selectedTemplateId) return [] as { key: string; label: string; amount: number }[];
    return Object.entries(selectedPeriods)
      .filter(([, v]) => typeof v === "number" && Number.isFinite(v) && v > 0)
      .map(([key, amount]) => ({
        key,
        label: formatManualPeriodLabel(key),
        amount: amount as number,
      }));
  }, [showModal, selectedTemplateId, selectedPeriods]);

  const hasTemplates = templatesList.length > 0;
  const filledSelected = countFilledPeriods(selectedPeriods);

  return (
    <>
      <div className={styles.bar}>
        <p className={styles.hint}>
          Kayıtlı şablondaki dönem brüt ücretlerini tablodaki eşleşen satırlara uygular.
        </p>
        <Button
          type="button"
          variant={manualBrutActive ? "soft" : "ghost"}
          size="sm"
          onClick={handleMainButtonClick}
          title={manualBrutActive ? "Manuel brütü kaldır, asgari ücrete dön" : "Şablondan manuel brüt uygula"}
        >
          {manualBrutActive ? "Asgari ücrete dön" : "Manuel Ücret Kullan"}
        </Button>
      </div>

      {showModal ? (
        <div className={styles.overlay} onClick={() => setShowModal(false)} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 className={styles.modalTitle}>Manuel Ücret Şablonu</h3>
            <p className={styles.modalText}>
              Tablodaki satır başlangıç tarihine göre asgari ücret dönemi eşleşir; yalnızca brüt ücret güncellenir.
            </p>
            {loadingList ? (
              <p className={styles.muted}>Şablonlar yükleniyor…</p>
            ) : !hasTemplates ? (
              <p className={styles.empty}>
                Önce Hızlı Araçlar {">"} Manuel Brüt Ücret Şablonu alanından ücretleri kaydedin.
              </p>
            ) : (
              <>
                <label className={styles.fieldLabel} htmlFor="manual-wage-template-select">
                  İçe aktarılacak şablon
                </label>
                <select
                  id="manual-wage-template-select"
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className={styles.select}
                >
                  {templatesList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {previewRows.length === 0 ? (
                  <p className={styles.muted}>Bu şablonda tanımlı dönem ücreti yok.</p>
                ) : (
                  <div className={styles.previewTableWrap}>
                    <table className={styles.previewTable}>
                      <thead>
                        <tr>
                          <th>Dönem</th>
                          <th>Brüt ücret (TL)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map(({ key, label, amount }) => (
                          <tr key={key}>
                            <td>{label}</td>
                            <td>
                              {amount.toLocaleString("tr-TR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
            <div className={styles.modalActions}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowModal(false)}>
                Kapat
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={loadingList || !hasTemplates || !selectedTemplateId || filledSelected === 0}
                onClick={() => void handleApply()}
              >
                Tabloya Aktar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
