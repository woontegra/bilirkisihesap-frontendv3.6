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
  formatValue,
  parseValue,
  liveGroup,
}: {
  className?: string;
  value: number;
  onCommitBrut: (brut: number) => void;
  ariaLabel?: string;
  /** Verilmezse mevcut davranış: String(value). */
  formatValue?: (value: number) => string;
  /** Verilmezse mevcut davranış: Number(raw). Geçersizse null. */
  parseValue?: (raw: string) => number | null;
  /** Yazarken binlik ayraç. Verilmezse taslak olduğu gibi kalır. */
  liveGroup?: "TRL" | "TRY";
}) {
  const formatRef = useRef(formatValue);
  formatRef.current = formatValue;
  const parseRef = useRef(parseValue);
  parseRef.current = parseValue;
  const show = (n: number) => (formatRef.current ? formatRef.current(n) : String(n));
  const read = (raw: string): number | null => {
    if (parseRef.current) return parseRef.current(raw);
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const [draft, setDraft] = useState(() => show(value));
  const focusedRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onCommitRef = useRef(onCommitBrut);
  onCommitRef.current = onCommitBrut;

  useEffect(() => {
    if (!focusedRef.current) setDraft(show(value));
  }, [value]);

  const finishEdit = useCallback((raw: string) => {
    const trimmed = raw.trim();
    const committed = valueRef.current;

    // Boş = iptal / revert — gerçek 0 değildir.
    if (trimmed === "") {
      setDraft(show(committed));
      return;
    }

    const n = read(trimmed);
    if (n == null) {
      setDraft(show(committed));
      return;
    }

    setDraft(show(n));
    if (n === committed) return;
    onCommitRef.current(n);
  }, []);

  const onChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (!liveGroup) {
      setDraft(e.target.value);
      return;
    }
    const input = e.target;
    const raw = input.value;
    const caret = input.selectionStart ?? raw.length;
    const before = raw.slice(0, caret);
    const digitCount = before.replace(/\D/g, "").length;
    let next = raw;
    if (liveGroup === "TRL") {
      const digits = raw.replace(/\D/g, "");
      next = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    } else {
      const cleaned = raw.replace(/[^\d,]/g, "");
      const comma = cleaned.indexOf(",");
      const intRaw = (comma >= 0 ? cleaned.slice(0, comma) : cleaned).replace(/\D/g, "");
      const fracRaw = comma >= 0 ? cleaned.slice(comma + 1).replace(/\D/g, "").slice(0, 2) : "";
      const grouped = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      next = comma >= 0 ? `${grouped},${fracRaw}` : grouped;
    }
    setDraft(next);
    requestAnimationFrame(() => {
      let seen = 0;
      let pos = next.length;
      for (let i = 0; i < next.length; i++) {
        if (/\d/.test(next[i])) seen += 1;
        if (seen >= digitCount) {
          pos = i + 1;
          break;
        }
      }
      input.setSelectionRange(pos, pos);
    });
  }, [liveGroup]);

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
