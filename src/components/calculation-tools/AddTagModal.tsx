import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import styles from "./calculationTools.module.css";

const PRESET_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
  "#78716c",
];

type Props = {
  open: boolean;
  onClose: () => void;
  onAdd: (color: string, label: string) => void;
};

export function AddTagModal({ open, onClose, onAdd }: Props) {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[5]);

  if (!open) return null;

  const handleAdd = () => {
    if (!label.trim()) return;
    onAdd(color, label.trim());
    setLabel("");
    setColor(PRESET_COLORS[5]);
    onClose();
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="presentation">
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Kategori Etiketi Ekle</h3>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Kapat">
            <X size={16} />
          </button>
        </div>
        <div className={styles.modalBody}>
          <div>
            <label className={styles.modalLabel} htmlFor="tag-label">
              Etiket adı
            </label>
            <input
              id="tag-label"
              className={styles.modalInput}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="ör: Acil, Revize gerekli…"
              autoFocus
            />
          </div>
          <div>
            <span className={styles.modalLabel}>Renk</span>
            <div className={styles.colorGrid}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={color === c ? styles.colorBtnActive : styles.colorBtn}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          {label.trim() ? (
            <span className={styles.tagChip} style={{ backgroundColor: color, width: "fit-content" }}>
              {label}
            </span>
          ) : null}
        </div>
        <div className={styles.modalFooter}>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            İptal
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={handleAdd} disabled={!label.trim()}>
            Ekle
          </Button>
        </div>
      </div>
    </div>
  );
}
