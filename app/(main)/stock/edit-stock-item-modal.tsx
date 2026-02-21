"use client";

import { useState, useTransition } from "react";
import {
  deleteStockItemAction,
  type ManageStockItemState,
  updateStockItemAction,
} from "@/app/(main)/stock/actions";
import { CustomConfirmDialog } from "@/components/custom-confirm-dialog";

type EditStockItemModalProps = {
  itemId: string;
  productName: string;
  sku: string;
  quantity: number;
  salePriceUSD: number | null;
};

const INITIAL_STATE: ManageStockItemState = {
  error: null,
  success: null,
};

export function EditStockItemModal({ itemId, productName, sku, quantity, salePriceUSD }: EditStockItemModalProps) {
  const [open, setOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [localQuantity, setLocalQuantity] = useState(String(quantity));
  const [localSalePrice, setLocalSalePrice] = useState(
    salePriceUSD !== null && Number.isFinite(salePriceUSD) ? String(salePriceUSD) : "",
  );
  const [state, setState] = useState<ManageStockItemState>(INITIAL_STATE);

  function onSave() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", itemId);
      formData.set("quantity", localQuantity);
      formData.set("salePriceUSD", localSalePrice);
      const next = await updateStockItemAction(INITIAL_STATE, formData);
      setState(next);
      if (!next.error) {
        setOpen(false);
      }
    });
  }

  function onDeleteConfirmed() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", itemId);
      const next = await deleteStockItemAction(INITIAL_STATE, formData);
      setState(next);
      if (!next.error) {
        setConfirmDeleteOpen(false);
        setOpen(false);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setLocalQuantity(String(quantity));
          setLocalSalePrice(salePriceUSD !== null && Number.isFinite(salePriceUSD) ? String(salePriceUSD) : "");
          setState(INITIAL_STATE);
          setOpen(true);
        }}
        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Изменить
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4" onClick={() => !pending && setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">Изменение позиции склада</h3>
            <p className="mt-1 text-xs text-slate-500">{productName} · {sku}</p>

            <div className="mt-4 grid gap-2">
              <label className="grid gap-1 text-xs text-slate-600">
                Количество
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={localQuantity}
                  onChange={(event) => setLocalQuantity(event.target.value)}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-1 text-xs text-slate-600">
                Цена продажи за ед. (USD)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={localSalePrice}
                  onChange={(event) => setLocalSalePrice(event.target.value)}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  placeholder="Пусто = без цены"
                />
              </label>

              {state.error ? <p className="text-xs text-rose-600">{state.error}</p> : null}
              {state.success ? <p className="text-xs text-emerald-700">{state.success}</p> : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onSave}
                disabled={pending}
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? "Сохранение..." : "Сохранить"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={pending}
                className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Удалить
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <CustomConfirmDialog
        open={confirmDeleteOpen}
        title="Удаление позиции"
        message={`Удалить позицию \"${productName}\" из склада?`}
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        danger
        pending={pending}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={onDeleteConfirmed}
      />
    </>
  );
}
