import { useMemo, useState } from "react";
import { ArrowRight, Copy, Save, Sparkles, Trash2 } from "lucide-react";
import { MAPPABLE_FIELDS } from "../fieldCatalog";
import type { ColumnMapping, MappableFieldKey, MappingMode, PuantajTemplate, TableView } from "../model";
import type { SmartImportAnalysis } from "../smart-import-v2/types";
import type { SmartImportMappingTemplate } from "../smart-import-v2/smartTemplateStore";
import { logicalGroupsFromHeaders } from "../detect";
import { readLogicalCell } from "../smart-import-v2/groupLogicalColumns";
import SmartImportPanel from "./SmartImportPanel";
import styles from "../PuantajFmPage.module.css";

type Props = {
  table: TableView;
  mappings: ColumnMapping[];
  templates: PuantajTemplate[];
  onMappingChange: (columnIndex: number, next: Partial<ColumnMapping>) => void;
  onApplyTemplate: (id: string) => void;
  onSaveTemplate: (name: string) => void;
  onDeleteTemplate: (id: string) => void;
  onDuplicateTemplate: (id: string) => void;
  smartAnalysis?: SmartImportAnalysis | null;
  smartUiMode?: "panel" | "review" | "hidden";
  smartWarning?: string | null;
  smartApplied?: boolean;
  smartAnalyzing?: boolean;
  smartProgress?: number;
  smartTemplates?: SmartImportMappingTemplate[];
  onSmartUse?: () => void;
  onSmartReview?: () => void;
  onSmartClassic?: () => void;
  onSmartBackToPanel?: () => void;
  onSaveSmartTemplate?: (name: string) => void;
  onApplySmartTemplate?: (id: string) => void;
  onDeleteSmartTemplate?: (id: string) => void;
  mappingCoverageMissing?: string[];
};

const MODE_OPTIONS: { value: string; label: string }[] = [
  { value: "absent", label: "— Bu belgede yok —" },
  { value: "exclude", label: "— Hesaplamaya dahil etme —" },
  { value: "constant", label: "— Sabit değer kullan —" },
  { value: "derive", label: "— Başka alandan türet —" },
  { value: "review", label: "— Kullanıcı kontrolüne bırak —" },
];

function encode(m: ColumnMapping): string {
  if (m.mode === "field" && m.field) return `field:${m.field}`;
  return m.mode;
}

export default function MappingStep(props: Props) {
  const { table, mappings } = props;
  const [tplName, setTplName] = useState("");

  const samples = useMemo(() => {
    const groups = logicalGroupsFromHeaders(table.headers);
    return mappings.map((m) => {
      const group = groups.find((g) => g.physicalIndices[0] === m.columnIndex);
      const found = table.rows.find((r) =>
        (group?.physicalIndices ?? [m.columnIndex]).some((ci) => (r[ci] ?? "").trim() !== ""),
      );
      if (!found) return "";
      if (group && group.physicalIndices.length > 1) return readLogicalCell(found, group);
      return found[m.columnIndex] ?? "";
    });
  }, [table, mappings]);

  const handleSelect = (m: ColumnMapping, raw: string) => {
    if (raw.startsWith("field:")) {
      props.onMappingChange(m.columnIndex, {
        mode: "field",
        field: raw.slice(6) as MappableFieldKey,
        autoGuessed: false,
      });
    } else {
      props.onMappingChange(m.columnIndex, { mode: raw as MappingMode, field: undefined, autoGuessed: false });
    }
  };

  return (
    <section className={`${styles.card} ${styles.stepPanel}`}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>Alanları Eşleştir</h2>
      </div>
      <p className={styles.cardHint}>
        Solda belgedeki sütun, sağda standart alan. Sistem tahmin eder; hesaplamaya geçmeden önce onaylayın.
      </p>

      {props.mappingCoverageMissing && props.mappingCoverageMissing.length > 0 && (
        <p className={styles.warnBox} role="status">
          Eşleşme için yetersiz veri: {props.mappingCoverageMissing.join(", ")} alan(ları) eşlenmedi.
        </p>
      )}

      {props.smartWarning && (
        <p className={styles.smartImportWarning} role="status">
          {props.smartWarning}
        </p>
      )}

      {props.smartAnalysis?.ok && props.smartUiMode !== "hidden" && props.onSmartUse && props.onSmartReview && props.onSmartClassic && (
        <SmartImportPanel
          analysis={props.smartAnalysis}
          mode={props.smartUiMode === "review" ? "review" : "panel"}
          analyzing={props.smartAnalyzing}
          progress={props.smartProgress}
          templates={props.smartTemplates ?? []}
          onUseSmart={props.onSmartUse}
          onReview={props.onSmartReview}
          onClassic={props.onSmartClassic}
          onBackToPanel={props.onSmartBackToPanel}
          onSaveTemplate={props.onSaveSmartTemplate}
          onApplyTemplate={props.onApplySmartTemplate}
          onDeleteTemplate={props.onDeleteSmartTemplate}
        />
      )}

      {props.smartApplied && (
        <p className={styles.smartAppliedBadge}>
          <Sparkles size={12} /> Akıllı öneri seçildi — &quot;Verileri Kontrol Et&quot; adımında uygulanacak.
        </p>
      )}

      {/* Şablon çubuğu */}
      <div className={styles.templateBar}>
        <select
          className={styles.select}
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) props.onApplyTemplate(e.target.value);
          }}
        >
          <option value="">Kayıtlı şablon uygula…</option>
          {props.templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} (v{t.version})
            </option>
          ))}
        </select>
        <input
          className={styles.input}
          placeholder="Yeni şablon adı"
          value={tplName}
          onChange={(e) => setTplName(e.target.value)}
        />
        <button
          type="button"
          className={styles.btn}
          disabled={!tplName.trim()}
          onClick={() => {
            props.onSaveTemplate(tplName.trim());
            setTplName("");
          }}
        >
          <Save size={14} /> Şablonu kaydet
        </button>
        {props.templates.length > 0 && (
          <>
            <button type="button" className={styles.iconBtn} title="Seçili şablonu kopyala"
              onClick={() => props.templates[0] && props.onDuplicateTemplate(props.templates[0].id)}>
              <Copy size={14} />
            </button>
          </>
        )}
      </div>

      <div className={styles.mapList} style={{ marginTop: "0.9rem" }}>
        {mappings.map((m, index) => (
          <div
            key={m.columnIndex}
            className={`${styles.mapRow} ${m.autoGuessed ? styles.mapRowAuto : ""}`}
            style={{ animationDelay: `${index * 45}ms` }}
          >
            <div className={styles.mapHeader}>
              <span className={styles.mapHeaderName}>{m.header}</span>
              <span className={styles.mapSample}>Örnek: {samples[index] || "—"}</span>
            </div>
            <ArrowRight size={16} className={styles.mapArrow} aria-hidden />
            <div className={styles.mapControls}>
              <select className={styles.select} value={encode(m)} onChange={(e) => handleSelect(m, e.target.value)}>
                <optgroup label="Standart alan">
                  {MAPPABLE_FIELDS.map((f) => (
                    <option key={f.key} value={`field:${f.key}`}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Diğer">
                  {MODE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              </select>

              {m.autoGuessed && (
                <span className={styles.autoBadge}>
                  <Sparkles size={11} /> Otomatik tahmin
                </span>
              )}

              {m.mode === "constant" && (
                <input
                  className={styles.input}
                  placeholder="Sabit değer"
                  value={m.constantValue ?? ""}
                  onChange={(e) => props.onMappingChange(m.columnIndex, { constantValue: e.target.value })}
                />
              )}

              {m.mode === "derive" && (
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  <select
                    className={styles.select}
                    value={m.deriveFromColumn ?? m.columnIndex}
                    onChange={(e) => props.onMappingChange(m.columnIndex, { deriveFromColumn: Number(e.target.value) })}
                  >
                    {mappings.map((col) => (
                      <option key={col.columnIndex} value={col.columnIndex}>
                        {col.header}
                      </option>
                    ))}
                  </select>
                  <select
                    className={styles.select}
                    value={m.deriveRule ?? "copy"}
                    onChange={(e) =>
                      props.onMappingChange(m.columnIndex, { deriveRule: e.target.value as ColumnMapping["deriveRule"] })
                    }
                  >
                    <option value="copy">Olduğu gibi</option>
                    <option value="rangeStart">Aralıktan giriş (08:00-17:00 → 08:00)</option>
                    <option value="rangeEnd">Aralıktan çıkış (08:00-17:00 → 17:00)</option>
                  </select>
                </div>
              )}

              {m.mode === "field" && m.field && (
                <MappingFieldTarget field={m.field} />
              )}
            </div>
          </div>
        ))}
      </div>

      {props.templates.length > 0 && (
        <div className={styles.mapList} style={{ marginTop: "0.9rem" }}>
          {props.templates.map((t) => (
            <div key={t.id} className={styles.codeRow}>
              <span className={styles.codeRaw}>{t.name}</span>
              <span className={styles.statusText}>v{t.version}</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: "0.4rem" }}>
                <button type="button" className={styles.iconBtn} title="Kopyala" onClick={() => props.onDuplicateTemplate(t.id)}>
                  <Copy size={14} />
                </button>
                <button type="button" className={styles.iconBtn} title="Sil" onClick={() => props.onDeleteTemplate(t.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MappingFieldTarget({ field }: { field: MappableFieldKey }) {
  const def = MAPPABLE_FIELDS.find((f) => f.key === field);
  if (!def?.hint) return null;
  return <span className={styles.mapSample}>{def.hint}</span>;
}
