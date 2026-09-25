/**
 * Kıdem formları — para alanlarını TR formatında gösterir.
 */

import { formatMoneyExtraValues, formatMoneyFieldValue } from "@/utils/moneyInput";

export function formatKidemMoneyFields<
  T extends {
    ciplakBrut?: string;
    prim?: string;
    ikramiye?: string;
    yol?: string;
    yemek?: string;
    diger?: string;
    extras?: Array<{ id: string; name: string; value: string }>;
  },
>(form: T): T {
  return {
    ...form,
    ciplakBrut: formatMoneyFieldValue(form.ciplakBrut),
    prim: formatMoneyFieldValue(form.prim),
    ikramiye: formatMoneyFieldValue(form.ikramiye),
    yol: formatMoneyFieldValue(form.yol),
    yemek: formatMoneyFieldValue(form.yemek),
    diger: formatMoneyFieldValue(form.diger),
    extras: form.extras ? formatMoneyExtraValues(form.extras) : form.extras,
  };
}
