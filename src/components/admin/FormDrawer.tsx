import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import styles from "./FormDrawer.module.css";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
};

export function FormDrawer({ open, title, description, children, footer, onClose }: Props) {
  if (!open) return null;

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.head}>
          <div>
            <h2 id="drawer-title" className={styles.title}>
              {title}
            </h2>
            {description ? <p className={styles.desc}>{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon" aria-label="Kapat" onClick={onClose}>
            <X size={18} />
          </Button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </aside>
    </div>
  );
}
