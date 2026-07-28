// Global toast host — mounted once in App. SPEC: "All errors surface as toasts,
// never blank screens." Toasts are removed from the store immediately (either
// by their auto-dismiss timer or the dismiss button) — this component keeps
// its own shadow list so a toast can play an exit animation for EXIT_MS
// before it actually disappears from the DOM, instead of being cut off by
// unmounting (codex §5/§6 "Add exit state before removal").
import { useEffect, useState } from "react";
import { useStudyLoopStore, type Toast } from "../state/store";
import { Icon, type IconName } from "../components/icons";
import styles from "./ToastHost.module.css";

const EXIT_MS = 140;

const KIND_ICON: Record<Toast["kind"], IconName> = {
  error: "close",
  info: "notifications",
  success: "check",
};

interface LocalToast extends Toast {
  state: "entering" | "idle" | "exiting";
}

export function ToastHost(): JSX.Element {
  const toasts = useStudyLoopStore((s) => s.toasts);
  const dismissToast = useStudyLoopStore((s) => s.dismissToast);
  const pauseToastTimer = useStudyLoopStore((s) => s.pauseToastTimer);
  const resumeToastTimer = useStudyLoopStore((s) => s.resumeToastTimer);
  const [local, setLocal] = useState<LocalToast[]>([]);

  useEffect(() => {
    setLocal((cur) => {
      const storeIds = new Set(toasts.map((t) => t.id));
      const curIds = new Set(cur.map((t) => t.id));

      const kept = cur.map((t) => (storeIds.has(t.id) || t.state === "exiting" ? t : { ...t, state: "exiting" as const }));
      const additions: LocalToast[] = toasts.filter((t) => !curIds.has(t.id)).map((t) => ({ ...t, state: "entering" }));

      return [...kept, ...additions];
    });
  }, [toasts]);

  useEffect(() => {
    const exiting = local.filter((t) => t.state === "exiting");
    if (exiting.length === 0) return undefined;
    const timers = exiting.map((t) =>
      setTimeout(() => setLocal((cur) => cur.filter((x) => x.id !== t.id)), EXIT_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [local]);

  useEffect(() => {
    const entering = local.filter((t) => t.state === "entering");
    if (entering.length === 0) return undefined;
    const raf = requestAnimationFrame(() =>
      setLocal((cur) => cur.map((t) => (t.state === "entering" ? { ...t, state: "idle" } : t)))
    );
    return () => cancelAnimationFrame(raf);
  }, [local]);

  if (local.length === 0) return <></>;

  return (
    <div className={styles.host} role="status" aria-live="polite">
      {local.map((toast) => (
        <div
          key={toast.id}
          className={`${styles.toast} ${styles[toast.kind]}`}
          data-state={toast.state}
          role={toast.kind === "error" ? "alert" : undefined}
          onMouseEnter={() => pauseToastTimer(toast.id)}
          onMouseLeave={() => resumeToastTimer(toast.id)}
          onFocus={() => pauseToastTimer(toast.id)}
          onBlur={() => resumeToastTimer(toast.id)}
        >
          <Icon name={KIND_ICON[toast.kind]} size={16} className={styles.icon} />
          <span className={styles.message}>{toast.message}</span>
          <button type="button" className={styles.dismiss} onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
