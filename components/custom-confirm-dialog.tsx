"use client";

type CustomConfirmDialogProps = {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function CustomConfirmDialog({
  open,
  title = "Подтверждение",
  message,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
}: CustomConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/45 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <h4 className="text-base font-semibold text-slate-900">{title}</h4>
        <p className="mt-2 text-sm text-slate-700">{message}</p>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`rounded-lg px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${
              danger ? "bg-rose-700" : "bg-[var(--accent)]"
            }`}
          >
            {pending ? "Выполняется..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
