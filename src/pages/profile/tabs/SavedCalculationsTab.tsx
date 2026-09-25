import {
  CheckSquare,
  Copy,
  Download,
  Edit,
  FileText,
  Search,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { exportBackup, importBackup } from "@/api/backups";
import {
  createSavedCase,
  deleteSavedCase,
  getSavedCase,
  listSavedCases,
  updateSavedCase,
  type SavedCaseRecord,
} from "@/api/savedCases";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import { buildCaseOpenUrl, getCaseRouteInfo } from "../caseRoutes";
import { getCaseEndDate, getCaseStartDate } from "../savedCaseDates";
import styles from "./profileTabShared.module.css";

type SavedCaseRow = {
  id: number;
  hesaplama_tipi: string;
  kayit_adi: string | null;
  ise_giris: string | null;
  isten_cikis: string | null;
  net_toplam: number | null;
  created_at: string | null;
};

const moneyFmt = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function mapItem(item: SavedCaseRecord): SavedCaseRow {
  let pd: Record<string, unknown> = {};
  if (item.data) {
    if (typeof item.data === "string") {
      try {
        pd = JSON.parse(item.data) as Record<string, unknown>;
      } catch {
        pd = {};
      }
    } else if (typeof item.data === "object") {
      pd = item.data as Record<string, unknown>;
    }
  }
  const inner =
    pd.data && typeof pd.data === "object" && !Array.isArray(pd.data)
      ? (pd.data as Record<string, unknown>)
      : pd;
  const results =
    inner.results && typeof inner.results === "object"
      ? (inner.results as Record<string, unknown>)
      : pd.results && typeof pd.results === "object"
        ? (pd.results as Record<string, unknown>)
        : null;

  const net =
    (typeof results?.net === "number" ? results.net : null) ??
    (typeof pd.net_total === "number" ? pd.net_total : null) ??
    (typeof inner.net_total === "number" ? inner.net_total : null) ??
    (typeof item.net_total === "number" ? item.net_total : null);

  return {
    id: item.id,
    hesaplama_tipi: (item.type || item.hesaplama_tipi || "").toLowerCase(),
    kayit_adi: item.name || item.kayit_adi || null,
    ise_giris: getCaseStartDate(item),
    isten_cikis: getCaseEndDate(item),
    net_toplam: net,
    created_at: item.createdAt || item.created_at || null,
  };
}

function fmtDate(s?: string | null) {
  if (!s) return "-";
  try {
    return new Date(s).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "-";
  }
}

type ConfirmState =
  | { kind: "single"; id: number }
  | { kind: "selected" }
  | { kind: "all" }
  | null;

export default function SavedCalculationsTab() {
  const toast = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<SavedCaseRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [editingNameId, setEditingNameId] = useState<number | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [savingNameId, setSavingNameId] = useState<number | null>(null);
  const [copyingId, setCopyingId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [unsupportedMsg, setUnsupportedMsg] = useState<string | null>(null);

  const loadCases = async () => {
    try {
      setLoading(true);
      const data = await listSavedCases();
      setCases(data.map(mapItem));
    } catch {
      toast.error("Hesaplamalar yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCases();
  }, []);

  const filteredCases = useMemo(() => {
    if (!searchQuery.trim()) return cases;
    const q = searchQuery.toLowerCase().trim();
    return cases.filter(
      (c) =>
        (c.kayit_adi || "").toLowerCase().includes(q) ||
        (c.hesaplama_tipi || "").includes(q) ||
        fmtDate(c.ise_giris).includes(q) ||
        fmtDate(c.isten_cikis).includes(q) ||
        (c.net_toplam?.toString() || "").includes(q),
    );
  }, [cases, searchQuery]);

  const handleExportBackup = async () => {
    if (cases.length === 0) {
      toast.error("Yedeklenecek hesaplama bulunamadı");
      return;
    }
    try {
      setIsExporting(true);
      const { blob, filename } = await exportBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Yedek başarıyla oluşturuldu ve indirildi");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Yedek oluşturulurken hata oluştu");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportBackup = async (file: File) => {
    if (!file.name.endsWith(".bhbackup")) {
      toast.error("Geçersiz dosya. Sadece .bhbackup dosyaları yüklenebilir.");
      return;
    }
    try {
      setIsImporting(true);
      const result = await importBackup(file);
      toast.success(result.message || "Yedek başarıyla geri yüklendi");
      await loadCases();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Geri yüklenirken hata oluştu");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const runDelete = async () => {
    if (!confirm) return;
    setIsDeleting(true);
    try {
      if (confirm.kind === "single") {
        await deleteSavedCase(confirm.id);
        setCases((p) => p.filter((c) => c.id !== confirm.id));
        setSelectedIds((p) => p.filter((id) => id !== confirm.id));
        toast.success("Hesaplama silindi");
      } else if (confirm.kind === "selected") {
        let ok = 0;
        let fail = 0;
        for (const id of selectedIds) {
          try {
            await deleteSavedCase(id);
            ok++;
            setCases((p) => p.filter((c) => c.id !== id));
          } catch {
            fail++;
          }
        }
        setSelectedIds([]);
        if (ok > 0) toast.success(`${ok} hesaplama silindi`);
        if (fail > 0) toast.error(`${fail} hesaplama silinemedi`);
      } else {
        let ok = 0;
        let fail = 0;
        for (const c of filteredCases) {
          try {
            await deleteSavedCase(c.id);
            ok++;
            setCases((p) => p.filter((x) => x.id !== c.id));
          } catch {
            fail++;
          }
        }
        setSelectedIds([]);
        if (ok > 0) toast.success(`${ok} hesaplama silindi`);
        if (fail > 0) toast.error(`${fail} hesaplama silinemedi`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Silme başarısız");
    } finally {
      setIsDeleting(false);
      setConfirm(null);
    }
  };

  const handleCopy = async (c: SavedCaseRow) => {
    setCopyingId(c.id);
    try {
      const item = await getSavedCase(c.id);
      const name = (item.name || c.kayit_adi || "Kopya").trim();
      const copyName = name.startsWith("Kopya") ? `${name} (2)` : `Kopya - ${name}`;
      await createSavedCase({
        name: copyName,
        type: item.type || c.hesaplama_tipi,
        data: item.data,
      });
      toast.success("Hesaplama kopyalandı");
      await loadCases();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kopyalama başarısız");
    } finally {
      setCopyingId(null);
    }
  };

  const handleSaveName = async (id: number, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setEditingNameId(null);
      return;
    }
    setSavingNameId(id);
    try {
      const item = await getSavedCase(id);
      await updateSavedCase(id, {
        name: trimmed,
        type: item.type || "",
        data: item.data,
      });
      setCases((prev) => prev.map((c) => (c.id === id ? { ...c, kayit_adi: trimmed } : c)));
      toast.success("Kayıt adı güncellendi");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kayıt adı güncellenemedi");
    } finally {
      setSavingNameId(null);
      setEditingNameId(null);
    }
  };

  const handleOpen = (c: SavedCaseRow) => {
    const info = getCaseRouteInfo(c.hesaplama_tipi);
    if (!info.supported) {
      setUnsupportedMsg("Bu hesaplama türü henüz V3.5'e aktarılmadı");
      return;
    }
    navigate(buildCaseOpenUrl(c.hesaplama_tipi, c.id));
  };

  const toggleSelectId = (id: number) =>
    setSelectedIds((p) => (p.includes(id) ? p.filter((s) => s !== id) : [...p, id]));

  const toggleSelectAll = () =>
    setSelectedIds(
      selectedIds.length === filteredCases.length ? [] : filteredCases.map((c) => c.id),
    );

  if (loading) {
    return (
      <div className={styles.panel}>
        <p className={styles.muted}>Yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      <section className={styles.panel}>
        <div className={styles.rowBetween}>
          <div>
            <h3 className={styles.panelTitle}>Kaydedilen Hesaplamalar</h3>
            <p className={styles.panelDesc} style={{ marginBottom: 0 }}>
              Daha önce kaydettiğiniz hesaplamaları görüntüleyin ve yönetin
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            <Button
              variant="soft"
              size="sm"
              disabled={isExporting || cases.length === 0}
              onClick={() => void handleExportBackup()}
            >
              <Download size={14} aria-hidden />
              {isExporting ? "Yedekleniyor..." : "Yedekle"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".bhbackup"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImportBackup(f);
              }}
            />
            <Button
              variant="soft"
              size="sm"
              disabled={isImporting}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} aria-hidden />
              {isImporting ? "Geri Yükleniyor..." : "Geri Yükle"}
            </Button>
          </div>
        </div>

        <div className={styles.infoBanner} style={{ marginTop: "0.85rem" }}>
          <FileText size={14} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
          <span>
            Yedek dosyaları yalnızca bu uygulama ile geri yüklenebilir. Kişiye özeldir, başka
            kullanıcılar tarafından kullanılamaz.
          </span>
        </div>

        <div className={styles.toolbar} style={{ marginTop: "0.85rem" }}>
          <div className={styles.searchWrap}>
            <Search size={15} className={styles.searchIcon} aria-hidden />
            <input
              placeholder="Kayıt adı, tip, tarih veya tutar ile ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery ? (
              <button
                type="button"
                className={styles.clearSearch}
                aria-label="Aramayı temizle"
                onClick={() => setSearchQuery("")}
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
          {selectedIds.length > 0 ? (
            <Button
              variant="danger"
              size="sm"
              disabled={isDeleting}
              onClick={() => setConfirm({ kind: "selected" })}
            >
              <Trash2 size={14} aria-hidden /> Seçilenleri Sil ({selectedIds.length})
            </Button>
          ) : null}
          {filteredCases.length > 0 ? (
            <Button
              variant="soft"
              size="sm"
              disabled={isDeleting}
              onClick={() => setConfirm({ kind: "all" })}
            >
              <Trash2 size={14} aria-hidden /> Tümünü Sil
            </Button>
          ) : null}
        </div>

        {unsupportedMsg ? (
          <p className={styles.warn} role="status">
            {unsupportedMsg}
            <button
              type="button"
              style={{ marginLeft: "0.5rem", border: 0, background: "transparent", cursor: "pointer" }}
              onClick={() => setUnsupportedMsg(null)}
            >
              Kapat
            </button>
          </p>
        ) : null}

        {filteredCases.length === 0 ? (
          <div className={styles.empty}>
            {searchQuery ? <Search size={28} aria-hidden /> : <FileText size={28} aria-hidden />}
            <strong>
              {searchQuery ? "Sonuç bulunamadı" : "Henüz kayıtlı hesaplama yok"}
            </strong>
            {!searchQuery ? (
              <span>Hesaplama yaptığınızda sonuçları burada saklayabilirsiniz</span>
            ) : null}
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      aria-label="Tümünü seç"
                      style={{ border: 0, background: "transparent", cursor: "pointer" }}
                    >
                      {selectedIds.length === filteredCases.length && filteredCases.length > 0 ? (
                        <CheckSquare size={16} />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                  </th>
                  <th>#</th>
                  <th>Kayıt Adı</th>
                  <th>Tür</th>
                  <th>Tarih</th>
                  <th>Başlangıç</th>
                  <th>Bitiş</th>
                  <th>Net Toplam</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.map((c, idx) => {
                  const isSelected = selectedIds.includes(c.id);
                  const routeInfo = getCaseRouteInfo(c.hesaplama_tipi);
                  return (
                    <tr key={c.id}>
                      <td>
                        <button
                          type="button"
                          onClick={() => toggleSelectId(c.id)}
                          aria-label="Seç"
                          style={{ border: 0, background: "transparent", cursor: "pointer" }}
                        >
                          {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      </td>
                      <td>{idx + 1}</td>
                      <td>
                        {editingNameId === c.id ? (
                          <input
                            value={editingNameValue}
                            onChange={(e) => setEditingNameValue(e.target.value)}
                            onBlur={() => void handleSaveName(c.id, editingNameValue)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleSaveName(c.id, editingNameValue);
                              if (e.key === "Escape") {
                                setEditingNameId(null);
                                setEditingNameValue("");
                              }
                            }}
                            autoFocus
                            disabled={savingNameId === c.id}
                            style={{
                              width: "100%",
                              minHeight: "1.85rem",
                              padding: "0.25rem 0.4rem",
                              border: "1px solid var(--border)",
                              borderRadius: "var(--radius-sm)",
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            style={{
                              border: 0,
                              background: "transparent",
                              cursor: "pointer",
                              textAlign: "left",
                              fontWeight: 550,
                              color: "var(--text-strong)",
                              maxWidth: "12rem",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={c.kayit_adi || undefined}
                            onClick={() => {
                              setEditingNameId(c.id);
                              setEditingNameValue((c.kayit_adi || "").trim());
                            }}
                          >
                            {savingNameId === c.id ? "Kaydediliyor..." : c.kayit_adi || "—"}
                          </button>
                        )}
                      </td>
                      <td>
                        <span title={routeInfo.label}>
                          {routeInfo.label}
                          {!routeInfo.supported ? (
                            <span className={styles.unsupported}> (yakında)</span>
                          ) : null}
                        </span>
                      </td>
                      <td>{fmtDate(c.created_at)}</td>
                      <td>{fmtDate(c.ise_giris)}</td>
                      <td>{fmtDate(c.isten_cikis)}</td>
                      <td style={{ fontWeight: 600 }}>
                        {c.net_toplam != null ? moneyFmt.format(Number(c.net_toplam)) : "-"}
                      </td>
                      <td>
                        <div className={styles.iconActions}>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Aç"
                            aria-label="Aç"
                            onClick={() => handleOpen(c)}
                          >
                            <Edit size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Kopyala"
                            aria-label="Kopyala"
                            disabled={copyingId === c.id}
                            onClick={() => void handleCopy(c)}
                          >
                            <Copy size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Sil"
                            aria-label="Sil"
                            onClick={() => setConfirm({ kind: "single", id: c.id })}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirm != null}
        title="Hesaplamayı sil"
        description={
          confirm?.kind === "all"
            ? `Tüm hesaplamalar (${filteredCases.length} adet) silinecek. Bu işlem geri alınamaz!`
            : confirm?.kind === "selected"
              ? `${selectedIds.length} hesaplama silinecek. Emin misiniz?`
              : "Bu hesaplamayı silmek istediğinize emin misiniz?"
        }
        confirmLabel="Sil"
        danger
        loading={isDeleting}
        onConfirm={() => void runDelete()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
