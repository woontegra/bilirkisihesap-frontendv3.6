import { useDraftInputProps, type DraftInputProps } from "./useDraftField";

export function DraftTextInput(props: DraftInputProps) {
  const inputProps = useDraftInputProps({ ...props, mode: "text", type: props.type ?? "text" });
  return <input {...inputProps} />;
}
