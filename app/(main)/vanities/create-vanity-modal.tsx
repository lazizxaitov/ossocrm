"use client";

import { useState } from "react";
import { createVanityAction } from "@/app/(main)/vanities/actions";
import { CustomConfirmDialog } from "@/components/custom-confirm-dialog";

export function CreateVanityModal() {
  const [open, setOpen] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Добавить тумбу
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" onClick={() => setConfirmCloseOpen(true)}>
          <div className="w-full max-w-xl rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">Новая тумба</h3>
            <p className="mt-1 text-xs text-slate-500">Добавьте модель шкафа под раковину в каталог.</p>

            <form action={createVanityAction} className="mt-4 grid gap-2">
              <label className="text-xs text-slate-600">Модель тумбы</label>
              <input
                name="model"
                required
                placeholder="Например: S-120 Modern"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <label className="text-xs text-slate-600">Размер тумбы</label>
              <input
                name="size"
                required
                placeholder="Например: 120x45x80"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <label className="text-xs text-slate-600">Себестоимость (USD)</label>
              <input
                name="costPriceUSD"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="USD"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <label className="text-xs text-slate-600">Цена продажи (USD)</label>
              <input
                name="salePriceUSD"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="USD"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <label className="text-xs text-slate-600">Описание (необязательно)</label>
              <textarea
                name="description"
                placeholder="Описание модели"
                className="min-h-20 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <div className="mt-1 flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Создать
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmCloseOpen(true)}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      <CustomConfirmDialog
        open={confirmCloseOpen}
        title="Закрыть создание тумбы"
        message="Данные формы будут потеряны. Закрыть окно?"
        confirmLabel="Закрыть"
        cancelLabel="Остаться"
        danger
        onCancel={() => setConfirmCloseOpen(false)}
        onConfirm={() => {
          setConfirmCloseOpen(false);
          setOpen(false);
        }}
      />
    </>
  );
}
