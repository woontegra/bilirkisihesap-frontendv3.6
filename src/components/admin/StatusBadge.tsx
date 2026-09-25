import clsx from "clsx";
import styles from "./StatusBadge.module.css";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

type Props = {
  children: string;
  tone?: Tone;
};

export function StatusBadge({ children, tone = "neutral" }: Props) {
  return <span className={clsx(styles.badge, styles[tone])}>{children}</span>;
}

export function statusToneFromRaw(raw?: string | null): Tone {
  const v = (raw || "").toLowerCase();
  if (["active", "aktif", "open", "resolved", "ok", "success"].some((x) => v.includes(x))) {
    return "success";
  }
  if (["trial", "demo", "pending", "in_progress", "warning"].some((x) => v.includes(x))) {
    return "warning";
  }
  if (["suspend", "passive", "pasif", "closed", "expired", "error", "danger", "urgent"].some((x) => v.includes(x))) {
    return "danger";
  }
  if (["admin", "professional", "yearly"].some((x) => v.includes(x))) {
    return "accent";
  }
  return "neutral";
}
