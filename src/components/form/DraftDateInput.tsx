import { useDraftInputProps, type DraftInputProps } from "./useDraftField";

export function DraftDateInput(props: DraftInputProps) {
  const inputProps = useDraftInputProps({ ...props, mode: "date", type: "date" });
  return <input {...inputProps} />;
}
