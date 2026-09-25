import styles from "./Skeleton.module.css";

type Props = {
  height?: number | string;
  width?: number | string;
  radius?: number | string;
  className?: string;
};

export function Skeleton({ height = 16, width = "100%", radius = 8, className }: Props) {
  return (
    <div
      className={`${styles.skeleton} ${className ?? ""}`}
      style={{ height, width, borderRadius: radius }}
      aria-hidden
    />
  );
}
