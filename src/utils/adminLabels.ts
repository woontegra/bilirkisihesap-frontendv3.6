export function formatDateTr(value?: string | null, withTime = false): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  if (withTime) {
    return d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
  }
  return d.toLocaleDateString("tr-TR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatNumberTr(n: number): string {
  return n.toLocaleString("tr-TR");
}

export function getAccountStatusLabel(raw?: string | null): string {
  if (!raw) return "Hesap durumu yok";
  const v = raw.toLowerCase();
  if (v === "active" || v === "aktif") return "Hesap aktif";
  if (v === "suspended" || v === "passive" || v === "pasif") return "Hesap askıda";
  return raw;
}

export function getSubscriptionAccessTone(code?: string | null): "success" | "danger" | "warning" | "neutral" {
  const v = String(code || "").toUpperCase();
  if (v === "OK") return "success";
  if (v === "DEMO_EXPIRED" || v === "LICENSE_EXPIRED") return "danger";
  if (v === "LICENSE_INACTIVE" || v === "ACTIVE_PAID_LICENSE_REQUIRED") return "warning";
  return "neutral";
}

export function getStatusLabel(raw?: string | null): string {
  if (!raw) return "—";
  const v = raw.toLowerCase();
  if (v === "active" || v === "aktif") return "Aktif";
  if (v === "suspended" || v === "passive" || v === "pasif") return "Askıda";
  if (v === "trial" || v === "demo") return "Deneme";
  if (v === "open") return "Açık";
  if (v === "in_progress") return "İşlemde";
  if (v === "resolved") return "Çözüldü";
  if (v === "closed") return "Kapalı";
  return raw;
}

export function getSubscriptionTypeLabel(raw?: string | null): string {
  if (!raw) return "—";
  const v = raw.toLowerCase();
  if (v.includes("year") || v.includes("yillik") || v.includes("yıllık") || v === "annual") {
    return "Yıllık";
  }
  if (v.includes("month") || v.includes("aylik") || v.includes("aylık")) {
    return "Aylık";
  }
  if (v.includes("demo") || v.includes("trial")) return "Deneme";
  if (v.includes("starter")) return "Başlangıç";
  if (v.includes("professional")) return "Profesyonel";
  return raw;
}

export function downloadCsv(filename: string, rows: string[][]): void {
  const content = rows
    .map((row) =>
      row
        .map((cell) => {
          const safe = String(cell ?? "").replace(/"/g, '""');
          return `"${safe}"`;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
