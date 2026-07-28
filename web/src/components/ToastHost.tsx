// Global toast host — mounted once in App. SPEC: "All errors surface as toasts,
// never blank screens."
import { useStudyLoopStore } from "../state/store";
import styles from "./ToastHost.module.css";

export function ToastHost(): JSX.Element {
  const toasts = useStudyLoopStore((s) => s.toasts);
  const dismissToast = useStudyLoopStore((s) => s.dismissToast);

  if (toasts.length === 0) return <></>;

  return (
    <div className={styles.host} role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`${styles.toast} ${styles[toast.kind]}`}>
          <span>{toast.message}</span>
          <button type="button" className={styles.dismiss} onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
