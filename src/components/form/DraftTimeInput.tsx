import { useDraftInputProps, type DraftInputProps } from "./useDraftField";

export function DraftTimeInput(props: DraftInputProps) {
  const inputProps = useDraftInputProps({ ...props, mode: "time", type: "time" });
  return <input {...inputProps} />;
}
