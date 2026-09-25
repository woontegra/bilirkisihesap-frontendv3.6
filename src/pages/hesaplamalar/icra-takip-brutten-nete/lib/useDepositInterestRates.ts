import { useEffect, useState } from "react";
import { ApiError, apiClient } from "@/api/client";
import {
  DEPOSIT_INTEREST_BLOKE_MESSAGE,
  type DepositInterestRateInput,
} from "./interestCalculator";

type DepositRatesApiResponse = {
  success?: boolean;
  data?: { periods?: DepositInterestRateInput[] };
  message?: string;
};

export function useDepositInterestRates(params: {
  enabled: boolean;
  startDate: string;
  endDate: string;
  principal: number;
}): {
  periods: DepositInterestRateInput[];
  loading: boolean;
  error: string | null;
} {
  const { enabled, startDate, endDate, principal } = params;
  const [periods, setPeriods] = useState<DepositInterestRateInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setPeriods([]);
      setError(null);
      setLoading(false);
      return;
    }
    if (!startDate || !endDate || principal <= 0) {
      setPeriods([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const path = `/api/interest-rates/deposit?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;

    apiClient<DepositRatesApiResponse>(path)
      .then((data) => {
        if (cancelled) return;
        setPeriods(Array.isArray(data?.data?.periods) ? data.data!.periods! : []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPeriods([]);
        setError(err instanceof ApiError ? err.message : DEPOSIT_INTEREST_BLOKE_MESSAGE);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, startDate, endDate, principal]);

  return { periods, loading, error };
}
