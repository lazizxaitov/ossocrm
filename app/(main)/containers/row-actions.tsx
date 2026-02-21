"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateContainerStatusAction } from "@/app/(main)/containers/actions";
import { CustomConfirmDialog } from "@/components/custom-confirm-dialog";
import { CustomDateInput } from "@/components/custom-date-input";
import { CustomSelect } from "@/components/custom-select";

type ContainerRowActionsProps = {
  containerId: string;
  containerName: string;
  status: "IN_TRANSIT" | "ARRIVED" | "CLOSED";
  canDelete: boolean;
};

type DeleteResponse = {
  ok?: boolean;
  error?: string;
};

export function ContainerRowActions({
  containerId,
  containerName,
  status,
  canDelete,
}: ContainerRowActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setConfirmDeleteOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  async function onDeleteConfirmed() {
    setDeletePending(true);
    setError("");
    try {
      const response = await fetch(`/api/containers/${containerId}`, { method: "DELETE" });
      const data = (await response.json()) as DeleteResponse;
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Не удалось удалить контейнер.");
        return;
      }
      setConfirmDeleteOpen(false);
      setOpen(false);
      router.refresh();
    } catch {
      setError("Ошибка сети при удалении контейнера.");
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Меню
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-[280px] rounded-xl border border-[var(--border)] bg-white p-2 shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
          <form action={updateContainerStatusAction} className="grid gap-2">
            <input type="hidden" name="containerId" value={containerId} />
            <CustomSelect
              name="status"
              defaultValue={status}
              buttonClassName="px-2 py-1.5 text-xs"
              options={[
                { value: "IN_TRANSIT", label: "В пути" },
                { value: "ARRIVED", label: "Прибыл" },
                { value: "CLOSED", label: "Закрыт" },
              ]}
            />
            <CustomDateInput name="arrivalDate" placeholder="Дата прибытия" />
            <button
              type="submit"
              className="rounded bg-[var(--accent)] px-2 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              Обновить статус
            </button>
          </form>

          {canDelete ? (
            <div className="mt-2 border-t border-[var(--border)] pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={deletePending}
                className="w-full rounded border border-rose-300 bg-rose-50 px-2 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletePending ? "Удаление..." : "Удалить контейнер"}
              </button>
            </div>
          ) : null}

          {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
        </div>
      ) : null}

      <CustomConfirmDialog
        open={confirmDeleteOpen}
        title="Удаление контейнера"
        message={`Удалить контейнер "${containerName}"? Это действие необратимо.`}
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        danger
        pending={deletePending}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => void onDeleteConfirmed()}
      />
    </div>
  );
}
