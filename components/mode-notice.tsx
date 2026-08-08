import type { DataMode } from "@/lib/journal/types";

export function ModeNotice({ mode, message }: { mode: DataMode; message?: string }) {
  if (mode === "live" || !message) return null;

  return (
    <div className={`mode-notice mode-notice--${mode}`} role={mode === "error" ? "alert" : "status"}>
      <span>{mode === "preview" ? "Local preview" : "Unavailable"}</span>
      <p>{message}</p>
    </div>
  );
}
