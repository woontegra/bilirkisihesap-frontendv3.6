import type { Note, Tag } from "@/context/calculationToolsTypes";

const boundCaseKey = (pathname: string) => `v35:bound-case:${pathname}`;
const draftNotesKey = (draftId: string) => `v35:draft-notes:${draftId}`;
const draftTagsKey = (draftId: string) => `v35:draft-tags:${draftId}`;

export function draftIdFromPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  return `draft-${segments.join("-") || "home"}`;
}

export function readBoundCaseId(pathname: string): string | null {
  try {
    const id = sessionStorage.getItem(boundCaseKey(pathname));
    return id && /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function writeBoundCaseId(pathname: string, id: string): void {
  if (!/^\d+$/.test(id)) return;
  try {
    sessionStorage.setItem(boundCaseKey(pathname), id);
  } catch {
    /* ignore */
  }
}

export function clearBoundCaseId(pathname: string): void {
  try {
    sessionStorage.removeItem(boundCaseKey(pathname));
  } catch {
    /* ignore */
  }
}

export function readDraftNotes(draftId: string): Note[] {
  try {
    // Eski localStorage taslakları bir kez session'a taşı
    const legacy = localStorage.getItem(draftNotesKey(draftId));
    if (legacy) {
      sessionStorage.setItem(draftNotesKey(draftId), legacy);
      localStorage.removeItem(draftNotesKey(draftId));
    }
    const raw = sessionStorage.getItem(draftNotesKey(draftId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Note[]) : [];
  } catch {
    return [];
  }
}

export function writeDraftNotes(draftId: string, notes: Note[]): void {
  try {
    sessionStorage.setItem(draftNotesKey(draftId), JSON.stringify(notes));
    localStorage.removeItem(draftNotesKey(draftId));
  } catch {
    /* ignore */
  }
}

export function readDraftTags(draftId: string): Tag[] {
  try {
    const legacy = localStorage.getItem(draftTagsKey(draftId));
    if (legacy) {
      sessionStorage.setItem(draftTagsKey(draftId), legacy);
      localStorage.removeItem(draftTagsKey(draftId));
    }
    const raw = sessionStorage.getItem(draftTagsKey(draftId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Tag[]) : [];
  } catch {
    return [];
  }
}

export function writeDraftTags(draftId: string, tags: Tag[]): void {
  try {
    sessionStorage.setItem(draftTagsKey(draftId), JSON.stringify(tags));
    localStorage.removeItem(draftTagsKey(draftId));
  } catch {
    /* ignore */
  }
}

export function clearDraftData(draftId: string): void {
  try {
    sessionStorage.removeItem(draftNotesKey(draftId));
    sessionStorage.removeItem(draftTagsKey(draftId));
    localStorage.removeItem(draftNotesKey(draftId));
    localStorage.removeItem(draftTagsKey(draftId));
  } catch {
    /* ignore */
  }
}

export function clearCalculationBinding(pathname: string, draftId: string): void {
  clearBoundCaseId(pathname);
  clearDraftData(draftId);
}

export function resolveCalculationId(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  const fromUrl = params.get("caseId");
  if (fromUrl && /^\d+$/.test(fromUrl)) {
    writeBoundCaseId(pathname, fromUrl);
    return fromUrl;
  }
  const bound = readBoundCaseId(pathname);
  if (bound) return bound;
  return draftIdFromPath(pathname);
}

export function isPersistedCaseId(id: string): boolean {
  return /^\d+$/.test(id);
}
