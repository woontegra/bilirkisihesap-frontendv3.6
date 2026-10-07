import {
  Component,
  createContext,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DependencyList,
  type ReactNode,
} from "react";
import { WageIncomeTaxError } from "../pages/hesaplamalar/shared/historical/wageDeductions";
import { runUserCalc } from "./userCalcGuard";

const reportWageInputError = createContext<(id: string, message: string | null) => void>(() => {});

type BoundaryProps = { resetKey: string; children: ReactNode };
type BoundaryState = { error: Error | null };

/** Memo dışına kaçan hesap hatası uygulamayı boşaltmaz. */
export class WageInputErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState | null {
    if (error instanceof Error) return { error };
    return null;
  }

  componentDidUpdate(prev: BoundaryProps) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) return <p role="alert">{this.state.error.message}</p>;
    return this.props.children;
  }
}

export function WageInputGuard({ resetKey, children }: { resetKey: string; children: ReactNode }) {
  const [messages, setMessages] = useState<Record<string, string>>({});
  const report = useCallback((id: string, message: string | null) => {
    setMessages((prev) => {
      if (message) {
        if (prev[id] === message) return prev;
        return { ...prev, [id]: message };
      }
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);
  const text = Object.values(messages)[0] ?? null;
  return (
    <reportWageInputError.Provider value={report}>
      {text ? <p role="alert">{text}</p> : null}
      <WageInputErrorBoundary resetKey={resetKey}>{children}</WageInputErrorBoundary>
    </reportWageInputError.Provider>
  );
}

function useGuardedCalc<T>(compute: () => T, deps: DependencyList): T {
  const report = useContext(reportWageInputError);
  const id = useId();
  const cache = useRef<{ result: T } | null>(null);
  const outcome = useMemo(() => runUserCalc(compute), deps);
  useEffect(() => {
    report(id, outcome.error);
    return () => report(id, null);
  }, [id, outcome.error, report]);
  if (outcome.error == null) {
    cache.current = { result: outcome.result as T };
    return outcome.result as T;
  }
  if (cache.current) return cache.current.result;
  throw new WageIncomeTaxError(outcome.error);
}

/** Form hesabı. Tarih yazılırken beklenen kesinti hatası ağacı düşürmez. */
export function useFormCalcMemo<T>(compute: () => T, deps: DependencyList): T {
  return useGuardedCalc(compute, deps);
}

/**
 * Ağır hesap motorları için: form state anında güncellenir, sonuç bir sonraki paint'te hesaplanır.
 * Motor formüllerine dokunmadan UI donmasını önler.
 */
export function useDeferredFormMemo<TForm, TResult>(
  form: TForm,
  compute: (form: TForm) => TResult,
): TResult {
  const deferredForm = useDeferredValue(form);
  return useGuardedCalc(() => compute(deferredForm), [deferredForm, compute]);
}
