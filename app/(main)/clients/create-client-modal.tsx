"use client";

import { useState } from "react";
import { createClientAction } from "@/app/(main)/clients/actions";
import { CustomConfirmDialog } from "@/components/custom-confirm-dialog";

export function CreateClientModal() {
  const [open, setOpen] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  function requestClose() {
    setConfirmCloseOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Добавить клиента
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" onClick={requestClose}>
          <div className="w-full max-w-xl rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">Новый клиент</h3>
            <p className="mt-1 text-xs text-slate-500">Заполните данные клиента для добавления в базу.</p>

            <form action={createClientAction} className="mt-4 grid gap-2">
              <label className="text-xs text-slate-600">Имя клиента</label>
              <input
                name="name"
                required
                placeholder="Имя"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <label className="text-xs text-slate-600">Компания (необязательно)</label>
              <input
                name="company"
                placeholder="Компания"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <label className="text-xs text-slate-600">ИНН (необязательно)</label>
              <input
                name="inn"
                placeholder="ИНН"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <label className="text-xs text-slate-600">Телефон</label>
              <input
                name="phone"
                placeholder="Телефон"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <label className="text-xs text-slate-600">Кредитный лимит (USD, необязательно)</label>
              <input
                name="creditLimitUSD"
                type="number"
                step="0.01"
                min="0"
                placeholder="Кредитный лимит USD"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <label className="text-xs text-slate-600">Адрес (необязательно)</label>
              <textarea
                name="address"
                placeholder="Адрес"
                className="min-h-24 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <label className="text-xs text-slate-600">Комментарий (необязательно)</label>
              <textarea
                name="comment"
                placeholder="Комментарий к клиенту"
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
                  onClick={requestClose}
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
        title="Закрыть создание клиента"
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
