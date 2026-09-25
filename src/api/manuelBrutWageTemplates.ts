import { apiClient } from "@/api/client";
import type { ManuelBrutPeriodsMap, ManuelBrutTemplate } from "@/pages/araclar/manuel-brut-ucret/model";

type TemplatesResponse = {
  success?: boolean;
  templates?: ManuelBrutTemplate[];
  error?: string;
};

type TemplateResponse = {
  success?: boolean;
  template?: ManuelBrutTemplate;
  error?: string;
};

type MigrateResponse = {
  success?: boolean;
  migrated?: number;
  skipped?: number;
  templates?: ManuelBrutTemplate[];
  error?: string;
};

function unwrapList(data: TemplatesResponse | ManuelBrutTemplate[]): ManuelBrutTemplate[] {
  if (Array.isArray(data)) return data;
  return Array.isArray(data.templates) ? data.templates : [];
}

export async function listManuelBrutWageTemplates(): Promise<ManuelBrutTemplate[]> {
  const data = await apiClient<TemplatesResponse | ManuelBrutTemplate[]>(
    "/api/manuel-brut-wage-templates",
  );
  return unwrapList(data);
}

export async function createManuelBrutWageTemplate(input: {
  name: string;
  periods: ManuelBrutPeriodsMap;
}): Promise<ManuelBrutTemplate> {
  const data = await apiClient<TemplateResponse>("/api/manuel-brut-wage-templates", {
    method: "POST",
    body: input,
  });
  if (!data.template) throw new Error(data.error || "Şablon kaydedilemedi");
  return data.template;
}

export async function updateManuelBrutWageTemplate(
  id: string,
  input: { name: string; periods: ManuelBrutPeriodsMap },
): Promise<ManuelBrutTemplate> {
  const data = await apiClient<TemplateResponse>(`/api/manuel-brut-wage-templates/${id}`, {
    method: "PUT",
    body: input,
  });
  if (!data.template) throw new Error(data.error || "Şablon güncellenemedi");
  return data.template;
}

export async function deleteManuelBrutWageTemplate(id: string): Promise<void> {
  await apiClient(`/api/manuel-brut-wage-templates/${id}`, { method: "DELETE" });
}

export async function migrateManuelBrutWageTemplates(
  templates: ManuelBrutTemplate[],
): Promise<MigrateResponse> {
  return apiClient<MigrateResponse>("/api/manuel-brut-wage-templates/migrate", {
    method: "POST",
    body: { templates },
  });
}
