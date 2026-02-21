"use client";

import { useState, useTransition } from "react";
import { deletePendingInventorySessionAction } from "@/app/(main)/inventory-sessions/actions";
import { CustomConfirmDialog } from "@/components/custom-confirm-dialog";

type DeleteSessionButtonProps = {
  id: string;
  isConfirmed: boolean;
};

export function DeleteSessionButton({ id, isConfirmed }: DeleteSessionButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirmMessage = isConfirmed
    ? "Удалить подтвержденную инвентаризацию? Это действие необратимо."
    : "Удалить инвентаризацию?";

  function onConfirm() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", id);
      await deletePendingInventorySessionAction(formData);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Удаление..." : "Удалить"}
      </button>

      <CustomConfirmDialog
        open={open}
        title="Подтверждение удаления"
        message={confirmMessage}
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        danger
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={onConfirm}
      />
    </>
  );
}
