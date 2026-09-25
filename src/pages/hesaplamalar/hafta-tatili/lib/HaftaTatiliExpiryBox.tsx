/**
 * V3 HaftaTatiliExpiryBox — Zamanaşımı İtirazı modalı.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";

export type HaftaTatiliExpiryBoxProps = {
  expiryStart: string | null;
  onExpiryStartChange: (date: string | null) => void;
  onExpiryCancel?: () => void;
  iseGiris?: string;
  styles: Record<string, string>;
};

function toUTC(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr + "T00:00:00Z");
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function toISODateUTC(date: Date | null): string {
  if (!date) return "";
  try {
    return date.toISOString().split("T")[0] ?? "";
  } catch {
    return "";
  }
}

function differenceInCalendarDays(later: Date, earlier: Date): number {
  const a = Date.UTC(later.getUTCFullYear(), later.getUTCMonth(), later.getUTCDate());
  const b = Date.UTC(earlier.getUTCFullYear(), earlier.getUTCMonth(), earlier.getUTCDate());
  return Math.floor((a - b) / 86_400_000);
}

function subDays(date: Date, amount: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() - amount);
  return d;
}

function subYears(date: Date, amount: number): Date {
  const d = new Date(date.getTime());
  d.setUTCFullYear(d.getUTCFullYear() - amount);
  return d;
}

function formatTR(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${date.getUTCFullYear()}`;
}

function useZamanasimiPreview(dava: string, bas: string, bit: string, iseGiris?: string) {
  return useMemo(() => {
    const davaD = dava ? toUTC(dava) : null;
    const basD = bas ? toUTC(bas) : null;
    const bitD = bit ? toUTC(bit) : null;
    const gun = basD && bitD ? Math.max(0, differenceInCalendarDays(bitD, basD) + 1) : null;
    const limit = davaD ? subYears(davaD, 5) : null;

    const pandemiBas = new Date("2020-03-13T00:00:00Z");
    const pandemiBit = new Date("2020-06-15T00:00:00Z");
    const iseD = iseGiris ? toUTC(iseGiris) : null;
    let pandemiGun = 0;
    if (iseD) {
      if (iseD < pandemiBas) pandemiGun = 94;
      else if (iseD >= pandemiBas && iseD <= pandemiBit) {
        pandemiGun = Math.max(0, differenceInCalendarDays(pandemiBit, iseD) + 1);
      }
    }
    const pandemiEklendi = pandemiGun > 0;
    let nihai = limit ? (gun != null ? subDays(limit, gun) : limit) : null;
    if (pandemiEklendi && nihai) nihai = subDays(nihai, pandemiGun);
    return { davaD, gun, limit, nihai, pandemiEklendi, pandemiGun };
  }, [dava, bas, bit, iseGiris]);
}

export default function HaftaTatiliExpiryBox({
  expiryStart,
  onExpiryStartChange,
  onExpiryCancel,
  iseGiris,
  styles,
}: HaftaTatiliExpiryBoxProps) {
  const { error: showToastError } = useToast();
  const [open, setOpen] = useState(false);
  const [zForm, setZForm] = useState({ dava: "", bas: "", bit: "" });
  const prevRef = useRef<string | null>(null);
  const preview = useZamanasimiPreview(zForm.dava, zForm.bas, zForm.bit, iseGiris);

  const apply = useCallback(() => {
    try {
      const basUTC = zForm.bas ? toUTC(zForm.bas) : null;
      const bitUTC = zForm.bit ? toUTC(zForm.bit) : null;
      const arabuluculukGun =
        basUTC && bitUTC ? Math.max(0, differenceInCalendarDays(bitUTC, basUTC) + 1) : 0;
      const davaUTC = zForm.dava ? toUTC(zForm.dava) : null;
      const limitTarihi = davaUTC ? subYears(davaUTC, 5) : null;
      let nihai = limitTarihi ? subDays(limitTarihi, arabuluculukGun) : null;

      const pandemiBas = new Date("2020-03-13T00:00:00Z");
      const pandemiBit = new Date("2020-06-15T00:00:00Z");
      const iseD = iseGiris ? toUTC(iseGiris) : null;
      let pandemiGun = 0;
      if (iseD) {
        if (iseD < pandemiBas) pandemiGun = 94;
        else if (iseD >= pandemiBas && iseD <= pandemiBit) {
          pandemiGun = Math.max(0, differenceInCalendarDays(pandemiBit, iseD) + 1);
        }
      }
      if (pandemiGun > 0 && nihai) nihai = subDays(nihai, pandemiGun);

      if (nihai) {
        prevRef.current = null;
        onExpiryStartChange(toISODateUTC(nihai));
      }
      setOpen(false);
    } catch {
      setOpen(false);
    }
  }, [zForm, iseGiris, onExpiryStartChange]);

  const cancel = useCallback(() => {
    setOpen(false);
    if (prevRef.current != null) onExpiryStartChange(prevRef.current);
    prevRef.current = null;
  }, [onExpiryStartChange]);

  const openModal = useCallback(() => {
    prevRef.current = expiryStart ?? null;
    if (expiryStart) onExpiryStartChange(null);
    setZForm({ dava: "", bas: "", bit: "" });
    setOpen(true);
  }, [expiryStart, onExpiryStartChange]);

  const remove = useCallback(() => {
    onExpiryStartChange(null);
    prevRef.current = null;
    onExpiryCancel?.();
  }, [onExpiryStartChange, onExpiryCancel]);

  const btnRow = styles.katsayiRow ?? styles.inlineBtns ?? "";
  const btn = styles.katsayiBtn ?? styles.chipGhostBtn ?? styles.input ?? "";
  const btnActive = styles.katsayiBtnActiveIndigo ?? styles.katsayiBtnActive ?? "";
  const btnRemove = styles.katsayiRemove ?? styles.chipGhostBtn ?? "";

  return (
    <>
      <div className={btnRow}>
        <button
          type="button"
          className={`${btn} ${expiryStart ? btnActive : ""}`}
          onClick={openModal}
        >
          {expiryStart ? "Zamanaşımı" : "Zamanaşımı İtirazı"}
        </button>
        {expiryStart ? (
          <button type="button" className={btnRemove} onClick={remove} title="Kaldır">
            Kaldır
          </button>
        ) : null}
      </div>

      {open
        ? createPortal(
            <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={cancel}>
              <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
                <h3 className={styles.modalTitle}>Zamanaşımı hesaplama</h3>
                <label className={styles.field ?? styles.label}>
                  <span className={styles.fieldLabel ?? styles.label}>Dava tarihi</span>
                  <input
                    type="date"
                    className={styles.dateInput ?? styles.input}
                    value={zForm.dava}
                    max="9999-12-31"
                    onChange={(e) => setZForm((p) => ({ ...p, dava: e.target.value }))}
                  />
                </label>
                <div className={styles.periodFields2 ?? styles.grid3}>
                  <label className={styles.field ?? styles.label}>
                    <span className={styles.fieldLabel ?? styles.label}>Arabuluculuk başlangıç</span>
                    <input
                      type="date"
                      className={styles.dateInput ?? styles.input}
                      value={zForm.bas}
                      max="9999-12-31"
                      onChange={(e) => setZForm((p) => ({ ...p, bas: e.target.value }))}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (
                          v &&
                          zForm.bit &&
                          new Date(v) > new Date(zForm.bit)
                        ) {
                          showToastError("Başlangıç, bitişten sonra olamaz.");
                        }
                      }}
                    />
                  </label>
                  <label className={styles.field ?? styles.label}>
                    <span className={styles.fieldLabel ?? styles.label}>Arabuluculuk bitiş</span>
                    <input
                      type="date"
                      className={styles.dateInput ?? styles.input}
                      value={zForm.bit}
                      max="9999-12-31"
                      onChange={(e) => setZForm((p) => ({ ...p, bit: e.target.value }))}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (
                          v &&
                          zForm.bas &&
                          new Date(v) < new Date(zForm.bas)
                        ) {
                          showToastError("Bitiş, başlangıçtan önce olamaz.");
                        }
                      }}
                    />
                  </label>
                </div>
                <div className={styles.expiryPreviewBox ?? styles.helper}>
                  <div>
                    Dava: <strong>{preview.davaD ? formatTR(preview.davaD) : "—"}</strong>
                  </div>
                  <div>
                    5 yıl
                    {preview.pandemiEklendi ? ` + ${preview.pandemiGun} gün (pandemi)` : ""}:{" "}
                    <strong>{preview.limit ? formatTR(preview.limit) : "—"}</strong>
                  </div>
                  <div>
                    Arabuluculuk: <strong>{preview.gun != null ? `${preview.gun} gün` : "—"}</strong>
                  </div>
                  <div className={styles.expiryPreviewFinal}>
                    Nihai başlangıç:{" "}
                    <strong>{preview.nihai ? formatTR(preview.nihai) : "—"}</strong>
                  </div>
                </div>
                <div className={styles.modalActions}>
                  <Button type="button" variant="ghost" size="sm" onClick={cancel}>
                    İptal
                  </Button>
                  <Button type="button" variant="primary" size="sm" onClick={apply}>
                    Uygula
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
