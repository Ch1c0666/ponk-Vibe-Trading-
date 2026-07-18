// ---------------------------------------------------------------------------
// AddCodeDialog — minimal dependency-free dialog for adding a code to a
// watchlist.  Follows the same portal + Escape pattern as ConfirmDialog.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

interface AddCodeDialogProps {
  open: boolean;
  market: "a" | "us";
  onAdd: (code: string, notes?: string) => void;
  onCancel: () => void;
}

export function AddCodeDialog({ open, market, onAdd, onCancel }: AddCodeDialogProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    // Reset form state every time the dialog opens.
    setCode("");
    setNotes("");
    setError("");
    inputRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const formatHint = market === "a" ? "e.g. 000000.SH" : "e.g. MOCK";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError(t("overview.watchlistCodeRequired"));
      return;
    }

    // Validate format.
    if (market === "a") {
      if (!/^\d{6}\.(SH|SZ|BJ)$/.test(trimmed)) {
        setError(t("overview.watchlistInvalidCode"));
        return;
      }
    } else {
      if (!/^[A-Z]{1,5}$/.test(trimmed)) {
        setError(t("overview.watchlistInvalidCode"));
        return;
      }
    }

    onAdd(trimmed, notes.trim() || undefined);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("overview.watchlistAddCodeTitle")}
        className="w-full max-w-sm rounded-lg border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-foreground">
          {t("overview.watchlistAddCodeTitle")}
        </h2>

        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
          {/* Code input */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t("overview.watchlistCodeLabel")}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(""); }}
              placeholder={formatHint}
              className="rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>

          {/* Notes input */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t("overview.watchlistNotesLabel")}
            </span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              placeholder={t("overview.watchlistNotesPlaceholder")}
              className="rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>

          {/* Error */}
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("overview.watchlistCancel")}
            </button>
            <button
              type="submit"
              aria-label={t("overview.watchlistAddCodeTitle")}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t("overview.watchlistAddConfirm")}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
