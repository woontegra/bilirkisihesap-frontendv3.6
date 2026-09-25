import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BriefcaseBusiness,
  Calculator,
  CirclePlay,
  Eye,
  FilePlus2,
  FolderOpen,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { ApiError } from "@/api/client";
import { getSavedCase } from "@/api/savedCases";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { DraftDateInput, DraftTextInput } from "@/components/form";
import { GuidedTourHost, useGuidedTourController } from "@/components/guided-tour";
import tourStyles from "@/components/guided-tour/GuidedTour.module.css";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import { useCalculationCaseBinding } from "@/hooks/useCalculationCaseBinding";
import { useDeferredFormMemo } from "@/hooks/useDeferredFormMemo";
import {
  IS_ARAMA_IZNI_TOUR,
  IS_ARAMA_IZNI_TOUR_WELCOME_BODY,
  IS_ARAMA_IZNI_TOUR_WELCOME_TITLE,
} from "./guidedTour";
import {
  buildIsAramaIzniSaveResult,
  isAramaIzniCaseCrud,
  listIsAramaIzniCasesFromBackend,
  mapIsAramaFormFromBackend,
  resolveSavedCaseDisplayName,
} from "./backendCase";
import {
  calculateWorkDays,
  clampYear,
  computeIsArama,
  formatDateTR,
  formatMoney,
  getGunlukCalismaSaati,
  isDateOrderInvalid,
  parseNum,
} from "./engine";
import { createEmptyForm, newLocalId, NOTE_BLOCKS, snapshotKey, type IsAramaForm, type SavedCase } from "./model";
import { clearCorruptCases, deleteCase } from "./storage";
import styles from "./IsAramaIzniUcretiPage.module.css";

const PAGE_TITLE = "İş Arama İzni Ücreti";
const PREVIEW_TITLE = "İş Arama İzni Ücreti Rapor";

function FlashValue({ value, className }: { value: string; className?: string }) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), 450);
      return () => window.clearTimeout(t);
    }
  }, [value]);
  return (
    <span className={`${className ?? ""} ${flash ? styles.valueFlash : ""}`.trim()}>{value}</span>
  );
}

function AnimatedMoney({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const from = display;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const dur = 380;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animate from last displayed
  }, [value, reduce]);

  return <>{formatMoney(display)}</>;
}

function NameModal({
  open,
  initial,
  onClose,
  onConfirm,
}: {
  open: boolean;
  initial: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  if (!open) return null;
  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalCard}>
        <h3 className={styles.modalTitle}>Kaydı adlandır</h3>
        <label className={styles.label} htmlFor="ia-save-name">
          Kayıt adı
        </label>
        <input
          id="ia-save-name"
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onConfirm(name.trim());
          }}
        />
        <div className={styles.modalActions}>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!name.trim()}
            onClick={() => onConfirm(name.trim())}
          >
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function IsAramaIzniUcretiPage() {
  const { success, error: showError, info: toastInfo } = useToast();
  const tour = useGuidedTourController();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");
  const backendLoadedCaseIdRef = useRef<string | null>(null);
  const [form, setForm] = useState<IsAramaForm>(createEmptyForm);
  const [dateError, setDateError] = useState<string | null>(null);
  const [cases, setCases] = useState<SavedCase[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  useCalculationCaseBinding(activeId);
  const [baseline, setBaseline] = useState(() => snapshotKey(createEmptyForm()));
  const [nameOpen, setNameOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [caseSaving, setCaseSaving] = useState(false);

  const setCaseIdParam = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("caseId", id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const result = useDeferredFormMemo(form, computeIsArama);
  const dirty = snapshotKey(form) !== baseline;
  const haftalikGunNum = Number(form.haftalikCalismaGunu) || 5;

  const reloadCases = useCallback(async () => {
    try {
      const items = await listIsAramaIzniCasesFromBackend();
      setStorageError(null);
      setCases(items);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Kayıtlar yüklenemedi";
      setStorageError(message);
      setCases([]);
    }
  }, []);

  useEffect(() => {
    reloadCases();
  }, [reloadCases]);

  useEffect(() => {
    if (!caseIdParam) {
      backendLoadedCaseIdRef.current = null;
      return;
    }
    if (backendLoadedCaseIdRef.current === caseIdParam) return;
    const numericId = Number(caseIdParam);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      showError("Geçersiz kayıt kimliği");
      return;
    }
    let cancelled = false;
    void getSavedCase(numericId)
      .then((record) => {
        if (cancelled) return;
        const mapped = mapIsAramaFormFromBackend(record.data);
        if (!mapped) {
          showError("Kayıt formu okunamadı");
          return;
        }
        setForm(mapped);
        setActiveId(String(numericId));
        setActiveName(resolveSavedCaseDisplayName(record));
        setBaseline(snapshotKey(mapped));
        setDateError(null);
        backendLoadedCaseIdRef.current = caseIdParam;
        success(`Kayıt yüklendi: ${resolveSavedCaseDisplayName(record)}`);
        const next = new URLSearchParams(searchParams);
        next.delete("caseId");
        setSearchParams(next, { replace: true });
      })
      .catch(() => {
        if (!cancelled) {
          backendLoadedCaseIdRef.current = null;
          showError("Kayıt yüklenemedi");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [caseIdParam, searchParams, setSearchParams, showError, success]);

  const patch = useCallback(<K extends keyof IsAramaForm>(key: K, value: IsAramaForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleStartDateChange = useCallback(
    (value: string) => patch("startDate", clampYear(value)),
    [patch],
  );

  const handleEndDateChange = useCallback(
    (value: string) => patch("endDate", clampYear(value)),
    [patch],
  );

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

  const handleNew = useCallback(() => {
    if (dirty) {
      setConfirmNew(true);
      return;
    }
    setForm(createEmptyForm());
    setActiveId(null);
    setActiveName(null);
    setBaseline(snapshotKey(createEmptyForm()));
    setDateError(null);
  }, [dirty]);

  const doNew = useCallback(() => {
    setConfirmNew(false);
    setForm(createEmptyForm());
    setActiveId(null);
    setActiveName(null);
    setBaseline(snapshotKey(createEmptyForm()));
    setDateError(null);
  }, []);

  const persist = useCallback(
    async (name: string, existingId?: string | null) => {
      if (!(result.brut > 0)) {
        showError("Önce geçerli bir hesaplama yapın");
        return;
      }
      setCaseSaving(true);
      const wasUpdate = !!(existingId && /^\d+$/.test(existingId));
      try {
        const record = await isAramaIzniCaseCrud.saveCase(
          name,
          form,
          buildIsAramaIzniSaveResult({
            toplamBrut: result.toplamBrut,
            brut: result.brut,
            net: result.net,
          }),
          existingId,
        );
        const recordId = String(record.id);
        setActiveId(recordId);
        setActiveName(resolveSavedCaseDisplayName(record));
        setBaseline(snapshotKey(form));
        setCaseIdParam(recordId);
        backendLoadedCaseIdRef.current = recordId;
        await reloadCases();
        success(wasUpdate ? "Kayıt güncellendi" : "Kayıt kaydedildi");
        setNameOpen(false);
      } catch (error) {
        showError(
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Kayıt yapılamadı",
        );
      } finally {
        setCaseSaving(false);
      }
    },
    [form, result, reloadCases, setCaseIdParam, showError, success],
  );

  const handleSaveClick = useCallback(() => {
    if (!(result.brut > 0)) {
      showError("Önce geçerli bir hesaplama yapın");
      return;
    }
    if (activeId && activeName && /^\d+$/.test(activeId)) {
      void persist(activeName, activeId);
      return;
    }
    setNameOpen(true);
  }, [activeId, activeName, persist, result.brut, showError]);

  const openCase = useCallback(
    (c: SavedCase) => {
      const next = { ...createEmptyForm(), ...c.form };
      setForm(next);
      setActiveId(c.id);
      setActiveName(c.name);
      setBaseline(snapshotKey(next));
      setDateError(null);
      setListOpen(false);
      success(`Kayıt açıldı: ${c.name}`);
    },
    [success],
  );

  const doDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    try {
      if (/^\d+$/.test(confirmDeleteId)) {
        await isAramaIzniCaseCrud.removeCase(confirmDeleteId);
      } else {
        deleteCase(confirmDeleteId);
      }
      if (activeId === confirmDeleteId) {
        setActiveId(null);
        setActiveName(null);
      }
      setConfirmDeleteId(null);
      await reloadCases();
      success("Kayıt silindi");
    } catch (error) {
      showError(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Kayıt silinemedi",
      );
    }
  }, [activeId, confirmDeleteId, reloadCases, showError, success]);

  const addDusum = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      tarihAralikDusumler: [
        ...prev.tarihAralikDusumler,
        { id: newLocalId("dusum"), baslangic: "", bitis: "", gunlukSaat: "" },
      ],
    }));
  }, []);

  const updateDusum = useCallback((id: string, patchValue: Partial<{ baslangic: string; bitis: string; gunlukSaat: string }>) => {
    setForm((prev) => ({
      ...prev,
      tarihAralikDusumler: prev.tarihAralikDusumler.map((d) => (d.id === id ? { ...d, ...patchValue } : d)),
    }));
  }, []);

  const removeDusum = useCallback((id: string) => {
    setForm((prev) => ({ ...prev, tarihAralikDusumler: prev.tarihAralikDusumler.filter((d) => d.id !== id) }));
  }, []);

  const previewSections = useMemo((): PreviewSection[] => {
    const sections: PreviewSection[] = [
      {
        id: "genel",
        title: "Genel Bilgiler",
        headers: ["Alan", "Değer"],
        rows: [
          ["İşe Giriş", form.startDate ? formatDateTR(form.startDate) : "—"],
          ["İşten Çıkış", form.endDate ? formatDateTR(form.endDate) : "—"],
          ["Çalışma Süresi", result.workPeriod.label],
          ["Brüt Ücret (giydirilmiş)", `${formatMoney(result.toplamBrut)} ₺`],
          ["İhbar Süresi (Hafta)", String(result.weeks)],
          ["Haftalık Çalışma Günü", `${haftalikGunNum} gün`],
        ],
      },
      {
        id: "hesap",
        title: "İş Arama İzni Hesaplama Detayı",
        headers: ["Kalem", "Değer"],
        rows: [
          ["Toplam İş Arama Günü", `${result.weeks} hafta × ${haftalikGunNum} gün = ${result.toplamIsAramaGunu} gün`],
          ["Toplam İş Arama Saati", `${result.toplamIsAramaGunu} gün × 2 saat = ${result.toplamIsAramaSaati} saat`],
          ...(result.dusumSaati > 0
            ? ([
                ["Kullandırılan İzin (Düşüm)", `-${result.dusumSaati.toFixed(1)} saat`],
                ["Net İş Arama Saati", `${result.netIsAramaSaati.toFixed(1)} saat`],
              ] as [string, string][])
            : []),
          ["Saatlik Ücret", `${formatMoney(result.toplamBrut)} ₺ / 225 = ${formatMoney(result.saatlikUcret)} ₺`],
          [
            "İş Arama İzni Ücreti",
            `${formatMoney(result.saatlikUcret)} ₺ × ${result.netIsAramaSaati.toFixed(1)} saat = ${formatMoney(result.brut)} ₺`,
          ],
        ],
        lastRowTone: "blue",
      },
      {
        id: "brutten-nete",
        title: "Brüt'ten Net'e Çeviri",
        headers: ["Kalem", "Tutar"],
        rows: [
          ["Brüt İş Arama İzni Ücreti", `${formatMoney(result.brut)} ₺`],
          ["SGK Primi (%14)", `-${formatMoney(result.sskPrimi)} ₺`],
          ["İşsizlik Primi (%1)", `-${formatMoney(result.issizlikPrimi)} ₺`],
          [`Gelir Vergisi ${result.gelirVergisiDilimleri}`.trim(), `-${formatMoney(result.gelirVergisi)} ₺`],
          ["Damga Vergisi (Binde 7,59)", `-${formatMoney(result.damgaVergisi)} ₺`],
          ["Net İş Arama İzni Ücreti", `${formatMoney(result.net)} ₺`],
        ],
        lastRowTone: "green",
      },
    ];
    return sections;
  }, [form.endDate, form.startDate, haftalikGunNum, result]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroIcon} aria-hidden>
            <BriefcaseBusiness size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 className={styles.title}>{PAGE_TITLE}</h1>
            <p className={styles.desc}>
              İş Kanunu m.17 ihbar süresi ve haftalık çalışma gününe göre iş arama izni saatleri;
              giydirilmiş brütten saatlik ücret ile hesaplanır.
            </p>
            <div className={styles.privacyBadge}>
              <ShieldCheck size={12} /> Hesaplama lokal çalışır
            </div>
          </div>
        </div>
        <div className={styles.heroAside}>
          {activeName ? (
            <div className={styles.recordBadge}>
              <span>{activeName}</span>
            </div>
          ) : null}
          <div className={styles.quickTotal}>
            <span>Net iş arama izni</span>
            <span className={styles.quickTotalValue}>
              <AnimatedMoney value={result.net} /> ₺
            </span>
          </div>
          <div className={styles.heroActions}>
            <Button
              type="button"
              variant="soft"
              size="sm"
              className={tourStyles.howToBtn}
              onClick={() => tour.openTour(0)}
              aria-label="Nasıl kullanılır? Etkileşimli kılavuzu başlat"
            >
              <CirclePlay size={14} /> Nasıl kullanılır?
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setListOpen(true)}>
              <FolderOpen size={14} /> Kayıtlar
            </Button>
            <Button type="button" variant="soft" size="sm" onClick={handleNew}>
              <FilePlus2 size={14} /> Yeni Hesaplama
            </Button>
          </div>
        </div>
      </header>

      {storageError ? (
        <div className={styles.storageBanner}>
          {storageError}{" "}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              clearCorruptCases();
              setStorageError(null);
              reloadCases();
            }}
          >
            Temizle
          </Button>
        </div>
      ) : null}

      <div className={styles.layout}>
        <div style={{ display: "grid", gap: "0.85rem", minWidth: 0 }}>
          <section className={styles.card} data-tour="is-arama-izni-donem">
            <div className={styles.cardHead}>
              <Calculator size={16} />
              <h2 className={styles.cardTitle}>Hesaplama bilgileri</h2>
            </div>
            <div className={styles.fields3}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ia-ise-giris">
                  İşe giriş
                </label>
                <DraftDateInput
                  id="ia-ise-giris"
                  max="9999-12-31"
                  className={`${styles.input} ${dateError ? styles.inputError : ""}`}
                  value={form.startDate}
                  onCommit={handleStartDateChange}
                  onBlur={() => {
                    if (form.startDate && form.endDate) validateDates(form.startDate, form.endDate);
                  }}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ia-isten-cikis">
                  İşten çıkış
                </label>
                <DraftDateInput
                  id="ia-isten-cikis"
                  max="9999-12-31"
                  className={`${styles.input} ${dateError ? styles.inputError : ""}`}
                  value={form.endDate}
                  onCommit={handleEndDateChange}
                  onBlur={() => {
                    if (form.startDate && form.endDate) validateDates(form.startDate, form.endDate);
                  }}
                />
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Çalışma süresi</span>
                <div className={styles.readonlyBox}>
                  <FlashValue value={result.workPeriod.label || "—"} />
                </div>
              </div>
            </div>
          </section>

          <section className={styles.card} data-tour="is-arama-izni-ucret">
            <div className={styles.cardHead}>
              <Calculator size={16} />
              <h2 className={styles.cardTitle}>Ücret kalemleri</h2>
            </div>
            <div className={styles.fields}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ia-brut">
                  Çıplak brüt ücret
                </label>
                <DraftTextInput
                  id="ia-brut"
                  className={styles.input}
                  inputMode="decimal"
                  placeholder="Örn: 25.000"
                  value={form.brut}
                  onCommit={(v) => patch("brut", v)}
                />
                <p className={styles.helper}>V3 ile uyum: hesaplama yalnızca çıplak brüt üzerinden yapılır.</p>
              </div>
            </div>

            <div className={styles.field} style={{ marginTop: "0.75rem" }}>
              <label className={styles.label} htmlFor="ia-haftalik-gun">
                Haftalık çalışma süresi (gün)
              </label>
              <select
                id="ia-haftalik-gun"
                className={styles.input}
                value={form.haftalikCalismaGunu}
                onChange={(e) => patch("haftalikCalismaGunu", e.target.value)}
              >
                <option value="5">5 gün</option>
                <option value="6">6 gün</option>
                <option value="7">7 gün</option>
              </select>
              <p className={styles.helper}>Haftada kaç gün çalışıldığı (5 veya 6 gibi).</p>
            </div>
          </section>

          <section className={styles.card} data-tour="is-arama-izni-dusumler">
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>
                Kullandırılmış iş arama izinleri (düşüm){" "}
                <span className={styles.optionalTag}>(isteğe bağlı)</span>
              </h2>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ia-izin-gun">
                Gün bazlı düşüm <span className={styles.optionalTag}>(günlük {getGunlukCalismaSaati().toFixed(1)} saat)</span>
              </label>
              <DraftTextInput
                id="ia-izin-gun"
                className={styles.input}
                inputMode="decimal"
                placeholder="Örn: 2"
                value={form.kullandirilanIzinGun}
                onCommit={(v) => patch("kullandirilanIzinGun", v)}
              />
              {parseNum(form.kullandirilanIzinGun) > 0 ? (
                <p className={styles.helper}>
                  = {parseNum(form.kullandirilanIzinGun)} gün × {getGunlukCalismaSaati().toFixed(1)} saat/gün ={" "}
                  {(parseNum(form.kullandirilanIzinGun) * getGunlukCalismaSaati()).toFixed(1)} saat
                </p>
              ) : null}
            </div>

            <div style={{ marginTop: "0.75rem" }}>
              <div className={styles.rowHead}>
                <span className={styles.label}>Tarih aralığı bazlı düşüm</span>
                <Button type="button" variant="ghost" size="sm" onClick={addDusum}>
                  <Plus size={14} /> Ekle
                </Button>
              </div>
              {form.tarihAralikDusumler.length === 0 ? (
                <p className={styles.emptyCoef}>Henüz tarih aralığı eklenmedi</p>
              ) : (
                <div className={styles.rowsGrid}>
                  {form.tarihAralikDusumler.map((d) => {
                    const cg = calculateWorkDays(d.baslangic, d.bitis, haftalikGunNum);
                    const gs = parseNum(d.gunlukSaat);
                    const topSaat = cg * gs;
                    return (
                      <div key={d.id} className={styles.dusumRow}>
                        <div className={styles.fields3}>
                          <div className={styles.field}>
                            <label className={styles.label}>Başlangıç</label>
                            <DraftDateInput
                              className={styles.input}
                              value={d.baslangic}
                              onCommit={(v) => updateDusum(d.id, { baslangic: clampYear(v) })}
                            />
                          </div>
                          <div className={styles.field}>
                            <label className={styles.label}>Bitiş</label>
                            <DraftDateInput
                              className={styles.input}
                              value={d.bitis}
                              onCommit={(v) => updateDusum(d.id, { bitis: clampYear(v) })}
                            />
                          </div>
                          <div className={styles.field}>
                            <label className={styles.label}>Günlük saat</label>
                            <DraftTextInput
                              className={styles.input}
                              inputMode="decimal"
                              placeholder="Örn: 2"
                              value={d.gunlukSaat}
                              onCommit={(v) => updateDusum(d.id, { gunlukSaat: v })}
                            />
                          </div>
                        </div>
                        <div className={styles.rowHead} style={{ marginTop: "0.4rem" }}>
                          <span className={styles.helper}>
                            {d.baslangic && d.bitis && d.gunlukSaat
                              ? `= ${cg} çalışma günü × ${gs} saat/gün = ${topSaat.toFixed(1)} saat`
                              : ""}
                          </span>
                          <Button type="button" variant="ghost" size="icon" aria-label="Satırı sil" onClick={() => removeDusum(d.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {result.dusumSaati > 0 ? (
              <div className={styles.warn} style={{ marginTop: "0.6rem" }}>
                Toplam düşülecek saat: <strong>{result.dusumSaati.toFixed(1)} saat</strong>
              </div>
            ) : null}
          </section>
        </div>

        <aside className={styles.aside} style={{ display: "grid", gap: "0.85rem", minWidth: 0 }}>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Özet</h2>
            </div>
            <div className={styles.lineList}>
              <div className={styles.line}>
                <span>İhbar süresi</span>
                <strong>{result.weeks} hafta</strong>
              </div>
              <div className={styles.line}>
                <span>Haftalık çalışma</span>
                <strong>{haftalikGunNum} gün</strong>
              </div>
              <div className={styles.line}>
                <span>Toplam iş arama günü</span>
                <strong>
                  {result.weeks} × {haftalikGunNum} = {result.toplamIsAramaGunu} gün
                </strong>
              </div>
              <div className={styles.line}>
                <span>Toplam iş arama saati</span>
                <strong>{result.toplamIsAramaGunu} × 2 = {result.toplamIsAramaSaati} saat</strong>
              </div>
              {result.dusumSaati > 0 ? (
                <>
                  <div className={styles.line}>
                    <span>Düşüm</span>
                    <strong className={styles.deduction}>-{result.dusumSaati.toFixed(1)} saat</strong>
                  </div>
                  <div className={styles.line}>
                    <span>Net iş arama saati</span>
                    <strong>{result.netIsAramaSaati.toFixed(1)} saat</strong>
                  </div>
                </>
              ) : null}
              <div className={styles.line}>
                <span>Saatlik ücret</span>
                <strong>
                  {formatMoney(result.toplamBrut)} ₺ / 225 = {formatMoney(result.saatlikUcret)} ₺
                </strong>
              </div>
            </div>
            <div className={`${styles.resultCard} ${styles.resultCardAccent}`} style={{ marginTop: "0.6rem" }}>
              <div className={styles.resultLabel}>İş arama izni ücreti (brüt)</div>
              <div className={styles.resultValue}>
                <AnimatedMoney value={result.brut} /> ₺
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Brütten nete</h2>
            </div>
            <div className={styles.lineList}>
              <div className={styles.line}>
                <span>Brüt</span>
                <strong>
                  <FlashValue value={`${formatMoney(result.brut)} ₺`} />
                </strong>
              </div>
              <div className={styles.line}>
                <span>SGK (%14)</span>
                <strong className={styles.deduction}>-{formatMoney(result.sskPrimi)} ₺</strong>
              </div>
              <div className={styles.line}>
                <span>İşsizlik (%1)</span>
                <strong className={styles.deduction}>-{formatMoney(result.issizlikPrimi)} ₺</strong>
              </div>
              <div className={styles.line}>
                <span>Gelir vergisi {result.gelirVergisiDilimleri}</span>
                <strong className={styles.deduction}>-{formatMoney(result.gelirVergisi)} ₺</strong>
              </div>
              <div className={styles.line}>
                <span>Damga (binde 7,59)</span>
                <strong className={styles.deduction}>-{formatMoney(result.damgaVergisi)} ₺</strong>
              </div>
            </div>
            <div className={`${styles.resultCard} ${styles.resultCardStrong}`} style={{ marginTop: "0.6rem" }}>
              <div className={styles.resultLabel}>Net iş arama izni ücreti</div>
              <div className={styles.resultValue}>
                <AnimatedMoney value={result.net} /> ₺
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Hukuki notlar</h2>
            </div>
            <div className={styles.notes}>
              {NOTE_BLOCKS.map((n, i) => (
                <p key={i} className={n.kind === "heading" ? styles.noteHeading : styles.note}>
                  {n.text}
                </p>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <div className={`${styles.stickyBar} ${dirty ? styles.stickyBarDirty : ""}`} data-tour="is-arama-izni-kaydet-actions">
        <div className={styles.stickyInner}>
          <div className={styles.stickyStatus}>
            {dirty
              ? "Kaydedilmemiş değişiklikler var"
              : activeName
                ? `Kayıt: ${activeName}`
                : "Yeni hesaplama"}
          </div>
          <div className={styles.stickyActions}>
            <Button type="button" variant="soft" size="sm" onClick={() => setPreviewOpen(true)}>
              <Eye size={14} /> Önizleme
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleNew}>
              <FilePlus2 size={14} /> Yeni
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={handleSaveClick} disabled={caseSaving}>
              <Save size={14} /> {caseSaving ? "Kaydediliyor…" : activeId && /^\d+$/.test(activeId) ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>

      <NameModal
        open={nameOpen}
        initial={activeName || PAGE_TITLE}
        onClose={() => setNameOpen(false)}
        onConfirm={(name) => void persist(name, null)}
      />

      {listOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className={styles.modalTitle}>Kayıtlı hesaplamalar</h3>
              <Button type="button" variant="ghost" size="icon" onClick={() => setListOpen(false)} aria-label="Kapat">
                <X size={16} />
              </Button>
            </div>
            {cases.length === 0 ? (
              <p className={styles.helper}>Henüz kayıt yok.</p>
            ) : (
              <div className={styles.caseList}>
                {cases.map((c) => (
                  <div key={c.id} className={styles.caseItem}>
                    <div style={{ minWidth: 0 }}>
                      <div className={styles.caseName}>{c.name}</div>
                      <div className={styles.caseMeta}>
                        {new Date(c.updatedAt).toLocaleString("tr-TR")} · Net {formatMoney(c.results.net)} ₺
                      </div>
                    </div>
                    <div className={styles.caseBtns}>
                      <Button type="button" variant="soft" size="sm" onClick={() => openCase(c)}>
                        Aç
                      </Button>
                      <Button type="button" variant="danger" size="icon" aria-label="Sil" onClick={() => setConfirmDeleteId(c.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmNew}
        title="Yeni hesaplama"
        description="Kaydedilmemiş veriler silinecek. Devam edilsin mi?"
        confirmLabel="Devam et"
        onConfirm={doNew}
        onCancel={() => setConfirmNew(false)}
      />
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Kaydı sil"
        description="Bu kayıt kalıcı olarak silinecek."
        confirmLabel="Sil"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <CalculationPreviewModal
        open={previewOpen}
        title={PREVIEW_TITLE}
        sections={previewSections}
        contentId="is-arama-izni-preview"
        onClose={() => setPreviewOpen(false)}
      />

      <GuidedTourHost
        definition={IS_ARAMA_IZNI_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={IS_ARAMA_IZNI_TOUR_WELCOME_TITLE}
        welcomeBody={IS_ARAMA_IZNI_TOUR_WELCOME_BODY}
        welcomeStartLabel="Başlat"
        welcomeLaterLabel="Kendim devam edeceğim"
        initialStepIndex={tour.resumeStepIndex}
        onCollectingComplete={() => {
          tour.completeTour();
          toastInfo("Kılavuz tamamlandı. Hesaplamanızı önizleyebilir veya kaydedebilirsiniz.");
        }}
        paused={previewOpen || nameOpen || listOpen || confirmNew || !!confirmDeleteId}
      />
    </div>
  );
}
