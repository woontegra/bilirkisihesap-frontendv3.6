import type { ReactNode } from "react";
import styles from "./MobileCards.module.css";

type Props = {
  children: ReactNode;
};

/** Mobil kart listesi — masaüstünde gizlenir. */
export function MobileCards({ children }: Props) {
  return <div className={styles.list}>{children}</div>;
}

type CardProps = {
  children: ReactNode;
  index?: number;
  onClick?: () => void;
};

export function MobileRecordCard({ children, index = 0, onClick }: CardProps) {
  const Tag = onClick ? "button" : "article";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={styles.card}
      style={{ animationDelay: `${70 + index * 40}ms` }}
      onClick={onClick}
    >
      {children}
    </Tag>
  );
}
