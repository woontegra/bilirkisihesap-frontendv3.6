/**
 * 24 Saat Vardiya — istisna paneli (5 tür, set kaydet/içe aktar, UBGT).
 */

import { useEffect, useState } from "react";
import { CalendarDays, Download, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { daysBetweenIsoInclusive, isValidIsoDate } from "./engine";
import { EXCLUSION_TYPES, newLocalId, type ExclusionItem } from "./model";
import { exclusionRangeVisible } from "../shared/exclusionDisplayFilter";
import {
  deleteExclusionSet,
  getAllExclusionSets,
  mergeFmExclusionImport,
  saveExclusionSet,
  type SavedExclusionSet,
} from "./exclusionSets";
import accordionStyles from "../shared/ExclusionsAccordion.module.css";
import styles from "./Vardiya24FmPage.module.css";

function suggestedDays(start: string, end: string): number {
  if (!isValidIsoDate(start) || !isValidIsoDate(end) || end < start) return 1;
  return daysBetweenIsoInclusive(start, end);
}

export function ExclusionsPanel({
  exclusions,
  onChange,
  onOpenUbgtPicker,
  visibleAfterIso = null,
  onOverlayOpenChange,
}: {
  exclusions: ExclusionItem[];
  onChange: (next: ExclusionItem[]) => void;
  onOpenUbgtPicker: () => void;
  visibleAfterIso?: string | null;
  /** Kaydet / İçe Aktar overlay açıkken kılavuz pause için. */
  onOverlayOpenChange?: (open: boolean) => void;
}) {
  const visibleRows = exclusions.filter((row) => exclusionRangeVisible(row.start, row.end, visibleAfterIso));
  const [isOpen, setIsOpen] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [setName, setSetName] = useState("");
  const [savedSets, setSavedSets] = useState<SavedExclusionSet[]>([]);

  useEffect(() => {
    onOverlayOpenChange?.(showSaveModal || showImportModal);
    return () => onOverlayOpenChange?.(false);
  }, [showSaveModal, showImportModal, onOverlayOpenChange]);

  const addRow = () => {
    onChange([...exclusions, { id: newLocalId(), type: "Yıllık İzin", start: "", end: "", days: 1 }]);
  };

  const updateRow = (id: string, patch: Partial<ExclusionItem>) => {
    onChange(
      exclusions.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (patch.start && (!row.end || row.end < next.start)) next.end = next.start;
        return next;
      }),
    );
  };

  const removeRow = (id: string) => {
    onChange(exclusions.filter((row) => row.id !== id));
  };

  const confirmSave = () => {
    if (!setName.trim()) return;
    void (async () => {
      if (await saveExclusionSet(setName, exclusions)) {
        setShowSaveModal(false);
      }
    })();
  };

  const importSet = (set: SavedExclusionSet) => {
    onChange(mergeFmExclusionImport(exclusions, set.data as ExclusionItem[], newLocalId));
    setShowImportModal(false);
  };

  const removeSet = (id: string) => {
    void (async () => {
      await deleteExclusionSet(id);
      setSavedSets(await getAllExclusionSets());
    })();
  };

  return (
    <section className={styles.card} style={{ animationDelay: "130ms" }}>
      <button
        type="button"
        className={accordionStyles.exclusionAccordionHead}
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
      >
        <span>Yıllık izin / Çalışılmayan raporlu günler dışlanabilir.</span>
        <span className={accordionStyles.exclusionAccordionChevron} aria-hidden>
          {isOpen ? "▼" : "▶"}
        </span>
      </button>

      {isOpen ? (
        <div className={accordionStyles.exclusionAccordionBody}>
      <p className={styles.panelHint}>Dışlama ekleyin; düşüm, girdiğiniz gün sayısına göre yapılır.</p>

      <div className={styles.exclusionList}>
        {exclusions.length === 0 ? (
          <p className={styles.emptyText} />
        ) : (
          visibleRows.map((item) => (
            <div key={item.id} className={styles.exclusionRow}>
              <select
                className={styles.extraName}
                value={item.type}
                onChange={(e) => updateRow(item.id, { type: e.target.value as ExclusionItem["type"] })}
                aria-label="Tür"
              >
                {EXCLUSION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className={styles.extraName}
                value={item.start}
                onChange={(e) =>
                  updateRow(item.id, {
                    start: e.target.value,
                    days: suggestedDays(
                      e.target.value,
                      item.end && item.end >= e.target.value ? item.end : e.target.value,
                    ),
                  })
                }
                aria-label="Başlangıç"
              />
              <input
                type="date"
                className={styles.extraName}
                value={item.end}
                min={item.start || undefined}
                onChange={(e) =>
                  updateRow(item.id, { end: e.target.value, days: suggestedDays(item.start, e.target.value) })
                }
                aria-label="Bitiş"
              />
              <input
                type="number"
                className={styles.extraDays}
                min={0}
                step={0.5}
                value={item.days}
                onChange={(e) => updateRow(item.id, { days: Number(e.target.value) || 0 })}
                aria-label="Gün"
                placeholder="0"
              />
              <button type="button" className={styles.removeBtn} onClick={() => removeRow(item.id)} aria-label="Sil">
                <X size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className={styles.exclusionActions}>
        <button type="button" className={styles.addRowBtn} onClick={addRow}>
          <Plus size={14} />
          + Ekle
        </button>
        <button type="button" className={styles.addRowBtn} onClick={onOpenUbgtPicker}>
          <CalendarDays size={14} />
          UBGT günleri (FM düşümü)
        </button>
        <button
          type="button"
          className={styles.addRowBtn}
          onClick={() => {
            setSetName("");
            setShowSaveModal(true);
          }}
          disabled={exclusions.length === 0}
        >
          <Save size={14} />
          Kaydet
        </button>
        <button
          type="button"
          className={styles.addRowBtn}
          onClick={() => {
            void getAllExclusionSets().then((sets) => {
              setSavedSets(sets);
              setShowImportModal(true);
            });
          }}
        >
          <Download size={14} />
          İçe Aktar
        </button>
        <button
          type="button"
          className={styles.addRowBtn}
          onClick={() => onChange(exclusions.filter((e) => e.type === "UBGT"))}
          disabled={exclusions.every((e) => e.type === "UBGT")}
        >
          <Trash2 size={14} />
          Tümünü Sil
        </button>
      </div>
        </div>
      ) : null}

      {showSaveModal ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setShowSaveModal(false)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Dışlanabilir Günleri Kaydet</h2>
            <input
              className={styles.modalInput}
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
              placeholder="Kayıt adı"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && setName.trim()) confirmSave();
                if (e.key === "Escape") setShowSaveModal(false);
              }}
            />
            <div className={styles.modalActions}>
              <Button variant="soft" onClick={() => setShowSaveModal(false)}>
                İptal
              </Button>
              <Button variant="primary" disabled={!setName.trim()} onClick={confirmSave}>
                Kaydet
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showImportModal ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setShowImportModal(false)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Kayıtlı Dışlanabilir Günler</h2>
            {savedSets.length === 0 ? (
              <p className={styles.emptyText}>Henüz kayıtlı liste yok.</p>
            ) : (
              <ul className={styles.setList}>
                {savedSets.map((set) => (
                  <li key={set.id} className={styles.setRow}>
                    <div className={styles.setInfo}>
                      <strong>{set.name}</strong>
                      <span>
                        {set.data.length} satır · {new Date(set.createdAt).toLocaleDateString("tr-TR")}
                      </span>
                    </div>
                    <div className={styles.inlineActions}>
                      <Button variant="soft" size="sm" onClick={() => importSet(set)}>
                        Yükle
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => removeSet(set.id)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.modalActions}>
              <Button variant="soft" onClick={() => setShowImportModal(false)}>
                Kapat
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
