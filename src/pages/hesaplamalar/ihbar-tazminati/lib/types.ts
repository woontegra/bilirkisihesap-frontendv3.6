/**
 * İhbar Tazminatı — varyantlar arası paylaşılan tip tanımları (form/not/kayıt).
 * Yalnızca ihbar-tazminati modülü içinde paylaşılır.
 */

import type { ExtraItem } from "./core";

export type { ExtraItem };

export type IhbarFormBase = {
  startDate: string;
  endDate: string;
  brut: string;
  prim: string;
  ikramiye: string;
  yol: string;
  yemek: string;
  extras: ExtraItem[];
};

export type NoteBlock = { text: string; kind?: "heading" | "li"; emphasis?: "warning" };

export type IhbarResultSnapshot = {
  toplamBrut: number;
  brut: number;
  gelirVergisi: number;
  damgaVergisi: number;
  net: number;
};

export type CaseListEntry = {
  id: string;
  name: string;
  updatedAt: string;
  subtitle: string;
};
