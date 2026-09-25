import type { SavedCaseRecord } from "@/api/savedCases";
import { unwrapCalcData } from "../../shared/calcBackendCrud";

export function extractKidemBrutNet(record: SavedCaseRecord): { brut: number; net: number } {
  const payload = unwrapCalcData(record.data);
  const results = payload.results as Record<string, unknown> | undefined;
  const brut = Number(payload.brut_total ?? results?.brut ?? results?.brutKidem ?? 0);
  const net = Number(payload.net_total ?? results?.net ?? results?.netKidem ?? 0);
  return {
    brut: Number.isFinite(brut) ? brut : 0,
    net: Number.isFinite(net) ? net : 0,
  };
}

export function recordUpdatedAt(record: SavedCaseRecord): string {
  return String(record.createdAt ?? record.created_at ?? new Date().toISOString());
}
