import { apiClient } from "@/api/client";
import type { PuantajTemplate } from "@/pages/puantaj-fazla-mesai/model";

type ListResponse = { success?: boolean; templates?: PuantajTemplate[]; error?: string };
type OneResponse = { success?: boolean; template?: PuantajTemplate; error?: string };
type MigrateResponse = {
  success?: boolean;
  migrated?: number;
  skipped?: number;
  templates?: PuantajTemplate[];
  error?: string;
};

export async function listPuantajFmTemplates(): Promise<PuantajTemplate[]> {
  const data = await apiClient<ListResponse>("/api/puantaj-fm-templates");
  return Array.isArray(data.templates) ? data.templates : [];
}

export async function savePuantajFmTemplate(template: PuantajTemplate): Promise<PuantajTemplate> {
  const data = await apiClient<OneResponse>("/api/puantaj-fm-templates", {
    method: "POST",
    body: template,
  });
  if (!data.template) throw new Error(data.error || "Şablon kaydedilemedi");
  return data.template;
}

export async function deletePuantajFmTemplate(id: string): Promise<void> {
  await apiClient(`/api/puantaj-fm-templates/${id}`, { method: "DELETE" });
}

export async function migratePuantajFmTemplates(
  templates: PuantajTemplate[],
): Promise<MigrateResponse> {
  return apiClient<MigrateResponse>("/api/puantaj-fm-templates/migrate", {
    method: "POST",
    body: { templates },
  });
}
