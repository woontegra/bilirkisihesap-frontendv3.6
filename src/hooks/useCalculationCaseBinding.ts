import { useEffect } from "react";
import { useCalculationTools } from "@/context/CalculationToolsContext";

/** Kayıtlı hesaplama açıkken not/etiket araçlarının doğru caseId ile çalışması için. */
export function useCalculationCaseBinding(activeCaseId: string | null | undefined): void {
  const { registerCaseId } = useCalculationTools();
  useEffect(() => {
    registerCaseId(activeCaseId);
  }, [activeCaseId, registerCaseId]);
}
