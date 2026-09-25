import { useDraftInputProps, type DraftInputProps } from "./useDraftField";

export function DraftNumberInput(props: DraftInputProps) {
  const inputProps = useDraftInputProps({ ...props, mode: "number", type: "number" });
  return <input {...inputProps} />;
}
