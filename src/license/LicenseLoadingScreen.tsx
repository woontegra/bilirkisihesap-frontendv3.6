import styles from "./LicenseLoadingScreen.module.css";

export function LicenseLoadingScreen() {
  return (
    <div className={styles.screen} role="status" aria-live="polite" aria-busy="true">
      <div className={styles.card}>
        <div className={styles.spinner} aria-hidden />
        <p className={styles.title}>Abonelik durumu kontrol ediliyor</p>
        <p className={styles.desc}>Hesaplama ekranları lisans doğrulanana kadar açılmaz.</p>
      </div>
    </div>
  );
}
