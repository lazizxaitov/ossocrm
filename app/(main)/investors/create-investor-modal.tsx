"use client";

import { useState } from "react";
import { createInvestorAction } from "@/app/(main)/investors/actions";
import { CustomConfirmDialog } from "@/components/custom-confirm-dialog";

export function CreateInvestorModal() {
  const [open, setOpen] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Добавить инвестора
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" onClick={() => setConfirmCloseOpen(true)}>
          <div className="w-full max-w-xl rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">Новый инвестор</h3>
            <p className="mt-1 text-xs text-slate-500">Добавление инвестора и привязка к учетной записи при необходимости.</p>

            <form action={createInvestorAction} className="mt-4 grid gap-2">
              <label className="text-xs text-slate-600">Имя инвестора</label>
              <input
                name="name"
                required
                placeholder="Имя инвестора"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <label className="text-xs text-slate-600">Телефон</label>
              <input
                name="phone"
                placeholder="Телефон"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <label className="text-xs text-slate-600">Логин пользователя Инвестор (необязательно)</label>
              <input
                name="login"
                placeholder="Логин инвестора"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
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
        title="Закрыть создание инвестора"
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
