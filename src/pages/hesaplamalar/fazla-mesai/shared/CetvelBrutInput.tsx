import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";

/**
 * FM cetvel ücret hücresi — yazarken local draft; parent yalnız commit sonrası güncellenir.
 * "" (boş) blur/Enter → revert (son committed); "0" → gerçek 0 commit.
 */
export function CetvelBrutInput({
  className,
  value,
  onCommitBrut,
  ariaLabel = "Ücret",
}: {
  className?: string;
  value: number;
  onCommitBrut: (brut: number) => void;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(() => String(value));
  const focusedRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onCommitRef = useRef(onCommitBrut);
  onCommitRef.current = onCommitBrut;

  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value));
  }, [value]);

  const finishEdit = useCallback((raw: string) => {
    const trimmed = raw.trim();
    const committed = valueRef.current;

    // Boş = iptal / revert — gerçek 0 değildir.
    if (trimmed === "") {
      setDraft(String(committed));
      return;
    }

    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
      setDraft(String(committed));
      return;
    }

    setDraft(String(n));
    if (n === committed) return;
    onCommitRef.current(n);
  }, []);

  const onChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
  }, []);

  const onFocus = useCallback(() => {
    focusedRef.current = true;
  }, []);

  const onBlur = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      focusedRef.current = false;
      finishEdit(e.target.value);
    },
    [finishEdit],
  );

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  }, []);

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      aria-label={ariaLabel}
      value={draft}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  );
}
