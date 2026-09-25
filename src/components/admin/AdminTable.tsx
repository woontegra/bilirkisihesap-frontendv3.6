import type { ReactNode } from "react";
import styles from "./AdminTable.module.css";

type Column<T> = {
  key: string;
  header: string;
  hideOnMobile?: boolean;
  hideBelowMd?: boolean;
  render: (row: T) => ReactNode;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  empty?: ReactNode;
};

export function AdminTable<T>({ columns, rows, rowKey, empty }: Props<T>) {
  if (rows.length === 0) {
    return <div className={styles.emptyWrap}>{empty}</div>;
  }

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={
                  col.hideOnMobile
                    ? styles.hideSm
                    : col.hideBelowMd
                      ? styles.hideMd
                      : undefined
                }
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row)} style={{ animationDelay: `${80 + index * 30}ms` }}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={
                    col.hideOnMobile
                      ? styles.hideSm
                      : col.hideBelowMd
                        ? styles.hideMd
                        : undefined
                  }
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
