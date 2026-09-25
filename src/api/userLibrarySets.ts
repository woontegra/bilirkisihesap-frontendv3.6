import { apiClient } from "@/api/client";

export type UserLibraryKind = "EXTRA_SET" | "LEAVE_EXCLUSION";

export type UserLibrarySetDto = {
  id: string;
  kind: UserLibraryKind;
  scopeKey: string;
  name: string;
  data: unknown[];
  legacyBackendId?: number;
  createdAt: string;
  updatedAt: string;
};

type ListResponse = { success?: boolean; sets?: UserLibrarySetDto[]; error?: string };
type UpsertResponse = { success?: boolean; set?: UserLibrarySetDto; error?: string };
type MigrateResponse = {
  success?: boolean;
  migrated?: number;
  skipped?: number;
  sets?: UserLibrarySetDto[];
  error?: string;
};

export async function listUserLibrarySets(
  kind: UserLibraryKind,
  scopeKey: string,
): Promise<UserLibrarySetDto[]> {
  const q = new URLSearchParams({ kind, scopeKey });
  const data = await apiClient<ListResponse>(`/api/user-library-sets?${q.toString()}`);
  return Array.isArray(data.sets) ? data.sets : [];
}

export async function upsertUserLibrarySet(input: {
  kind: UserLibraryKind;
  scopeKey: string;
  name: string;
  data: unknown[];
  legacyBackendId?: number;
}): Promise<UserLibrarySetDto> {
  const data = await apiClient<UpsertResponse>("/api/user-library-sets/upsert", {
    method: "POST",
    body: input,
  });
  if (!data.set) throw new Error(data.error || "Set kaydedilemedi");
  return data.set;
}

export async function deleteUserLibrarySet(id: string): Promise<void> {
  await apiClient(`/api/user-library-sets/${id}`, { method: "DELETE" });
}

export async function migrateUserLibrarySets(input: {
  kind: UserLibraryKind;
  scopeKey: string;
  sets: Array<{
    id?: string;
    name: string;
    data: unknown[];
    legacyBackendId?: number;
    createdAt?: string;
    updatedAt?: string;
  }>;
}): Promise<MigrateResponse> {
  return apiClient<MigrateResponse>("/api/user-library-sets/migrate", {
    method: "POST",
    body: input,
  });
}
