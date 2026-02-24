"use client";

import { useState } from "react";
import { deleteCategoryAction, updateCategoryAction } from "@/app/(main)/categories/actions";
import { CustomConfirmDialog } from "@/components/custom-confirm-dialog";

type EditCategoryModalProps = {
  id: string;
  name: string;
  description: string | null;
};

export function EditCategoryModal({ id, name, description }: EditCategoryModalProps) {
  const [open, setOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-[var(--border)] px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Изменить
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setOpen(false)}>
          <article className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">Изменить категорию</h3>
            <form action={updateCategoryAction} className="mt-4 grid gap-2">
              <input type="hidden" name="id" value={id} />
              <input
                name="name"
                required
                defaultValue={name}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
              <textarea
                name="description"
                defaultValue={description ?? ""}
                placeholder="Описание (необязательно)"
                className="min-h-24 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
              <div className="mt-1 flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                >
                  Удалить
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
            <form id={`delete-category-${id}`} action={deleteCategoryAction} className="hidden">
              <input type="hidden" name="id" value={id} />
            </form>
          </article>
        </div>
      ) : null}

      <CustomConfirmDialog
        open={confirmDeleteOpen}
        title="Удалить категорию"
        message="Категория будет удалена без возможности восстановления."
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        danger
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => {
          setConfirmDeleteOpen(false);
          const form = document.getElementById(`delete-category-${id}`) as HTMLFormElement | null;
          form?.requestSubmit();
        }}
      />
    </>
  );
}
