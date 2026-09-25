import { useMemo, useState } from "react";
import { Filter, Plus, Trash2, Users } from "lucide-react";
import { IZIN_KOD_LABELS } from "../model";
import type { ControlStatus, IzinKodKey, StandardRow } from "../model";
import { ensureDurumKodlari } from "../codes";
import { isOffConflictRow } from "../transform";
import { formatIsoDateTR } from "@/utils/dateDisplay";
import PuantajPortalModal from "./PuantajPortalModal";
import styles from "../PuantajFmPage.module.css";

type PersonelGroup = { key: string; label: string; rows: StandardRow[] };

type Props = {
  groups: PersonelGroup[];
  selectedKeys: string[];
  visibleRows: StandardRow[];
  unknownDescriptions: string[];
  redCount: number;
  offConflictCount: number;
  onTogglePersonel: (key: string) => void;
  onSelectAllPersonel: () => void;
  onEditCell: (rowId: string, field: EditableField, value: string) => void;
  onResolveCode: (raw: string, kod: IzinKodKey) => void;
  onDeleteRow: (rowId: string) => void;
  onAddRow: () => void;
  onResolveOffKeepOff: (rowIds?: string[]) => void;
  onResolveOffKeepHours: (rowId: string) => void;
};

export type EditableField =
  | "tarih"
  | "kartGiris"
  | "kartCikis"
  | "esasCalismaGiris"
  | "esasCalismaCikis"
  | "kullanilanGiris"
  | "kullanilanCikis"
  | "izinTatilRaw";

const STATUS_META: Record<ControlStatus, { cls: string; label: string }> = {
  green: { cls: styles.dotGreen, label: "Tam veri" },
  yellow: { cls: styles.dotYellow, label: "Vardiyadan tamamlandı" },
  red: { cls: styles.dotRed, label: "Yetersiz" },
  blue: { cls: styles.dotBlue, label: "Düzeltildi" },
  purple: { cls: styles.dotPurple, label: "Fazla mesai karşılığı izin (OFF)" },
};

const RESOLVE_CODES: IzinKodKey[] = [
  "CALISTI",
  "HAFTA_TATILI",
  "IZIN",
  "YILLIK_IZIN",
  "RAPOR",
  "UBGT",
  "OFF",
  "CALISMADI",
];

export default function ReviewStep(props: Props) {
  const { groups, selectedKeys, visibleRows } = props;
  const allSelected = groups.length > 0 && selectedKeys.length === groups.length;
  const [filterOffConflicts, setFilterOffConflicts] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  const offConflictRows = useMemo(
    () => visibleRows.filter((r) => isOffConflictRow(r)),
    [visibleRows],
  );

  const displayRows = useMemo(
    () => (filterOffConflicts ? offConflictRows : visibleRows),
    [filterOffConflicts, offConflictRows, visibleRows],
  );

  const confirmBulkResolve = () => {
    props.onResolveOffKeepOff(offConflictRows.map((r) => r.id));
    setBulkModalOpen(false);
    setFilterOffConflicts(false);
  };

  return (
    <section className={`${styles.card} ${styles.stepPanel}`}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}><Users size={18} /> Verileri Kontrol Et</h2>
        <span className={styles.statusText}>
          {filterOffConflicts
            ? `${displayRows.length} çelişkili OFF kaydı`
            : `${visibleRows.length} kayıt gösteriliyor`}
        </span>
      </div>
      <p className={styles.cardHint}>
        Hücreleri doğrudan düzenleyebilirsiniz. Kırmızı kayıtlar çözülmeden hesaplamaya geçilemez.
      </p>

      {groups.length > 1 && (
        <div className={styles.chips} style={{ marginBottom: "0.9rem" }}>
          <button
            type="button"
            className={`${styles.chip} ${allSelected ? styles.chipActive : ""}`}
            onClick={props.onSelectAllPersonel}
          >
            Tümü <span className={styles.chipCount}>({groups.length})</span>
          </button>
          {groups.map((g) => (
            <button
              key={g.key}
              type="button"
              className={`${styles.chip} ${selectedKeys.includes(g.key) ? styles.chipActive : ""}`}
              onClick={() => props.onTogglePersonel(g.key)}
            >
              {g.label} <span className={styles.chipCount}>({g.rows.length})</span>
            </button>
          ))}
        </div>
      )}

      {props.unknownDescriptions.length > 0 && (
        <div className={styles.warnBox} style={{ flexDirection: "column", alignItems: "stretch" }}>
          <b>Tanınmayan açıklamalar</b>
          {props.unknownDescriptions.map((raw) => (
            <div key={raw} className={styles.codeRow}>
              <span className={styles.codeRaw}>{raw}</span>
              <select
                className={styles.select}
                defaultValue=""
                onChange={(e) => e.target.value && props.onResolveCode(raw, e.target.value as IzinKodKey)}
              >
                <option value="">Karşılığını seçin…</option>
                {RESOLVE_CODES.map((k) => (
                  <option key={k} value={k}>
                    {IZIN_KOD_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {props.redCount > 0 && (
        <div className={styles.warnBox} style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
          {props.redCount} kayıt hesaplama için yetersiz. Saat bilgilerini tamamlayın veya kaydı silin.
        </div>
      )}

      {props.offConflictCount > 0 && (
        <div className={`${styles.warnBox} ${styles.offConflictBox}`}>
          <p style={{ margin: 0 }}>
            {props.offConflictCount} OFF kaydı kart saatiyle çelişiyor. Saatleri temizleyin veya sınıflandırmayı değiştirin.
          </p>
          <div className={styles.offConflictActions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSm}`}
              onClick={() => setFilterOffConflicts((v) => !v)}
            >
              <Filter size={14} />
              {filterOffConflicts ? "Tüm Kayıtları Göster" : "Çelişkili OFF Kayıtlarını Göster"}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSm} ${styles.btnAccent}`}
              onClick={() => setBulkModalOpen(true)}
            >
              OFF&apos;u Esas Al ve Saatleri Temizle
            </button>
          </div>
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Kart giriş</th>
              <th>Kart çıkış</th>
              <th>Esas giriş</th>
              <th>Esas çıkış</th>
              <th>Kullanılan giriş</th>
              <th>Kullanılan çıkış</th>
              <th>Kaynak</th>
              <th>İzin/tatil</th>
              <th>Durum</th>
              <th>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r, index) => {
              const meta = STATUS_META[r.kontrolDurumu];
              const conflict = isOffConflictRow(r);
              return (
                <tr
                  key={r.id}
                  className={conflict ? styles.conflictRow : undefined}
                  style={{ animationDelay: `${Math.min(index, 20) * 25}ms` }}
                >
                  <td>
                    <input
                      type="date"
                      className={styles.cellInput}
                      value={/^\d{4}-\d{2}-\d{2}$/.test(r.tarih) ? r.tarih : ""}
                      onChange={(e) => props.onEditCell(r.id, "tarih", e.target.value)}
                    />
                  </td>
                  <td>
                    <input className={styles.cellInput} value={r.kartGiris}
                      onChange={(e) => props.onEditCell(r.id, "kartGiris", e.target.value)} />
                  </td>
                  <td>
                    <input className={styles.cellInput} value={r.kartCikis}
                      onChange={(e) => props.onEditCell(r.id, "kartCikis", e.target.value)} />
                  </td>
                  <td>
                    <input
                      className={styles.cellInput}
                      value={r.esasCalismaGiris}
                      title={r.esasCalismaAralikHam || undefined}
                      onChange={(e) => props.onEditCell(r.id, "esasCalismaGiris", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className={styles.cellInput}
                      value={r.esasCalismaCikis}
                      title={r.esasCalismaAralikHam || undefined}
                      onChange={(e) => props.onEditCell(r.id, "esasCalismaCikis", e.target.value)}
                    />
                  </td>
                  <td>
                    <input className={styles.cellInput} value={r.kullanilanGiris}
                      onChange={(e) => props.onEditCell(r.id, "kullanilanGiris", e.target.value)} />
                  </td>
                  <td>
                    <input className={styles.cellInput} value={r.kullanilanCikis}
                      onChange={(e) => props.onEditCell(r.id, "kullanilanCikis", e.target.value)} />
                  </td>
                  <td style={{ fontSize: "var(--fs-xs)", color: "var(--muted)" }}>
                    {r.girisKaynagi}/{r.cikisKaynagi}
                    {r.ertesiGunCikis ? " · +1g" : ""}
                    {r.esasCalismaAralikHam ? " · aralık" : ""}
                  </td>
                  <td>
                    <input className={styles.cellInput} value={r.izinTatilRaw}
                      placeholder={ensureDurumKodlari(r).map((k) => IZIN_KOD_LABELS[k]).join(" · ") || IZIN_KOD_LABELS[r.izinTatilKodu]}
                      onChange={(e) => props.onEditCell(r.id, "izinTatilRaw", e.target.value)} />
                    {ensureDurumKodlari(r).length > 1 && (
                      <div style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", marginTop: 2 }}>
                        {ensureDurumKodlari(r).map((k) => IZIN_KOD_LABELS[k]).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={styles.statusCell} title={r.durumNotlari.join(" ")}>
                      <span className={`${styles.dot} ${meta.cls}`} />
                      <span className={styles.statusText}>{meta.label}</span>
                    </span>
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      {conflict && (
                        <>
                          <button
                            type="button"
                            className={styles.rowActionBtn}
                            title="OFF'u esas al ve saatleri temizle"
                            onClick={() => props.onResolveOffKeepOff([r.id])}
                          >
                            OFF&apos;u esas al
                          </button>
                          <button
                            type="button"
                            className={`${styles.rowActionBtn} ${styles.rowActionAlt}`}
                            title="OFF sınıflandırmasını kaldır, saatleri çalışma olarak kullan"
                            onClick={() => props.onResolveOffKeepHours(r.id)}
                          >
                            Saatleri esas al
                          </button>
                        </>
                      )}
                      <button type="button" className={styles.iconBtn} title="Satırı sil"
                        onClick={() => props.onDeleteRow(r.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {displayRows.length === 0 && (
              <tr>
                <td colSpan={11} className={styles.empty}>
                  {filterOffConflicts ? "Çelişkili OFF kaydı yok." : "Gösterilecek kayıt yok. Personel seçin."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: "0.75rem" }}>
        <button type="button" className={styles.btn} onClick={props.onAddRow}>
          <Plus size={14} /> Satır ekle
        </button>
      </div>

      <PuantajPortalModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        labelledBy="off-bulk-title"
      >
        <h3 id="off-bulk-title" className={styles.modalTitle}>OFF&apos;u Esas Al</h3>
        <p className={styles.modalBody}>
          <strong>{offConflictRows.length}</strong> kayıtta kart/esas saatleri temizlenecek ve gün
          &ldquo;Fazla mesai karşılığı izin (OFF)&rdquo; olarak onaya hazır hale getirilecek.
          OFF mahsup sayımı korunur; çalışma süreleri 0 olur.
        </p>
        <ul className={styles.modalList}>
          {offConflictRows.slice(0, 8).map((r) => (
            <li key={r.id}>
              {r.personelAdSoyad || "—"} · {formatIsoDateTR(r.tarih)} · {r.izinTatilRaw || "OFF"}
            </li>
          ))}
          {offConflictRows.length > 8 && (
            <li>… ve {offConflictRows.length - 8} kayıt daha</li>
          )}
        </ul>
        <div className={styles.modalActions}>
          <button type="button" className={styles.btn} onClick={() => setBulkModalOpen(false)}>
            Vazgeç
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnAccent}`} onClick={confirmBulkResolve}>
            Onayla ve Temizle
          </button>
        </div>
      </PuantajPortalModal>
    </section>
  );
}
