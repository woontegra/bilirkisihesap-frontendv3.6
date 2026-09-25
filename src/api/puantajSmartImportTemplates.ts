import { apiClient } from "@/api/client";
import type { SmartImportMappingTemplate } from "@/pages/puantaj-fazla-mesai/smart-import-v2/smartTemplateStore";

type ListResponse = { success?: boolean; templates?: SmartImportMappingTemplate[]; error?: string };
type OneResponse = { success?: boolean; template?: SmartImportMappingTemplate; error?: string };
type MigrateResponse = {
  success?: boolean;
  migrated?: number;
  skipped?: number;
  templates?: SmartImportMappingTemplate[];
  error?: string;
};

export async function listPuantajSmartImportTemplates(): Promise<SmartImportMappingTemplate[]> {
  const data = await apiClient<ListResponse>("/api/puantaj-smart-import-templates");
  return Array.isArray(data.templates) ? data.templates : [];
}

export async function savePuantajSmartImportTemplate(
  template: SmartImportMappingTemplate,
): Promise<SmartImportMappingTemplate> {
  const data = await apiClient<OneResponse>("/api/puantaj-smart-import-templates", {
    method: "POST",
    body: template,
  });
  if (!data.template) throw new Error(data.error || "Şablon kaydedilemedi");
  return data.template;
}

export async function deletePuantajSmartImportTemplate(id: string): Promise<void> {
  await apiClient(`/api/puantaj-smart-import-templates/${id}`, { method: "DELETE" });
}

export async function migratePuantajSmartImportTemplates(
  templates: SmartImportMappingTemplate[],
): Promise<MigrateResponse> {
  return apiClient<MigrateResponse>("/api/puantaj-smart-import-templates/migrate", {
    method: "POST",
    body: { templates },
  });
}
