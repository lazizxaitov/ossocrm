"use client";

import { useState } from "react";
import { createCategoryAction } from "@/app/(main)/categories/actions";

export function CreateCategoryModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Добавить категорию
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">Новая категория</h3>
            <p className="mt-1 text-xs text-slate-500">Заполните название и описание категории.</p>

            <form action={createCategoryAction} className="mt-4 grid gap-2">
              <input
                name="name"
                required
                placeholder="Название категории"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
              <textarea
                name="description"
                placeholder="Описание (необязательно)"
                className="min-h-24 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Создать
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
          </div>
        </div>
      ) : null}
    </>
  );
}
