import type { MonthRow, SummaryRow } from "./engine";
import type { EklentiGunEsasi } from "../shared/eklentiGunEsasi";
import { eklentiDokumleriAnahtari, type EklentiDokumleri } from "../shared/eklentiDokumu";

export const STORAGE_KEY = "bilirkisi-hesap-v35:bakiye-ucret-alacagi:cases:v1" as const;

export function newLocalId(prefix = "id"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export type ExtraItem = { id: string; label: string; value: string };

export type BakiyeForm = {
  startDate: string;
  endDate: string;
  resignDate: string;
  brut: string;
  extras: ExtraItem[];
  /** 12 aylık eklenti hesabının gün esası; eski kayıtlarda yoksa 360 */
  eklentiGunEsasi: EklentiGunEsasi;
  /** Kalem başına uygulanmış 12 aylık eklenti dökümü; eski kayıtlarda yok */
  eklentiDokumleri?: EklentiDokumleri;
};

export type BakiyeResults = {
  rows: SummaryRow[];
  monthRows: MonthRow[];
  totalAmount: number;
  monthly: number;
};

export type SavedCase = {
  id: string;
  name: string;
  savedAt: string;
  form: BakiyeForm;
  results: BakiyeResults;
};

export function createEmptyForm(): BakiyeForm {
  return {
    startDate: "",
    endDate: "",
    resignDate: "",
    brut: "",
    extras: [
      { id: newLocalId("extra"), label: "Prim", value: "" },
      { id: newLocalId("extra"), label: "İkramiye", value: "" },
      { id: newLocalId("extra"), label: "Yol", value: "" },
      { id: newLocalId("extra"), label: "Yemek", value: "" },
    ],
    eklentiGunEsasi: 360,
  };
}

export const NOTE_TEXT =
  "Belirli süreli iş sözleşmelerinde iş akdi süresinden önce sonlandırılır ise sözleşme sonuna kadar kararlaştırılan ücret bakiye ücret olarak talep edilebilir.";

export const snapshotKey = (form: BakiyeForm) => {
  const { eklentiDokumleri, ...rest } = form;
  return JSON.stringify({ ...rest, eklentiDokumleri: eklentiDokumleriAnahtari(eklentiDokumleri, form.extras) });
};
