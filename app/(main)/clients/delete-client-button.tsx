"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CustomConfirmDialog } from "@/components/custom-confirm-dialog";

type DeleteClientButtonProps = {
  clientId: string;
  clientName: string;
};

export function DeleteClientButton({ clientId, clientName }: DeleteClientButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onConfirmDelete() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Не удалось удалить клиента.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Ошибка сети при удалении клиента.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
      >
        Удалить
      </button>
      {error ? <p className="mt-1 text-xs text-rose-700">{error}</p> : null}
      <CustomConfirmDialog
        open={open}
        title="Удаление клиента"
        message={`Удалить клиента «${clientName}»? Действие необратимо.`}
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        danger
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => void onConfirmDelete()}
      />
    </>
  );
}

