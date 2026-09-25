import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from "react";
import { isValidCalendarYmd } from "@/utils/calendarYmd";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export type DraftFieldMode = "text" | "date" | "time" | "number";

export type UseDraftFieldOptions = {
  mode?: DraftFieldMode;
  /** Debounced commit while typing (date/time picker). 0 = blur/Enter only. */
  commitDebounceMs?: number;
};

export function useDraftField(
  committed: string,
  onCommit: (value: string) => void,
  options: UseDraftFieldOptions = {},
) {
  const { mode = "text", commitDebounceMs = mode === "text" || mode === "number" ? 0 : 150 } = options;
  const [draft, setDraft] = useState(committed);
  const focusedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const committedRef = useRef(committed);

  useEffect(() => {
    committedRef.current = committed;
    if (!focusedRef.current) setDraft(committed);
  }, [committed]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const rejectDateCommit = useCallback((raw: string): boolean => {
    if (raw === "") return false;
    if (!ISO_DATE_RE.test(raw)) return true;
    return !isValidCalendarYmd(raw);
  }, []);

  const flushCommit = useCallback(
    (raw: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
      if (raw === committedRef.current) return;
      if (mode === "date" && rejectDateCommit(raw)) {
        setDraft(committedRef.current);
        return;
      }
      if (mode === "time" && raw !== "" && !TIME_RE.test(raw)) return;
      onCommit(raw);
    },
    [mode, onCommit, rejectDateCommit],
  );

  const scheduleCommit = useCallback(
    (raw: string) => {
      if (commitDebounceMs <= 0) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => flushCommit(raw), commitDebounceMs);
    },
    [commitDebounceMs, flushCommit],
  );

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setDraft(raw);
      if (mode === "date" && (raw === "" || (ISO_DATE_RE.test(raw) && isValidCalendarYmd(raw)))) {
        scheduleCommit(raw);
        return;
      }
      if (mode === "time" && (raw === "" || TIME_RE.test(raw))) {
        scheduleCommit(raw);
      }
    },
    [mode, scheduleCommit],
  );

  const onBlur = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      focusedRef.current = false;
      flushCommit(e.target.value);
    },
    [flushCommit],
  );

  const onFocus = useCallback(() => {
    focusedRef.current = true;
  }, []);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  }, []);

  return { draft, setDraft, onChange, onBlur, onFocus, onKeyDown };
}

export type DraftInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange"> & {
  value: string;
  onCommit: (value: string) => void;
  mode?: DraftFieldMode;
  commitDebounceMs?: number;
};

export function useDraftInputProps({
  value,
  onCommit,
  mode = "text",
  commitDebounceMs,
  onBlur: externalOnBlur,
  onFocus: externalOnFocus,
  ...rest
}: DraftInputProps) {
  const field = useDraftField(value, onCommit, { mode, commitDebounceMs });
  return {
    ...rest,
    value: field.draft,
    onChange: field.onChange,
    onBlur: (e: FocusEvent<HTMLInputElement>) => {
      field.onBlur(e);
      externalOnBlur?.(e);
    },
    onFocus: (e: FocusEvent<HTMLInputElement>) => {
      field.onFocus();
      externalOnFocus?.(e);
    },
    onKeyDown: field.onKeyDown,
  };
}
