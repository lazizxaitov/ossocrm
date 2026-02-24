"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CustomConfirmDialog } from "@/components/custom-confirm-dialog";

type DeleteSaleButtonProps = {
  saleId: string;
  invoiceNumber: string;
};

export function DeleteSaleButton({ saleId, invoiceNumber }: DeleteSaleButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onConfirmDelete() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/sales/${saleId}`, { method: "DELETE" });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Не удалось удалить продажу.");
        return;
      }
      setOpen(false);
      router.push("/sales");
      router.refresh();
    } catch {
      setError("Ошибка сети при удалении продажи.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
      >
        Удалить продажу
      </button>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <CustomConfirmDialog
        open={open}
        title="Удаление продажи"
        message={`Удалить продажу ${invoiceNumber}? Действие необратимо.`}
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
