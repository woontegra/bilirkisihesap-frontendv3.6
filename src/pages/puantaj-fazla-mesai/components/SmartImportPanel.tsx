import { useState } from "react";
import { Sparkles, Eye, List, Save, Trash2 } from "lucide-react";
import type { SmartImportAnalysis } from "../smart-import-v2/types";
import type { SmartImportMappingTemplate } from "../smart-import-v2/smartTemplateStore";
import {
  LAYOUT_SECTION_COLUMN_LABEL,
  LAYOUT_SECTION_COUNT_LABEL,
  layoutSectionOrdinal,
} from "../smart-import-v2/userLabels";
import styles from "../PuantajFmPage.module.css";

type Props = {
  analysis: SmartImportAnalysis;
  mode: "panel" | "review";
  analyzing?: boolean;
  progress?: number;
  templates?: SmartImportMappingTemplate[];
  onUseSmart: () => void;
  onReview: () => void;
  onClassic: () => void;
  onBackToPanel?: () => void;
  onSaveTemplate?: (name: string) => void;
  onApplyTemplate?: (id: string) => void;
  onDeleteTemplate?: (id: string) => void;
};

function tierLabel(tier: string): string {
  if (tier === "auto") return "Otomatik";
  if (tier === "review") return "Kontrol edin";
  return "Düşük güven";
}

function tierClass(tier: string): string {
  if (tier === "auto") return styles.smartTierAuto;
  if (tier === "review") return styles.smartTierReview;
  return styles.smartTierLow;
}

export default function SmartImportPanel(props: Props) {
  const { analysis, mode, analyzing, progress = 0 } = props;
  const [tplName, setTplName] = useState("");
  if (!analysis.ok) return null;

  const templateBar =
    props.onSaveTemplate && props.onApplyTemplate ? (
      <div className={styles.templateBar} style={{ marginTop: "0.65rem" }}>
        <select
          className={styles.select}
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) props.onApplyTemplate?.(e.target.value);
          }}
        >
          <option value="">Kayıtlı akıllı şablonu uygula…</option>
          {(props.templates ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input
          className={styles.input}
          placeholder="Bu eşleştirmeyi şablon olarak kaydet"
          value={tplName}
          onChange={(e) => setTplName(e.target.value)}
        />
        <button
          type="button"
          className={styles.btn}
          disabled={!tplName.trim()}
          onClick={() => {
            props.onSaveTemplate?.(tplName.trim());
            setTplName("");
          }}
        >
          <Save size={14} /> Kaydet
        </button>
        {(props.templates ?? []).map((t) => (
          <button
            key={t.id}
            type="button"
            className={styles.iconBtn}
            title="Şablonu sil"
            onClick={() => props.onDeleteTemplate?.(t.id)}
          >
            <Trash2 size={14} />
          </button>
        ))}
      </div>
    ) : null;

  if (mode === "review") {
    return (
      <section className={styles.smartImportPanel}>
        <div className={styles.smartImportHead}>
          <h3 className={styles.smartImportTitle}>
            <Sparkles size={16} /> Akıllı eşleştirme önerisi — inceleme
          </h3>
          {props.onBackToPanel && (
            <button type="button" className={styles.btn} onClick={props.onBackToPanel}>
              Panele dön
            </button>
          )}
        </div>
        <div className={styles.smartProposalTable}>
          <div className={styles.smartProposalHeader}>
            <span>Örnek</span>
            <span>Standart alan</span>
            <span>Kaynak</span>
            <span>{LAYOUT_SECTION_COLUMN_LABEL}</span>
            <span>Güven</span>
            <span>Gerekçe</span>
          </div>
          {analysis.proposals
            .filter((p) => p.targetField || p.sampleValue)
            .map((p) => (
              <div key={`${p.segmentIndex}-${p.logicalColumnIndex}-${p.physicalColumns}`} className={styles.smartProposalRow}>
                <span className={styles.smartSample}>{p.sampleValue || "—"}</span>
                <span>
                  {p.targetLabel}
                  <small className={styles.smartHeaderHint}>{p.headerText}</small>
                </span>
                <span>{p.physicalColumns}</span>
                <span>{layoutSectionOrdinal(p.segmentIndex)}</span>
                <span className={tierClass(p.tier)}>
                  {p.confidence}% · {tierLabel(p.tier)}
                </span>
                <span className={styles.smartReason}>{p.reasons.join(", ") || "—"}</span>
              </div>
            ))}
        </div>
        {templateBar}
        <div className={styles.smartImportActions}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={props.onUseSmart}>
            <Sparkles size={14} /> Akıllı öneriyi kullan
          </button>
          <button type="button" className={styles.btn} onClick={props.onClassic}>
            <List size={14} /> Klasik manuel eşleştirme
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.smartImportPanel}>
      <div className={styles.smartImportHead}>
        <h3 className={styles.smartImportTitle}>
          <Sparkles size={16} /> Akıllı eşleştirme önerisi bulundu
        </h3>
        {analyzing && <span className={styles.smartProgress}>Analiz… %{progress}</span>}
      </div>
      <div className={styles.smartImportStats}>
        <div className={styles.smartStat}>
          <span className={styles.smartStatLabel}>Başlık satırı</span>
          <span className={styles.smartStatValue}>{analysis.headerRowIndex + 1}</span>
        </div>
        <div className={styles.smartStat}>
          <span className={styles.smartStatLabel}>{LAYOUT_SECTION_COUNT_LABEL}</span>
          <span className={styles.smartStatValue}>{analysis.segmentCount}</span>
        </div>
        <div className={styles.smartStat}>
          <span className={styles.smartStatLabel}>Veri satırı</span>
          <span className={styles.smartStatValue}>{analysis.dataRowCount}</span>
        </div>
        <div className={styles.smartStat}>
          <span className={styles.smartStatLabel}>Otomatik eşleşen</span>
          <span className={`${styles.smartStatValue} ${styles.smartTierAuto}`}>{analysis.stats.autoMatched}</span>
        </div>
        <div className={styles.smartStat}>
          <span className={styles.smartStatLabel}>Kontrol gerektiren</span>
          <span className={`${styles.smartStatValue} ${styles.smartTierReview}`}>{analysis.stats.needsReview}</span>
        </div>
        <div className={styles.smartStat}>
          <span className={styles.smartStatLabel}>Düşük güvenli</span>
          <span className={`${styles.smartStatValue} ${styles.smartTierLow}`}>{analysis.stats.lowConfidence}</span>
        </div>
      </div>
      {templateBar}
      <div className={styles.smartImportActions}>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={props.onUseSmart}>
          <Sparkles size={14} /> Akıllı öneriyi kullan
        </button>
        <button type="button" className={styles.btn} onClick={props.onReview}>
          <Eye size={14} /> Öneriyi incele
        </button>
        <button type="button" className={styles.btn} onClick={props.onClassic}>
          <List size={14} /> Klasik manuel eşleştirme
        </button>
      </div>
    </section>
  );
}
