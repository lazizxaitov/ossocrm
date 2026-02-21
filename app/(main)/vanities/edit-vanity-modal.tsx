"use client";

import { useState } from "react";
import { deleteVanityAction, updateVanityAction } from "@/app/(main)/vanities/actions";

type EditVanityModalProps = {
  vanity: {
    id: string;
    model: string;
    size: string;
    costPriceUSD: number;
    salePriceUSD: number;
    description: string | null;
  };
};

export function EditVanityModal({ vanity }: EditVanityModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Изменить
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-xl rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">Изменить тумбу</h3>
            <p className="mt-1 text-xs text-slate-500">Редактирование модели шкафа под раковину.</p>

            <form action={updateVanityAction} className="mt-4 grid gap-2">
              <input type="hidden" name="id" value={vanity.id} />

              <label className="text-xs text-slate-600">Модель тумбы</label>
              <input
                name="model"
                required
                defaultValue={vanity.model}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <label className="text-xs text-slate-600">Размер тумбы</label>
              <input
                name="size"
                required
                defaultValue={vanity.size}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <label className="text-xs text-slate-600">Себестоимость (USD)</label>
              <input
                name="costPriceUSD"
                type="number"
                min="0.01"
                step="0.01"
                required
                defaultValue={vanity.costPriceUSD}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <label className="text-xs text-slate-600">Цена продажи (USD)</label>
              <input
                name="salePriceUSD"
                type="number"
                min="0.01"
                step="0.01"
                required
                defaultValue={vanity.salePriceUSD}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <label className="text-xs text-slate-600">Описание (необязательно)</label>
              <textarea
                name="description"
                defaultValue={vanity.description ?? ""}
                className="min-h-20 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Отмена
                </button>
              </div>
            </form>

            <form action={deleteVanityAction} className="mt-3 border-t border-[var(--border)] pt-3">
              <input type="hidden" name="id" value={vanity.id} />
              <button
                type="submit"
                className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
              >
                Удалить
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
