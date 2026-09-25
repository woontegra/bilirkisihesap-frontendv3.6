import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import styles from "./FilterBar.module.css";

type Props = {
  children: ReactNode;
  actions?: ReactNode;
  title?: string;
  collapsibleOnMobile?: boolean;
};

export function FilterBar({
  children,
  actions,
  title = "Filtreler",
  collapsibleOnMobile = true,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section className={styles.bar}>
      {collapsibleOnMobile ? (
        <button
          type="button"
          className={styles.mobileToggle}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span>{title}</span>
          <ChevronDown size={16} className={open ? styles.chevOpen : undefined} />
        </button>
      ) : null}

      <div className={`${styles.body} ${open || !collapsibleOnMobile ? styles.bodyOpen : ""}`}>
        <div className={styles.fields}>{children}</div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </section>
  );
}
