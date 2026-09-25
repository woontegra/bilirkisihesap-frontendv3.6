import { useDeferredValue, useMemo } from "react";

/**
 * Ağır hesap motorları için: form state anında güncellenir, sonuç bir sonraki paint'te hesaplanır.
 * Motor formüllerine dokunmadan UI donmasını önler.
 */
export function useDeferredFormMemo<TForm, TResult>(
  form: TForm,
  compute: (form: TForm) => TResult,
): TResult {
  const deferredForm = useDeferredValue(form);
  return useMemo(() => compute(deferredForm), [deferredForm, compute]);
}
