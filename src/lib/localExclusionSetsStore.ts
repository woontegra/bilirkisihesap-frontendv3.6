/**
 * Legacy localStorage okuyucu — ortak havuz artık API'de.
 * Migrate kaynakları ve eski anahtar temizliği için tutulur.
 */

export type LocalExclusionSetItem = {
  id: string;
  type?: string;
  start: string;
  end: string;
  days: number;
};

export type LocalExclusionSet = {
  id: string;
  name: string;
  data: LocalExclusionSetItem[];
  createdAt: string;
  updatedAt: string;
  /** Backend'den tek seferlik aktarıldıysa kaynak id */
  legacyBackendId?: number;
};

type StorePayload = {
  version: 1;
  sets: LocalExclusionSet[];
};

function newId(prefix = "set"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function scopeIds(): { tenantId: string; userId: string } {
  try {
    return {
      tenantId: localStorage.getItem("tenant_id") || "0",
      userId: localStorage.getItem("user_id") || "0",
    };
  } catch {
    return { tenantId: "0", userId: "0" };
  }
}

export function localExclusionSetsKey(moduleId: string): string {
  const { tenantId, userId } = scopeIds();
  return `bilirkisi-hesap-v35:${moduleId}:exclusion-sets:v1:t${tenantId}:u${userId}`;
}

export function exclusionLegacyImportFlagKey(moduleId: string): string {
  const { tenantId, userId } = scopeIds();
  return `bilirkisi-hesap-v35:${moduleId}:exclusion-sets-legacy-imported:v1:t${tenantId}:u${userId}`;
}

function readStore(moduleId: string): LocalExclusionSet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(localExclusionSetsKey(moduleId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StorePayload>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.sets)) return [];
    return parsed.sets.filter(
      (s): s is LocalExclusionSet =>
        !!s && typeof s.id === "string" && typeof s.name === "string" && Array.isArray(s.data),
    );
  } catch {
    return [];
  }
}

function writeStore(moduleId: string, sets: LocalExclusionSet[]): void {
  if (typeof window === "undefined") return;
  const payload: StorePayload = { version: 1, sets };
  localStorage.setItem(localExclusionSetsKey(moduleId), JSON.stringify(payload));
}

function normalizeItem(raw: Record<string, unknown>): LocalExclusionSetItem {
  const daysNum = Number(String(raw.days ?? "").replace(/\./g, "").replace(",", "."));
  return {
    id: String(raw.id || newId("item")),
    type: raw.type == null || raw.type === "" ? undefined : String(raw.type),
    start: String(raw.start ?? ""),
    end: String(raw.end ?? ""),
    days: Number.isFinite(daysNum) ? daysNum : 0,
  };
}

export function listLocalExclusionSets(moduleId: string): LocalExclusionSet[] {
  return readStore(moduleId).slice().sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

export function upsertLocalExclusionSet(
  moduleId: string,
  name: string,
  items: LocalExclusionSetItem[],
): LocalExclusionSet {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Lütfen bir isim girin");
  if (!items.length) throw new Error("Kaydedilecek kullanılan izin satırı bulunamadı");
  const now = new Date().toISOString();
  const sets = readStore(moduleId);
  const existing = sets.find((s) => s.name.toLocaleLowerCase("tr") === trimmed.toLocaleLowerCase("tr"));
  const data = items.map((it) => normalizeItem(it as unknown as Record<string, unknown>));
  if (existing) {
    const updated: LocalExclusionSet = { ...existing, name: trimmed, data, updatedAt: now };
    writeStore(
      moduleId,
      sets.map((s) => (s.id === existing.id ? updated : s)),
    );
    return updated;
  }
  const created: LocalExclusionSet = {
    id: newId("set"),
    name: trimmed,
    data,
    createdAt: now,
    updatedAt: now,
  };
  writeStore(moduleId, [...sets, created]);
  return created;
}

export function deleteLocalExclusionSet(moduleId: string, id: string): void {
  writeStore(
    moduleId,
    readStore(moduleId).filter((s) => s.id !== id),
  );
}

export function wasExclusionLegacyImported(moduleId: string): boolean {
  try {
    return localStorage.getItem(exclusionLegacyImportFlagKey(moduleId)) === "1";
  } catch {
    return false;
  }
}

export function markExclusionLegacyImported(moduleId: string): void {
  try {
    localStorage.setItem(exclusionLegacyImportFlagKey(moduleId), "1");
  } catch {
    /* ignore */
  }
}

export function clearExclusionLegacyImportedFlag(moduleId: string): void {
  try {
    localStorage.removeItem(exclusionLegacyImportFlagKey(moduleId));
  } catch {
    /* ignore */
  }
}

/**
 * Salt okunur backend listesini lokale aktarır.
 * Aynı legacyBackendId veya aynı isim varsa atlar (mükerrer yok).
 * Backend'e yazmaz.
 */
export function mergeLegacyExclusionSets(
  moduleId: string,
  legacy: Array<{ id?: number; name?: string; data?: unknown }>,
): { imported: number; skipped: number } {
  const sets = readStore(moduleId);
  const byLegacy = new Set(sets.map((s) => s.legacyBackendId).filter((x): x is number => typeof x === "number"));
  const byName = new Set(sets.map((s) => s.name.toLocaleLowerCase("tr")));
  let imported = 0;
  let skipped = 0;
  const now = new Date().toISOString();
  const next = [...sets];

  for (const raw of legacy) {
    const name = String(raw?.name || "").trim();
    const backendId = Number(raw?.id);
    if (!name) {
      skipped++;
      continue;
    }
    if (Number.isFinite(backendId) && backendId > 0 && byLegacy.has(backendId)) {
      skipped++;
      continue;
    }
    if (byName.has(name.toLocaleLowerCase("tr"))) {
      skipped++;
      continue;
    }
    let dataRaw = raw.data;
    if (typeof dataRaw === "string") {
      try {
        dataRaw = JSON.parse(dataRaw);
      } catch {
        dataRaw = [];
      }
    }
    const data: LocalExclusionSetItem[] = Array.isArray(dataRaw)
      ? dataRaw
          .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
          .map((e) => normalizeItem(e))
      : [];
    const created: LocalExclusionSet = {
      id: newId("set"),
      name,
      data,
      createdAt: now,
      updatedAt: now,
      legacyBackendId: Number.isFinite(backendId) && backendId > 0 ? backendId : undefined,
    };
    next.push(created);
    byName.add(name.toLocaleLowerCase("tr"));
    if (created.legacyBackendId) byLegacy.add(created.legacyBackendId);
    imported++;
  }

  writeStore(moduleId, next);
  markExclusionLegacyImported(moduleId);
  return { imported, skipped };
}
